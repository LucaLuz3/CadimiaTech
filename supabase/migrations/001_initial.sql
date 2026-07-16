-- ============================================================
--  001_initial.sql — tabelas base do Treino Duo
--  Idempotente: seguro rodar de novo em um banco já existente.
--  (Conteúdo migrado do antigo supabase-schema.sql.)
-- ============================================================

-- 1) TABELAS -------------------------------------------------

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('isa','luca')),
  day_id text,
  exercise_name text not null,
  date date not null default current_date,
  sets jsonb not null default '[]'::jsonb,   -- [{ "weight": 40, "reps": 10, "warmup": false }, ...]
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.body_weights (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('isa','luca')),
  date date not null default current_date,
  weight numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('isa','luca')),
  date date not null default current_date,
  type text not null,
  value numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('isa','luca')),
  date date not null default current_date,
  pose text,
  path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_logs_person_ex on public.workout_logs (person, exercise_name);
create index if not exists idx_weights_person on public.body_weights (person);
create index if not exists idx_meas_person_type on public.measurements (person, type);
create index if not exists idx_photos_person on public.progress_photos (person);

-- 2) ROW LEVEL SECURITY -------------------------------------
-- Uma conta compartilhada: basta liberar para autenticados.

alter table public.workout_logs    enable row level security;
alter table public.body_weights    enable row level security;
alter table public.measurements    enable row level security;
alter table public.progress_photos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workout_logs' and policyname='auth all - logs') then
    create policy "auth all - logs" on public.workout_logs for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='body_weights' and policyname='auth all - weight') then
    create policy "auth all - weight" on public.body_weights for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='measurements' and policyname='auth all - meas') then
    create policy "auth all - meas" on public.measurements for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='progress_photos' and policyname='auth all - photos') then
    create policy "auth all - photos" on public.progress_photos for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 3) STORAGE (fotos de progresso) ----------------------------

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='auth read photos') then
    create policy "auth read photos" on storage.objects for select to authenticated using (bucket_id = 'progress-photos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='auth upload photos') then
    create policy "auth upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'progress-photos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='auth delete photos') then
    create policy "auth delete photos" on storage.objects for delete to authenticated using (bucket_id = 'progress-photos');
  end if;
end $$;
