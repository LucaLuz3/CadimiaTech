-- ============================================================
--  006_multitenant_expand.sql — estrutura multi-tenant (EXPAND)
--
--  Primeira das quatro migrações da F0:
--     006 expand    ← esta. Só ADICIONA. App continua rodando igual.
--     007 backfill  — preenche profile_id a partir de person.
--     008 lockdown  — RLS de verdade. Vai junto com o deploy do app novo.
--     009 contract  — dropa person. Irreversível, dias depois.
--
--  Idempotente: seguro rodar de novo.
--  NÃO altera nenhuma política, nenhum dado e nenhuma coluna existente.
--  Depois desta migração o app antigo funciona exatamente como antes.
--
--  Corrige de passagem três divergências que a introspecção de 13/09
--  revelou entre o banco de produção e o repo (ver seção 0).
-- ============================================================

-- 0) LIMPEZA DA DIVERGÊNCIA -----------------------------------
-- A introspecção mostrou pares de índices idênticos com nomes
-- diferentes: um veio da migração versionada, outro foi criado à mão
-- pelo SQL Editor antes dela. São redundantes — ocupam espaço e são
-- reescritos a cada INSERT. Mantemos o nome usado nas migrações.

drop index if exists public.uq_exercises_name;   -- gêmeo de idx_exercises_name
drop index if exists public.uq_plan_ex_active;   -- gêmeo de idx_plan_ex_unique_active

-- workout_logs.exercise_id existia ANTES do 002_catalog.sql. Como o 002
-- usa "add column if not exists", a coluna não foi criada — e a foreign key
-- que vinha junto na mesma instrução TAMBÉM não foi. Resultado: a coluna
-- existe há meses sem integridade referencial nenhuma.
--
-- Só criamos a FK se não houver órfão. Se houver, avisamos e seguimos:
-- migração de estrutura não é lugar de apagar dado de ninguém.
do $$
declare
  orfaos int;
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_logs_exercise_id_fkey'
       and conrelid = 'public.workout_logs'::regclass
  ) then
    select count(*) into orfaos
      from public.workout_logs wl
     where wl.exercise_id is not null
       and not exists (select 1 from public.exercises e where e.id = wl.exercise_id);

    if orfaos = 0 then
      alter table public.workout_logs
        add constraint workout_logs_exercise_id_fkey
        foreign key (exercise_id) references public.exercises(id) on delete set null;
      raise notice 'FK workout_logs.exercise_id criada.';
    else
      raise warning 'FK workout_logs.exercise_id NAO criada: % log(s) apontam para exercicio inexistente. Resolva e rode de novo.', orfaos;
    end if;
  end if;
end $$;

-- 1) PERFIS ---------------------------------------------------
-- Espelha auth.users porque não dá para adicionar coluna lá. Guarda o que
-- hoje está hardcoded em src/data/plans.js (nome, altura) e o que o motor
-- vai precisar na F1 (sexo e nascimento entram na equação de Ten-Haaf).
--
-- deleted_at existe para a janela de arrependimento de 30 dias antes da
-- exclusão definitiva via Edge Function (Apple 5.1.1(v) / Google).

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  sex          text check (sex in ('F','M','outro')),
  birth_date   date,
  height_cm    numeric check (height_cm > 0 and height_cm < 300),
  timezone     text not null default 'America/Sao_Paulo',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.profiles is
  'Um por usuário do auth. Criado pelo trigger on_auth_user_created.';

-- Trigger de criação. SECURITY DEFINER porque roda no contexto do signup,
-- antes de existir sessão. "on conflict do nothing" porque o auth do
-- Supabase já disparou evento duplicado neste projeto antes (ver o
-- comentário sobre a corrida do seed em 002_catalog.sql).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) DUPLA ----------------------------------------------------
-- Decisão v2 do plano de produto: solo é o produto, a dupla é camada
-- opcional de convite. Nada aqui é requisito para usar o app.

create table if not exists public.duos (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- share_enabled mora no MEMBRO, não na dupla: cada um decide se o outro
-- vê seus dados e pode desligar sem desfazer a dupla. Assimetria é
-- permitida de propósito.
create table if not exists public.duo_members (
  duo_id        uuid not null references public.duos(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  share_enabled boolean not null default true,
  joined_at     timestamptz not null default now(),
  primary key (duo_id, profile_id)
);

-- Um perfil pertence a no máximo UMA dupla. Trio não existe no produto;
-- deixar o schema permitir seria convidar o bug.
create unique index if not exists uq_duo_members_profile
  on public.duo_members (profile_id);

create table if not exists public.duo_invites (
  token       text primary key,
  duo_id      uuid not null references public.duos(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz
);

create index if not exists idx_duo_invites_duo on public.duo_invites (duo_id);

-- Quem é o parceiro de quem. Usada pelas políticas de RLS da 008 para
-- estender a LEITURA ao parceiro quando os dois lados permitem.
-- STABLE + SECURITY DEFINER: precisa enxergar duo_members sem ser barrada
-- pela própria RLS que ela ajuda a definir (senão vira recursão).
create or replace function public.duo_partner_ids(p_profile uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select outro.profile_id
    from public.duo_members meu
    join public.duo_members outro
      on outro.duo_id = meu.duo_id
     and outro.profile_id <> meu.profile_id
   where meu.profile_id = p_profile
     and meu.share_enabled      -- eu deixo o outro ver? (irrelevante aqui)
     and outro.share_enabled;   -- o outro deixa EU ver? (é o que importa)
$$;

-- 3) profile_id NAS TABELAS DE DADOS --------------------------
-- NULLABLE de propósito: a 007 preenche, a 008 torna NOT NULL.
-- O default auth.uid() faz o cliente parar de escolher o dono da linha —
-- a partir do deploy novo, db.js não manda mais profile_id em INSERT.

do $$
declare
  t text;
begin
  foreach t in array array[
    'workout_logs','body_weights','measurements',
    'progress_photos','plan_exercises','volume_targets'
  ] loop
    execute format(
      'alter table public.%I add column if not exists profile_id uuid references public.profiles(id) on delete cascade',
      t);
    execute format(
      'alter table public.%I alter column profile_id set default auth.uid()', t);
    execute format(
      'create index if not exists idx_%s_profile on public.%I (profile_id)', t, t);
  end loop;
end $$;

-- 4) DONO DO CATÁLOGO -----------------------------------------
-- null = catálogo global curado, visível para todos, editável por ninguém.
-- preenchido = exercício de um usuário, visível e editável só por ele.
-- Os 41 exercícios de hoje continuam globais (owner_id null).

alter table public.exercises
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade;

create index if not exists idx_exercises_owner on public.exercises (owner_id);

-- O índice único de nome precisa virar dois parciais, senão dois usuários
-- nunca conseguem criar "Rosca Direta" cada um no seu catálogo.
drop index if exists public.idx_exercises_name;

create unique index if not exists uq_exercises_name_global
  on public.exercises (name) where owner_id is null;

create unique index if not exists uq_exercises_name_owned
  on public.exercises (owner_id, name) where owner_id is not null;

-- 5) VERIFICAÇÃO ----------------------------------------------

do $$
declare
  faltando text;
begin
  select string_agg(t, ', ')
    into faltando
    from unnest(array[
      'workout_logs','body_weights','measurements',
      'progress_photos','plan_exercises','volume_targets'
    ]) as t
   where not exists (
     select 1 from information_schema.columns
      where table_schema='public' and table_name=t and column_name='profile_id'
   );

  if faltando is not null then
    raise exception '006 incompleta: profile_id ausente em %', faltando;
  end if;

  raise notice '006 OK. profiles/duos/duo_members/duo_invites criados, profile_id adicionado (nullable), catalogo com owner_id.';
  raise notice 'Proximo passo: Bela criar a conta dela, e SO DEPOIS rodar a 007.';
end $$;
