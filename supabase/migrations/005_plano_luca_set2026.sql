-- ============================================================
--  005_plano_luca_set2026.sql — full body A/B/C do Luca
--
--  Contexto (set/2026): reformulação completa do plano do Luca,
--  de split "peito/ombros/glúteo isolado" para full body 3x/semana
--  com um multiarticular pesado de base por sessão (agachamento,
--  terra convencional, leg press) + acessórios de hipertrofia.
--
--  Fundamentação:
--    · Volume: dose-resposta entre séries semanais e hipertrofia —
--      Schoenfeld, Ogborn & Krieger, J Sports Sci, 2017 (ganho
--      crescente até a faixa de 10+ séries/semana/músculo).
--    · Frequência: full body 3x permite acumular essa faixa de
--      volume por músculo com menos fadiga por sessão do que um
--      split 1x/semana — Schoenfeld et al., Sports Med, 2019
--      (frequência isolada não muda muito o resultado quando o
--      volume é igualado, mas facilita a distribuição do volume).
--    · Multiarticulares: eficientes para força E hipertrofia,
--      recrutam mais massa por série — Schoenfeld et al., Asian J
--      Sports Med, 2015.
--
--  Restrição do Luca: sem supino com barra, panturrilha em pé,
--  prancha, remada serrote (preferência dele).
--
--  Idempotente e SEGURO para o histórico (mesmo padrão da 004):
--    · placements que saem do plano viram active = false
--      (soft-delete, nunca delete);
--    · placements que continuam são atualizados no lugar
--      (mesmo id, mesmo exercise_id → logs e PRs intactos);
--    · rodar duas vezes = mesmo estado final.
-- ============================================================

-- 1) CATÁLOGO: garante que os exercícios novos existem -----------
-- Os que já existem (Agachamento Livre, Supino Reto com Halteres,
-- Remada Curvada com Barra, Cadeira Extensora, Elevação Lateral com
-- Halteres, Desenvolvimento com Halteres, Puxada Alta (pegada
-- aberta), Elevação de Pernas, Supino Inclinado com Halteres,
-- Levantamento Terra Romeno, Tríceps Pulley (corda), Rosca Direta
-- com Barra) ficam intactos via on conflict.

insert into public.exercises (name, muscles) values
  ('Levantamento Terra Convencional',       'Isquiotibiais, Glúteos, Quadríceps, Eretores'),
  ('Crucifixo Invertido (Peck Deck)',       'Deltoide Posterior, Trapézio Médio'),
  ('Panturrilha Sentada',                   'Sóleo'),
  ('Crossover na Máquina',                  'Peitoral'),
  ('Mesa Flexora (Leg Curl Deitado)',       'Isquiotibiais'),
  ('Leg Press',                             'Quadríceps, Glúteos'),
  ('Remada Baixa no Cabo (pegada neutra)',  'Dorsal, Trapézio Médio, Bíceps')
on conflict (name) do nothing;

-- 2) VÍNCULO EXERCÍCIO ↔ MÚSCULO (para o volume semanal) ---------
-- "do nothing" → não sobrescreve ajuste manual feito pela UI.

with m(ex_name, muscle_slug, role, contribution) as (values
  ('Levantamento Terra Convencional',       'isquiotibiais',      'primary',   1.0),
  ('Levantamento Terra Convencional',       'gluteos',            'primary',   1.0),
  ('Levantamento Terra Convencional',       'quadriceps',         'secondary', 0.5),
  ('Levantamento Terra Convencional',       'lombar',             'secondary', 0.5),
  ('Crucifixo Invertido (Peck Deck)',       'deltoide_posterior', 'primary',   1.0),
  ('Crucifixo Invertido (Peck Deck)',       'costas_media',       'secondary', 0.5),
  ('Panturrilha Sentada',                   'panturrilha',        'primary',   1.0),
  ('Crossover na Máquina',                  'peitoral',           'primary',   1.0),
  ('Mesa Flexora (Leg Curl Deitado)',       'isquiotibiais',      'primary',   1.0),
  ('Leg Press',                             'quadriceps',         'primary',   1.0),
  ('Leg Press',                             'gluteos',            'secondary', 0.5),
  ('Remada Baixa no Cabo (pegada neutra)',  'dorsais',            'primary',   1.0),
  ('Remada Baixa no Cabo (pegada neutra)',  'costas_media',       'secondary', 0.5),
  ('Remada Baixa no Cabo (pegada neutra)',  'biceps',             'secondary', 0.5)
)
insert into public.exercise_muscles (exercise_id, muscle_slug, role, contribution)
select e.id, m.muscle_slug, m.role, m.contribution::numeric
  from m
  join public.exercises e on e.name = m.ex_name
on conflict (exercise_id, muscle_slug) do nothing;

-- 3) PLANO ALVO ---------------------------------------------------

drop table if exists public.tmp_plano_luca;
create unlogged table public.tmp_plano_luca (
  day_id text, position int, ex_name text,
  sets text, reps text, rest text, rir text, note text, priority boolean
);

insert into public.tmp_plano_luca values
  -- A · Squat-dominante
  ('A', 0, 'Agachamento Livre',                       '4', '5–6',   '2–3 min',    '2 RIR', 'Multiarticular principal — base de força',                     true),
  ('A', 1, 'Supino Reto com Halteres',                '3', '6–8',   '2 min',      '2 RIR', 'Halteres em vez de barra — mais amplitude, menos estresse no ombro', false),
  ('A', 2, 'Remada Curvada com Barra',                '3', '6–8',   '2 min',      '2 RIR', '',                                                              false),
  ('A', 3, 'Cadeira Extensora',                       '3', '10–12', '60–90s',     '1 RIR', '',                                                              false),
  ('A', 4, 'Elevação Lateral com Halteres',           '3', '12–15', '45–60s',     '1 RIR', 'Reforço de volume — deltoide lateral',                         true),
  ('A', 5, 'Crucifixo Invertido (Peck Deck)',         '3', '12–15', '45–60s',     '1 RIR', 'Deltoide posterior — equilíbrio com tanto puxar',              false),
  ('A', 6, 'Panturrilha Sentada',                     '3', '12–15', '45s',        '1 RIR', 'Foco no sóleo',                                                 false),

  -- B · Hinge-dominante (terra convencional)
  ('B', 0, 'Levantamento Terra Convencional',         '4', '5–6',   '2–3 min',    '2 RIR', 'Multiarticular principal — cadeia posterior completa',         true),
  ('B', 1, 'Desenvolvimento com Halteres',            '3', '6–8',   '2 min',      '2 RIR', '',                                                              false),
  ('B', 2, 'Puxada Alta (pegada aberta)',             '3', '6–8',   '2 min',      '2 RIR', '',                                                              false),
  ('B', 3, 'Crossover na Máquina',                    '3', '12–15', '45–60s',     '1 RIR', 'Reforço de volume — peitoral',                                 true),
  ('B', 4, 'Mesa Flexora (Leg Curl Deitado)',         '3', '10–12', '60–90s',     '1 RIR', '',                                                              false),
  ('B', 5, 'Elevação Lateral com Halteres',           '3', '12–15', '45–60s',     '1 RIR', 'Reforço de volume — deltoide lateral',                         true),
  ('B', 6, 'Elevação de Pernas',                      '3', '12–15', '45s',        '1 RIR', 'Controle na descida',                                           false),

  -- C · Push/Pull equilibrado
  ('C', 0, 'Leg Press',                               '3', '8–10',  '2 min',      '2 RIR', '',                                                              false),
  ('C', 1, 'Supino Inclinado com Halteres',           '3', '8–10',  '90s–2 min',  '2 RIR', '',                                                              false),
  ('C', 2, 'Remada Baixa no Cabo (pegada neutra)',    '3', '8–10',  '90s',        '2 RIR', '',                                                              false),
  ('C', 3, 'Levantamento Terra Romeno',               '3', '8–10',  '90s',        '2 RIR', 'Stiff — foco no alongamento do posterior',                     false),
  ('C', 4, 'Elevação Lateral com Halteres',           '3', '12–15', '45–60s',     '1 RIR', 'Reforço de volume — deltoide lateral',                         true),
  ('C', 5, 'Tríceps Pulley (corda)',                  '3', '10–12', '60s',        '1 RIR', '',                                                              false),
  ('C', 6, 'Rosca Direta com Barra',                  '3', '8–12',  '60s',        '1 RIR', '',                                                              false);

-- Sanidade: todo nome do plano precisa existir no catálogo.
do $$
declare faltando text;
begin
  select string_agg(p.ex_name, ', ') into faltando
    from public.tmp_plano_luca p
   where not exists (select 1 from public.exercises e where e.name = p.ex_name);
  if faltando is not null then
    raise exception 'Exercícios ausentes no catálogo: %', faltando;
  end if;
end $$;

-- 4) SOFT-DELETE do que sai do plano ------------------------------
-- Diff dinâmico contra o que está ativo hoje pro Luca — cobre
-- qualquer drift entre o banco e src/data/plans.js.

update public.plan_exercises pe
   set active = false, updated_at = now()
  from public.exercises e
 where pe.person = 'luca'
   and pe.active
   and e.id = pe.exercise_id
   and not exists (
     select 1 from public.tmp_plano_luca p
      where p.day_id = pe.day_id and p.ex_name = e.name
   );

-- 5) UPSERT do plano -----------------------------------------------

insert into public.plan_exercises
  (person, day_id, exercise_id, position, sets, sets_n, reps, rest, rir, note, priority, active)
select 'luca', p.day_id, e.id, p.position,
       p.sets, nullif(substring(p.sets from '\d+'), '')::int,
       p.reps, p.rest, p.rir, nullif(p.note, ''), p.priority, true
  from public.tmp_plano_luca p
  join public.exercises e on e.name = p.ex_name
on conflict (person, day_id, exercise_id) where active do update
  set position   = excluded.position,
      sets       = excluded.sets,
      sets_n     = excluded.sets_n,
      reps       = excluded.reps,
      rest       = excluded.rest,
      rir        = excluded.rir,
      note       = excluded.note,
      priority   = excluded.priority,
      updated_at = now();

drop table if exists public.tmp_plano_luca;

-- 6) METAS DE VOLUME (aba Análise) ---------------------------------
-- Ajustadas para refletir a composição real do novo plano:
--   · glúteo perde o isolamento direto (hip thrust saiu) → alvo desce,
--     deixa de ser prioridade;
--   · quadríceps e isquiotibiais sobem (agacho+leg press+extensora /
--     terra+stiff+flexora) — não é mais "manutenção";
--   · panturrilha volta a ter alvo (panturrilha sentada).
-- Peitoral, deltoide lateral/anterior/posterior, dorsais, costas
-- média, tríceps e lombar continuam com os alvos da 003 (ainda
-- coerentes com o volume direto+indireto deste plano).

insert into public.volume_targets (person, muscle_slug, min_sets, max_sets, priority, note) values
  ('luca', 'gluteos',      6, 10, false, 'Sem isolamento direto agora (hip thrust saiu) — indireto do agacho/terra/leg press'),
  ('luca', 'quadriceps',  10, 14, false, 'Agacho + extensora + leg press — sobe naturalmente, não precisa reduzir'),
  ('luca', 'isquiotibiais', 8, 12, true,  'Terra convencional + stiff + mesa flexora — bem servido agora'),
  ('luca', 'panturrilha',  4,  8, false, 'Reintroduzida — panturrilha sentada, foco no sóleo'),
  ('luca', 'biceps',       8, 12, false, 'Só 1 isolamento direto (rosca) agora — resto é indireto de puxada/remadas'),
  ('luca', 'abdomen',      6, 10, false, 'Só 3 séries diretas (leg raise) — pode subir se quiser mais foco de core')
on conflict (person, muscle_slug) do update
  set min_sets   = excluded.min_sets,
      max_sets   = excluded.max_sets,
      priority   = excluded.priority,
      note       = excluded.note,
      updated_at = now();

-- 7) CONFERÊNCIA -----------------------------------------------------
-- Rode isto depois para ver o plano final:
--
--   select pe.day_id, pe.position, e.name, pe.sets, pe.reps, pe.rir
--     from plan_exercises pe join exercises e on e.id = pe.exercise_id
--    where pe.person = 'luca' and pe.active
--    order by pe.day_id, pe.position;
--
-- E o volume planejado vs. meta:
--
--   select v.muscle_slug, v.sets, t.min_sets, t.max_sets
--     from v_weekly_volume_planned v
--     join volume_targets t on t.person = v.person and t.muscle_slug = v.muscle_slug
--    where v.person = 'luca' order by v.sets desc;
