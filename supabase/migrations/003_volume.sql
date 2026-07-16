-- ============================================================
--  003_volume.sql — volume semanal por grupo muscular
--
--  Substitui o objeto `volumeData` hardcoded em src/data/plans.js
--  por volume computado a partir dos logs e do plano.
--
--  Idempotente. Os seeds usam "do nothing" nos vínculos para não
--  sobrescrever ajustes manuais feitos pela UI.
-- ============================================================

-- 1) TAXONOMIA ------------------------------------------------
-- Vocabulário fechado. `region` espelha as regiões do DXA
-- (braços / pernas / tronco) para permitir comparar séries por
-- região com massa magra por região.
--
-- Ressalva honesta sobre os deltoides: a linha de corte do DXA passa
-- pela articulação glenoumeral, então o deltoide fica repartido entre
-- braço e tronco. Classificamos como 'bracos' por convenção — a
-- comparação por região é indicativa, não uma equivalência exata.

create table if not exists public.muscle_groups (
  slug text primary key,
  label_pt text not null,
  region text not null check (region in ('bracos','pernas','tronco')),
  sort_order int not null default 0
);

insert into public.muscle_groups (slug, label_pt, region, sort_order) values
  ('deltoide_lateral',   'Deltoide lateral',        'bracos', 10),
  ('deltoide_posterior', 'Deltoide posterior',      'bracos', 20),
  ('deltoide_anterior',  'Deltoide anterior',       'bracos', 30),
  ('biceps',             'Bíceps',                  'bracos', 40),
  ('triceps',            'Tríceps',                 'bracos', 50),
  ('dorsais',            'Dorsais',                 'tronco', 60),
  ('costas_media',       'Costas média / trapézio', 'tronco', 70),
  ('peitoral',           'Peitoral',                'tronco', 80),
  ('abdomen',            'Abdômen / core',          'tronco', 90),
  ('lombar',             'Lombar / eretores',       'tronco', 100),
  ('quadriceps',         'Quadríceps',              'pernas', 110),
  ('isquiotibiais',      'Isquiotibiais',           'pernas', 120),
  ('gluteos',            'Glúteos',                 'pernas', 130),
  ('panturrilha',        'Panturrilha',             'pernas', 140)
on conflict (slug) do update
  set label_pt = excluded.label_pt,
      region = excluded.region,
      sort_order = excluded.sort_order;

-- 2) VÍNCULO EXERCÍCIO ↔ MÚSCULO ------------------------------
-- `contribution` é atributo DO VÍNCULO, não do exercício — por isso
-- tabela e não coluna text[] no catálogo.
--
-- Convenção de partida: primário = 1,0 · secundário = 0,5.
-- Isto é convenção de campo (Schoenfeld / Israetel), NÃO achado de
-- laboratório: não existe estudo validando o 0,5. Por isso é editável
-- por vínculo em vez de constante no código.

create table if not exists public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle_slug text not null references public.muscle_groups(slug) on delete cascade,
  role text not null check (role in ('primary','secondary')),
  contribution numeric not null default 1.0 check (contribution >= 0 and contribution <= 1),
  created_at timestamptz not null default now(),
  primary key (exercise_id, muscle_slug)
);

create index if not exists idx_ex_muscles_slug on public.exercise_muscles (muscle_slug);

-- 3) METAS DE VOLUME ------------------------------------------
-- Faixa (min–max), não um teto único: abaixo = subestímulo,
-- dentro = ok, acima = fadiga sem retorno proporcional.
-- Referência da dose-resposta: Schoenfeld, Ogborn & Krieger,
-- J Sports Sci, 2017.

create table if not exists public.volume_targets (
  person text not null check (person in ('isa','luca')),
  muscle_slug text not null references public.muscle_groups(slug) on delete cascade,
  min_sets numeric not null default 0,
  max_sets numeric not null default 0,
  priority boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  primary key (person, muscle_slug)
);

-- 4) sets_n: prescrição numérica --------------------------------
-- plan_exercises.sets é text ("4", "3"). Coluna derivada para poder somar.
-- Pega o PRIMEIRO grupo de dígitos: "4" → 4, "3-4" → 3, "4 séries" → 4.
-- (Remover todos os não-dígitos estaria errado: "3-4" viraria 34.)
-- Precisa casar com o setsToNumber() do src/lib/db.js.

alter table public.plan_exercises add column if not exists sets_n int;

update public.plan_exercises
   set sets_n = nullif(substring(coalesce(sets, '') from '\d+'), '')::int
 where sets_n is null;

-- 5) Backfill do vínculo dos logs antigos -----------------------
-- saveWorkoutLog tem fallback por exercise_name; logs criados antes do
-- refactor do catálogo podem estar sem exercise_id e ficariam invisíveis
-- para as views abaixo.

update public.workout_logs wl
   set exercise_id = e.id
  from public.exercises e
 where wl.exercise_id is null
   and wl.exercise_name = e.name;

-- 6) VIEWS ------------------------------------------------------
-- Séries de aquecimento (warmup = true no jsonb) NÃO contam como volume.
-- Registros antigos não têm a chave: coalesce trata ausência como false.

create or replace view public.v_weekly_volume_performed as
select
  wl.person,
  (date_trunc('week', wl.date))::date            as week_start,
  em.muscle_slug,
  sum(ws.n * em.contribution)                    as sets
from public.workout_logs wl
join lateral (
  select count(*)::numeric as n
    from jsonb_array_elements(wl.sets) as s
   where coalesce((s->>'warmup')::boolean, false) = false
) ws on true
join public.exercise_muscles em on em.exercise_id = wl.exercise_id
where wl.exercise_id is not null
group by wl.person, (date_trunc('week', wl.date))::date, em.muscle_slug;

create or replace view public.v_weekly_volume_planned as
select
  pe.person,
  em.muscle_slug,
  sum(coalesce(pe.sets_n, 0) * em.contribution) as sets
from public.plan_exercises pe
join public.exercise_muscles em on em.exercise_id = pe.exercise_id
where pe.active
group by pe.person, em.muscle_slug;

-- Exercícios do plano ainda sem mapeamento. Sem isto, o número mente por
-- omissão: um exercício não mapeado simplesmente não conta e ninguém vê.
create or replace view public.v_unmapped_exercises as
select distinct
  pe.person,
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

-- 7) RLS --------------------------------------------------------

alter table public.muscle_groups    enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.volume_targets   enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='muscle_groups' and policyname='auth all - muscle_groups') then
    create policy "auth all - muscle_groups" on public.muscle_groups for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exercise_muscles' and policyname='auth all - exercise_muscles') then
    create policy "auth all - exercise_muscles" on public.exercise_muscles for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='volume_targets' and policyname='auth all - volume_targets') then
    create policy "auth all - volume_targets" on public.volume_targets for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 8) SEED DOS VÍNCULOS ------------------------------------------
-- Casamento por NOME com o catálogo. O que não casar não é erro: aparece
-- em v_unmapped_exercises e é mapeado pela UI.
-- "do nothing" no conflito → re-rodar nunca sobrescreve ajuste manual.

with m(ex_name, muscle_slug, role, contribution) as (values
  ('Abdominal Inclinado',                  'abdomen',            'primary',   1.0),
  ('Agachamento Búlgaro',                  'gluteos',            'primary',   1.0),
  ('Agachamento Búlgaro',                  'quadriceps',         'primary',   1.0),
  ('Agachamento Búlgaro',                  'isquiotibiais',      'secondary', 0.5),
  ('Agachamento Livre',                    'quadriceps',         'primary',   1.0),
  ('Agachamento Livre',                    'gluteos',            'secondary', 0.5),
  ('Agachamento Livre',                    'lombar',             'secondary', 0.5),
  ('Arnold Press',                         'deltoide_anterior',  'primary',   1.0),
  ('Arnold Press',                         'deltoide_lateral',   'primary',   1.0),
  ('Arnold Press',                         'triceps',            'secondary', 0.5),
  ('Cadeira Extensora',                    'quadriceps',         'primary',   1.0),
  ('Cadeira Flexora (Leg Curl)',           'isquiotibiais',      'primary',   1.0),
  ('Crucifixo com Cabo (alto p/ baixo)',   'peitoral',           'primary',   1.0),
  ('Crucifixo com Cabo (baixo p/ alto)',   'peitoral',           'primary',   1.0),
  ('Crucifixo com Cabo (baixo p/ alto)',   'deltoide_anterior',  'secondary', 0.5),
  ('Desenvolvimento com Halteres',         'deltoide_anterior',  'primary',   1.0),
  ('Desenvolvimento com Halteres',         'deltoide_lateral',   'secondary', 0.5),
  ('Desenvolvimento com Halteres',         'triceps',            'secondary', 0.5),
  ('Elevação Lateral com Halteres',        'deltoide_lateral',   'primary',   1.0),
  ('Elevação de Pernas',                   'abdomen',            'primary',   1.0),
  ('Elevação de Pernas Suspenso',          'abdomen',            'primary',   1.0),
  ('Face Pull com Corda',                  'deltoide_posterior', 'primary',   1.0),
  ('Face Pull com Corda',                  'costas_media',       'primary',   1.0),
  ('Hip Thrust com Barra',                 'gluteos',            'primary',   1.0),
  ('Hip Thrust com Barra',                 'isquiotibiais',      'secondary', 0.5),
  ('Levantamento Terra Romeno',            'isquiotibiais',      'primary',   1.0),
  ('Levantamento Terra Romeno',            'gluteos',            'primary',   1.0),
  ('Levantamento Terra Romeno',            'lombar',             'secondary', 0.5),
  ('Prancha com Elevação de Braço',        'abdomen',            'primary',   1.0),
  ('Puxada Alta (pegada aberta)',          'dorsais',            'primary',   1.0),
  ('Puxada Alta (pegada aberta)',          'costas_media',       'secondary', 0.5),
  ('Puxada Alta (pegada aberta)',          'biceps',             'secondary', 0.5),
  ('Puxada Alta (pegada supinada)',        'dorsais',            'primary',   1.0),
  ('Puxada Alta (pegada supinada)',        'biceps',             'secondary', 0.5),
  ('Remada Cavalinho (Chest-Supported)',   'dorsais',            'primary',   1.0),
  ('Remada Cavalinho (Chest-Supported)',   'costas_media',       'primary',   1.0),
  ('Remada Cavalinho (Chest-Supported)',   'deltoide_posterior', 'secondary', 0.5),
  ('Remada Cavalinho (Chest-Supported)',   'biceps',             'secondary', 0.5),
  ('Remada Cavalinho / Chest-Supported',   'dorsais',            'primary',   1.0),
  ('Remada Cavalinho / Chest-Supported',   'costas_media',       'primary',   1.0),
  ('Remada Cavalinho / Chest-Supported',   'deltoide_posterior', 'secondary', 0.5),
  ('Remada Cavalinho / Chest-Supported',   'biceps',             'secondary', 0.5),
  ('Remada Curvada com Barra',             'dorsais',            'primary',   1.0),
  ('Remada Curvada com Barra',             'costas_media',       'primary',   1.0),
  ('Remada Curvada com Barra',             'biceps',             'secondary', 0.5),
  ('Remada Curvada com Barra',             'lombar',             'secondary', 0.5),
  ('Remada com Halter (unilateral)',       'dorsais',            'primary',   1.0),
  ('Remada com Halter (unilateral)',       'costas_media',       'secondary', 0.5),
  ('Remada com Halter (unilateral)',       'biceps',             'secondary', 0.5),
  ('Rosca Direta com Barra',               'biceps',             'primary',   1.0),
  ('Rosca Martelo (Hammer Curl)',          'biceps',             'primary',   1.0),
  ('Rosca Martelo no Cabo',                'biceps',             'primary',   1.0),
  ('Rosca Scott com Halteres',             'biceps',             'primary',   1.0),
  ('Supino Inclinado com Halteres',        'peitoral',           'primary',   1.0),
  ('Supino Inclinado com Halteres',        'deltoide_anterior',  'secondary', 0.5),
  ('Supino Inclinado com Halteres',        'triceps',            'secondary', 0.5),
  ('Supino Reto com Halteres',             'peitoral',           'primary',   1.0),
  ('Supino Reto com Halteres',             'deltoide_anterior',  'secondary', 0.5),
  ('Supino Reto com Halteres',             'triceps',            'secondary', 0.5),
  ('Tríceps Francês (Skull Crusher)',      'triceps',            'primary',   1.0),
  ('Tríceps Overhead no Cabo',             'triceps',            'primary',   1.0),
  ('Tríceps Pulley (corda)',               'triceps',            'primary',   1.0)
)
insert into public.exercise_muscles (exercise_id, muscle_slug, role, contribution)
select e.id, m.muscle_slug, m.role, m.contribution::numeric
  from m
  join public.exercises e on e.name = m.ex_name
on conflict (exercise_id, muscle_slug) do nothing;

-- 9) SEED DAS METAS ---------------------------------------------
-- ISA: metas derivadas do DXA de 10/07/2026 (ALMI 6,48 kg/m²; braços com
-- 4,22 kg de magra = 24,8% da massa apendicular). O limitante é massa
-- magra de membro superior, não gordura → deltoide lateral e dorsais
-- sobem, glúteos/posterior descem para faixa de manutenção.
-- LUCA: migração das metas que estavam no volumeData.

insert into public.volume_targets (person, muscle_slug, min_sets, max_sets, priority, note) values
  ('isa', 'deltoide_lateral',   12, 16, true,  'Ponto fraco no DXA — volume alto, baixa fadiga'),
  ('isa', 'dorsais',            12, 16, true,  'Massa magra de membro superior é o limitante'),
  ('isa', 'costas_media',        8, 12, true,  null),
  ('isa', 'deltoide_posterior',  8, 12, true,  null),
  ('isa', 'biceps',              8, 12, true,  null),
  ('isa', 'triceps',             8, 12, true,  null),
  ('isa', 'peitoral',            8, 12, false, null),
  ('isa', 'quadriceps',         10, 12, false, 'Manutenção — já bem servido'),
  ('isa', 'gluteos',            10, 14, false, 'Reduzido: recebia estímulo nos 3 dias'),
  ('isa', 'isquiotibiais',       8, 12, false, null),
  ('isa', 'abdomen',             6, 10, false, null),
  ('isa', 'lombar',              4,  8, false, 'Volume indireto do terra/agachamento basta'),
  ('isa', 'deltoide_anterior',   4,  8, false, 'Já recebe volume indireto dos empurrar'),
  ('isa', 'panturrilha',         0,  6, false, null),
  ('luca', 'peitoral',          12, 16, true,  null),
  ('luca', 'deltoide_lateral',  12, 16, true,  null),
  ('luca', 'deltoide_anterior',  8, 12, true,  null),
  ('luca', 'deltoide_posterior', 8, 12, true,  null),
  ('luca', 'gluteos',           10, 14, true,  null),
  ('luca', 'biceps',            10, 14, true,  null),
  ('luca', 'abdomen',            8, 12, true,  null),
  ('luca', 'dorsais',            8, 12, false, null),
  ('luca', 'costas_media',       6, 10, false, null),
  ('luca', 'isquiotibiais',      6, 10, false, null),
  ('luca', 'quadriceps',         6, 10, false, 'Manutenção — já forte'),
  ('luca', 'triceps',            6, 10, false, null),
  ('luca', 'lombar',             4,  8, false, null),
  ('luca', 'panturrilha',        0,  4, false, 'Removido — já forte, não sobrecarregar')
on conflict (person, muscle_slug) do nothing;
