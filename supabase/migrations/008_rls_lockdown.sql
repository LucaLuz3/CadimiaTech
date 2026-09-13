-- ============================================================
--  008_rls_lockdown.sql — RLS de verdade (LOCKDOWN)
--
--  ORDEM CORRIGIDA (13/09). A spec original dizia que esta migração
--  tinha de ir junto com o deploy do app, com indisponibilidade. Não
--  precisa: o app novo lê por profile_id, que a 007 já preencheu, e
--  funciona com a RLS permissiva de hoje. Então:
--
--     1. deploy do app novo   ← primeiro
--     2. conferir que os dois perfis funcionam
--     3. ESTA migração        ← só depois
--     4. 009_contract, dias depois
--
--  Rodar isto ANTES do deploy derruba o app antigo, que ainda consulta
--  por `person`.
--
--  Idempotente: as políticas são dropadas e recriadas.
--
--  Fecha os quatro achados:
--    1  fotos de progresso legíveis e apagáveis por qualquer autenticado
--    2  setExerciseMuscles reescrevendo o volume de todo mundo
--    3  todas as políticas em using(true)
--    4  muscle_groups apagável, com cascade para vínculos e metas
--  E mais um, que só apareceu escrevendo o app: as quatro tabelas
--  criadas na 006 ficaram SEM RLS nenhuma.
-- ============================================================

-- 0) PRÉ-CONDIÇÃO ---------------------------------------------
-- Sem backfill completo, tornar profile_id NOT NULL quebraria tudo.

do $$
declare n int;
begin
  select (select count(*) from public.workout_logs    where profile_id is null)
       + (select count(*) from public.body_weights    where profile_id is null)
       + (select count(*) from public.measurements    where profile_id is null)
       + (select count(*) from public.progress_photos where profile_id is null)
       + (select count(*) from public.plan_exercises  where profile_id is null)
       + (select count(*) from public.volume_targets  where profile_id is null)
    into n;
  if n > 0 then
    raise exception 'A 007 nao terminou: % linha(s) sem profile_id. Rode a 007 antes desta.', n;
  end if;
end $$;

-- 1) FUNÇÕES DE APOIO -----------------------------------------
-- SECURITY DEFINER para não entrar em recursão: a política de
-- duo_members precisa saber qual é a minha dupla, e descobrir isso
-- lendo duo_members com RLS ligada se morderia pelo rabo.

create or replace function public.my_duo_id()
returns uuid language sql stable security definer set search_path = public as $$
  select duo_id from public.duo_members where profile_id = auth.uid() limit 1;
$$;

-- Perfis cujos dados eu posso LER: o meu, mais o do parceiro que
-- deixou. Note o `outro.share_enabled` — quem decide se eu vejo é ele,
-- não eu.
create or replace function public.readable_profile_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select auth.uid()
  union
  select outro.profile_id
    from public.duo_members meu
    join public.duo_members outro
      on outro.duo_id = meu.duo_id and outro.profile_id <> meu.profile_id
   where meu.profile_id = auth.uid()
     and outro.share_enabled;
$$;

grant execute on function public.my_duo_id()           to authenticated;
grant execute on function public.readable_profile_ids() to authenticated;
grant execute on function public.duo_partner_ids(uuid)  to authenticated;

-- 2) ACEITE DE CONVITE ----------------------------------------
-- Precisa ser função: quem aceita ainda não é membro, logo não enxerga
-- a dupla para se inserir nela. O `for update` no token é a trava
-- contra corrida — o mesmo cuidado que o seed precisou quando o
-- onAuthStateChange do Supabase disparou duas vezes no login.

create or replace function public.accept_duo_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_duo uuid;
  v_me  uuid := auth.uid();
  v_n   int;
begin
  if v_me is null then raise exception 'Não autenticado.'; end if;

  select duo_id into v_duo
    from public.duo_invites
   where token = p_token
     and accepted_by is null
     and expires_at > now()
     for update;

  if v_duo is null then raise exception 'Convite inválido ou expirado.'; end if;

  if exists (select 1 from public.duo_members where profile_id = v_me and duo_id <> v_duo) then
    raise exception 'Você já está em outra dupla. Desfaça a atual antes.';
  end if;

  select count(*) into v_n from public.duo_members where duo_id = v_duo;
  if v_n >= 2 and not exists (select 1 from public.duo_members where duo_id = v_duo and profile_id = v_me) then
    raise exception 'Essa dupla já está completa.';
  end if;

  insert into public.duo_members (duo_id, profile_id)
  values (v_duo, v_me)
  on conflict do nothing;

  update public.duo_invites
     set accepted_by = v_me, accepted_at = now()
   where token = p_token;

  return v_duo;
end $$;

grant execute on function public.accept_duo_invite(text) to authenticated;

-- 3) LIMPEZA DAS POLÍTICAS ANTIGAS ----------------------------
-- Todas as oito eram `for all to authenticated using (true)`.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where (schemaname = 'public' and tablename in (
             'workout_logs','body_weights','measurements','progress_photos',
             'plan_exercises','volume_targets','exercises','exercise_muscles',
             'muscle_groups','profiles','duos','duo_members','duo_invites'))
        -- os nomes antigos E os que esta própria migração cria, para que
        -- rodar a 008 duas vezes não estoure em "policy already exists"
        or (schemaname = 'storage' and tablename = 'objects'
            and (policyname in ('auth read photos','auth upload photos','auth delete photos')
                 or policyname like 'fotos:%'))
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 4) RLS LIGADA EM TUDO ---------------------------------------
-- As quatro tabelas da 006 nasceram sem RLS. Em Supabase isso significa
-- acesso total por qualquer autenticado via PostgREST.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','duos','duo_members','duo_invites',
    'workout_logs','body_weights','measurements','progress_photos',
    'plan_exercises','volume_targets','exercises','exercise_muscles','muscle_groups'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 5) PERFIS ---------------------------------------------------

create policy "perfil: leio o meu e o do parceiro" on public.profiles
  for select to authenticated
  using (id in (select public.readable_profile_ids()));

create policy "perfil: edito só o meu" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Sem INSERT nem DELETE: quem cria é o trigger on_auth_user_created,
-- quem apaga é o cascade de auth.users.

-- 6) DUPLA ----------------------------------------------------

create policy "dupla: vejo a minha" on public.duos
  for select to authenticated using (id = public.my_duo_id());

create policy "dupla: crio a minha" on public.duos
  for insert to authenticated with check (true);

-- Sair da dupla desfaz a dupla — sem parceiro, dupla de um não é nada.
create policy "dupla: desfaço a minha" on public.duos
  for delete to authenticated using (id = public.my_duo_id());

create policy "membros: vejo os da minha dupla" on public.duo_members
  for select to authenticated using (duo_id = public.my_duo_id());

-- Só entro numa dupla vazia por aqui; entrar numa dupla de outro é
-- exclusividade do accept_duo_invite.
create policy "membros: entro como eu mesmo" on public.duo_members
  for insert to authenticated with check (profile_id = auth.uid());

create policy "membros: mudo só o meu compartilhamento" on public.duo_members
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "membros: saio eu mesmo" on public.duo_members
  for delete to authenticated using (profile_id = auth.uid());

create policy "convites: vejo os que criei" on public.duo_invites
  for select to authenticated using (created_by = auth.uid());

create policy "convites: crio para a minha dupla" on public.duo_invites
  for insert to authenticated
  with check (created_by = auth.uid() and duo_id = public.my_duo_id());

create policy "convites: apago os meus" on public.duo_invites
  for delete to authenticated using (created_by = auth.uid());

-- 7) TABELAS DE DADOS -----------------------------------------
-- Padrão: LEIO o meu e o do parceiro que compartilha; ESCREVO só o meu.
-- O `with check (profile_id = auth.uid())` é o que impede gravar linha
-- em nome do parceiro mesmo estando na tela dele.

do $$
declare t text;
begin
  foreach t in array array[
    'workout_logs','body_weights','measurements',
    'progress_photos','plan_exercises','volume_targets'
  ] loop
    execute format($f$
      create policy "%1$s: leio meu e do parceiro" on public.%1$I
        for select to authenticated
        using (profile_id in (select public.readable_profile_ids()));

      create policy "%1$s: insiro só como eu" on public.%1$I
        for insert to authenticated
        with check (profile_id = auth.uid());

      create policy "%1$s: altero só o meu" on public.%1$I
        for update to authenticated
        using (profile_id = auth.uid()) with check (profile_id = auth.uid());

      create policy "%1$s: apago só o meu" on public.%1$I
        for delete to authenticated
        using (profile_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- 8) CATÁLOGO -------------------------------------------------
-- Achado 2. Global (owner_id null) é legível por todos e editável por
-- ninguém; quem quiser mapeamento próprio cria uma cópia sua.

create policy "exercicios: vejo global e os meus" on public.exercises
  for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

create policy "exercicios: crio os meus" on public.exercises
  for insert to authenticated with check (owner_id = auth.uid());

create policy "exercicios: altero só os meus" on public.exercises
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "exercicios: apago só os meus" on public.exercises
  for delete to authenticated using (owner_id = auth.uid());

-- Vínculo muscular herda o dono do exercício. É isto que impede um
-- usuário de mudar o volume calculado de todos os outros.
create policy "vinculos: leio todos" on public.exercise_muscles
  for select to authenticated using (true);

create policy "vinculos: escrevo só nos meus exercicios" on public.exercise_muscles
  for all to authenticated
  using (exists (select 1 from public.exercises e
                  where e.id = exercise_muscles.exercise_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.exercises e
                       where e.id = exercise_muscles.exercise_id and e.owner_id = auth.uid()));

-- 9) TAXONOMIA ------------------------------------------------
-- Achado 4: era `for all`, e as FKs de exercise_muscles e
-- volume_targets são ON DELETE CASCADE. Um delete aqui apagava
-- vínculos e metas de todo mundo. Taxonomia muda por migração.

create policy "musculos: só leitura" on public.muscle_groups
  for select to authenticated using (true);

-- 10) STORAGE -------------------------------------------------
-- Achado 1. Resolve o dono por JOIN com progress_photos, não por
-- prefixo do caminho — assim os objetos legados em `isa/…` continuam
-- válidos sem mover arquivo nenhum.

create policy "fotos: leio as minhas" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.progress_photos p
                 where p.path = storage.objects.name and p.profile_id = auth.uid())
  );

-- No upload a linha em progress_photos ainda não existe, então a
-- verificação é pelo prefixo do caminho: o app grava em <uid>/arquivo.jpg.
create policy "fotos: subo na minha pasta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "fotos: apago as minhas" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      exists (select 1 from public.progress_photos p
               where p.path = storage.objects.name and p.profile_id = auth.uid())
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

-- 11) VIEWS POR PERFIL ----------------------------------------
-- security_invoker = on: a view respeita a RLS de quem consulta, então
-- não precisa de filtro próprio.
--
-- DROP antes de recriar, não "create or replace": a coluna `person` vira
-- `profile_id`, e o Postgres recusa renomear coluna de view com replace
-- ("cannot change name of view column"). Nada se perde — view não
-- guarda dado.

drop view if exists public.v_weekly_volume_performed;
drop view if exists public.v_weekly_volume_planned;
drop view if exists public.v_unmapped_exercises;

create view public.v_weekly_volume_performed as
select
  wl.profile_id,
  (date_trunc('week', wl.date))::date as week_start,
  em.muscle_slug,
  sum(ws.n * em.contribution)         as sets
from public.workout_logs wl
join lateral (
  select count(*)::numeric as n
    from jsonb_array_elements(wl.sets) as s
   where coalesce((s->>'warmup')::boolean, false) = false
) ws on true
join public.exercise_muscles em on em.exercise_id = wl.exercise_id
where wl.exercise_id is not null
group by wl.profile_id, (date_trunc('week', wl.date))::date, em.muscle_slug;

create view public.v_weekly_volume_planned as
select
  pe.profile_id,
  em.muscle_slug,
  sum(coalesce(pe.sets_n, 0) * em.contribution) as sets
from public.plan_exercises pe
join public.exercise_muscles em on em.exercise_id = pe.exercise_id
where pe.active
group by pe.profile_id, em.muscle_slug;

create view public.v_unmapped_exercises as
select distinct
  pe.profile_id,
  e.id   as exercise_id,
  e.name as exercise_name,
  e.muscles
from public.plan_exercises pe
join public.exercises e on e.id = pe.exercise_id
where pe.active
  and not exists (select 1 from public.exercise_muscles em where em.exercise_id = e.id);

alter view public.v_weekly_volume_performed set (security_invoker = on);
alter view public.v_weekly_volume_planned   set (security_invoker = on);
alter view public.v_unmapped_exercises      set (security_invoker = on);

grant select on public.v_weekly_volume_performed to authenticated;
grant select on public.v_weekly_volume_planned   to authenticated;
grant select on public.v_unmapped_exercises      to authenticated;

-- 12) NOT NULL ------------------------------------------------
-- Última coisa: a partir daqui é impossível criar linha órfã.

do $$
declare t text;
begin
  foreach t in array array[
    'workout_logs','body_weights','measurements',
    'progress_photos','plan_exercises','volume_targets'
  ] loop
    execute format('alter table public.%I alter column profile_id set not null', t);
  end loop;
end $$;

-- 13) CONFERÊNCIA VISÍVEL -------------------------------------
-- O SQL Editor do Supabase não mostra RAISE NOTICE, então a migração
-- termina devolvendo o estado em tabela.
--
-- A primeira seção checa a janela de risco da 007b: entre aquela
-- migração e o deploy, o app antigo ainda gravava pela conta
-- compartilhada, e o `default auth.uid()` podia carimbar o dono errado.
-- Qualquer linha em que `person` e `profile_id` discordem aparece aqui.

with ids as (
  select '70b40be1-7797-4322-958c-63fa080eaa80'::uuid as bela,
         '14f6dfe3-45ad-4aff-8af2-84326ec631dd'::uuid as luca
),
divergencia as (
  select 'workout_logs' as t, count(*) as n from public.workout_logs, ids
    where person is not null
      and profile_id <> (case person when 'isa' then ids.bela else ids.luca end)
  union all
  select 'body_weights', count(*) from public.body_weights, ids
    where person is not null
      and profile_id <> (case person when 'isa' then ids.bela else ids.luca end)
  union all
  select 'measurements', count(*) from public.measurements, ids
    where person is not null
      and profile_id <> (case person when 'isa' then ids.bela else ids.luca end)
  union all
  select 'plan_exercises', count(*) from public.plan_exercises, ids
    where person is not null
      and profile_id <> (case person when 'isa' then ids.bela else ids.luca end)
)
select * from (
  select 0 as ord, 'divergencia dono' as tipo, t as item,
         case when n = 0 then '✅ nenhuma' else '⚠️ ' || n || ' linha(s) — me avise' end as detalhe
    from divergencia

  union all
  select 1, 'politicas na tabela', tablename, count(*)::text
    from pg_policies where schemaname = 'public'
   group by tablename

  union all
  select 2, 'politicas storage', 'progress-photos', count(*)::text
    from pg_policies where schemaname = 'storage' and tablename = 'objects'

  union all
  select 3, 'rls ligada', t,
         case when (select relrowsecurity from pg_class where oid = ('public.'||t)::regclass)
              then '✅ sim' else '❌ NAO' end
    from unnest(array['profiles','duos','duo_members','duo_invites','workout_logs',
                      'body_weights','measurements','progress_photos','plan_exercises',
                      'volume_targets','exercises','exercise_muscles','muscle_groups']) as t

  union all
  select 4, 'funcao', p.proname, '✅ ok'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('my_duo_id','readable_profile_ids','accept_duo_invite','duo_partner_ids')

  union all
  select 5, 'view por profile_id', c.relname,
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name=c.relname
                              and column_name='profile_id')
              then '✅ ok' else '❌ FALTANDO' end
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='v'
) v order by ord, item;
