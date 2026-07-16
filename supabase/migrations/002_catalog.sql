-- ============================================================
--  002_catalog.sql — catálogo de exercícios + placements
--
--  ATENÇÃO: estas tabelas JÁ EXISTEM no banco de produção — foram
--  criadas direto pelo SQL Editor e nunca versionadas. Esta migração
--  reconstrói a mesma estrutura de forma idempotente, para que o repo
--  volte a reproduzir o banco. Rodar em produção é NO-OP.
--
--  Se algum "add column if not exists" aqui de fato criar uma coluna,
--  é sinal de que prod e repo tinham divergido mais do que se supunha.
-- ============================================================

-- 1) CATÁLOGO ------------------------------------------------
-- Um exercício é um objeto de primeira classe. O id é a identidade
-- estável: os logs apontam para ele. Renomear é seguro.

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscles text,                 -- rótulo de EXIBIÇÃO, texto livre. A semântica
                                -- de volume vive em exercise_muscles (003).
  media_url text,
  instructions text,
  tips text,
  equipment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nome único: evita dois registros para o mesmo movimento (o addCatalogExercise
-- do db.js depende disto para devolver o existente em vez de duplicar).
create unique index if not exists idx_exercises_name on public.exercises (name);

-- 2) PLACEMENTS ----------------------------------------------
-- Onde um exercício do catálogo entra no plano de alguém, e com qual
-- prescrição. Trocar o exercise_id = trocar o movimento sem misturar
-- históricos.

create table if not exists public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('isa','luca')),
  day_id text not null,
  exercise_id uuid references public.exercises(id) on delete restrict,
  position int not null default 0,
  sets text,
  reps text,
  rest text,
  rir text,
  note text,
  priority boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Guarda contra a corrida do seed: o auth do Supabase dispara mais de uma
-- vez no login e chegou a duplicar exercícios. O índice parcial garante que
-- o mesmo movimento não entre duas vezes no mesmo dia do mesmo perfil.
create unique index if not exists idx_plan_ex_unique_active
  on public.plan_exercises (person, day_id, exercise_id)
  where active;

create index if not exists idx_plan_ex_person_day
  on public.plan_exercises (person, day_id, position);

-- 3) VÍNCULO DOS LOGS AO CATÁLOGO ----------------------------

alter table public.workout_logs
  add column if not exists exercise_id uuid references public.exercises(id) on delete set null;

create index if not exists idx_logs_person_exid on public.workout_logs (person, exercise_id);

-- 4) RLS ------------------------------------------------------

alter table public.exercises      enable row level security;
alter table public.plan_exercises enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exercises' and policyname='auth all - exercises') then
    create policy "auth all - exercises" on public.exercises for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plan_exercises' and policyname='auth all - plan_exercises') then
    create policy "auth all - plan_exercises" on public.plan_exercises for all to authenticated using (true) with check (true);
  end if;
end $$;
