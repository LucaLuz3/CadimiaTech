-- ============================================================
--  TREINO DUO — Schema do Supabase
--  Cole TODO este arquivo no SQL Editor do Supabase e clique RUN.
--  (Painel Supabase > SQL Editor > New query)
-- ============================================================

-- 1) TABELAS -------------------------------------------------

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('isa','luca')),
  day_id text,
  exercise_name text not null,
  date date not null default current_date,
  sets jsonb not null default '[]'::jsonb,   -- [{ "weight": 40, "reps": 10 }, ...]
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

-- índices úteis
create index if not exists idx_logs_person_ex on public.workout_logs (person, exercise_name);
create index if not exists idx_weights_person on public.body_weights (person);
create index if not exists idx_meas_person_type on public.measurements (person, type);
create index if not exists idx_photos_person on public.progress_photos (person);

-- 2) ROW LEVEL SECURITY -------------------------------------
-- Como vocês usam UMA conta compartilhada, basta liberar para
-- usuários autenticados. Ninguém sem o login consegue ler/gravar.

alter table public.workout_logs   enable row level security;
alter table public.body_weights   enable row level security;
alter table public.measurements   enable row level security;
alter table public.progress_photos enable row level security;

create policy "auth all - logs"   on public.workout_logs    for all to authenticated using (true) with check (true);
create policy "auth all - weight" on public.body_weights    for all to authenticated using (true) with check (true);
create policy "auth all - meas"   on public.measurements    for all to authenticated using (true) with check (true);
create policy "auth all - photos" on public.progress_photos for all to authenticated using (true) with check (true);

-- 3) STORAGE (fotos de progresso) ----------------------------
-- Bucket privado para as fotos.

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

-- Políticas de storage: somente autenticados acessam o bucket.
create policy "auth read photos"   on storage.objects for select to authenticated using (bucket_id = 'progress-photos');
create policy "auth upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'progress-photos');
create policy "auth delete photos" on storage.objects for delete to authenticated using (bucket_id = 'progress-photos');

-- ============================================================
--  PRONTO. Depois disto:
--  1. Authentication > Providers > Email: deixe ATIVADO.
--  2. Authentication > Sign In / Providers (ou Settings):
--     DESATIVE "Allow new users to sign up" depois de criar a
--     conta de vocês, para ninguém mais conseguir se cadastrar.
--  3. Crie 1 usuário em Authentication > Users > "Add user"
--     (e-mail + senha que vocês dois vão usar). Marque como
--     auto-confirmado para não precisar confirmar e-mail.
-- ============================================================
