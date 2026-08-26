-- ============================================================
--  004_plano_isa_ago2026.sql — realocação do A/B/C da Isa
--
--  Contexto (ago/2026): tirzepatida (Mounjaro) há ~6 semanas,
--  58,6 kg (DXA 10/07) → 57,5 kg. No SURMOUNT-1 (Look et al.,
--  Diabetes Obes Metab, 2025) ~25% do peso perdido foi massa
--  magra; o objetivo do plano é ser a exceção. Prioridades:
--  glúteos e bíceps sobem, tríceps vai a manutenção (6 séries
--  diretas + indireto de supino/desenvolvimento), quadríceps cai.
--
--  Idempotente e SEGURO para o histórico:
--    · placements que saem do plano viram active = false
--      (soft-delete, nunca delete);
--    · placements que continuam são atualizados no lugar
--      (mesmo id, mesmo exercise_id → logs e PRs intactos);
--    · exercícios que mudam de dia (ex.: Tríceps Overhead C→B)
--      ganham placement novo mas apontam para o MESMO
--      exercises.id — o histórico segue junto;
--    · rodar duas vezes = mesmo estado final.
-- ============================================================

-- 1) CATÁLOGO: garante que os exercícios existem ----------------
-- Nome único (idx_exercises_name) → on conflict (name) do nothing.
-- Os que já existem (do seed ou de edições pela UI) ficam intactos.

insert into public.exercises (name, muscles) values
  ('Rosca Inclinada com Halteres',          'Bíceps (cabeça longa — alongada)'),
  ('Remada Curvada (pegada aberta)',        'Deltoide Post., Trapézio Méd., Dorsal'),
  ('Abdução de Quadril (cabo ou máquina)',  'Glúteo Médio'),
  ('Desenvolvimento com Halteres',          'Deltoide Médio e Ant., Tríceps'),
  ('Elevação Lateral com Halteres',         'Deltoide Médio'),
  ('Rosca Scott Máquina',                   'Bíceps (cabeça curta)'),
  ('Crucifixo Máquina',                     'Peitoral')
on conflict (name) do nothing;

-- 2) VÍNCULO EXERCÍCIO ↔ MÚSCULO (para o volume semanal) ---------
-- Inclui Rosca Scott Máquina e Crucifixo Máquina, que foram criados
-- pela UI depois do seed da 003 e estavam em v_unmapped_exercises.
-- "do nothing" → não sobrescreve ajuste manual feito pela UI.

with m(ex_name, muscle_slug, role, contribution) as (values
  ('Rosca Inclinada com Halteres',         'biceps',             'primary',   1.0),
  ('Remada Curvada (pegada aberta)',       'deltoide_posterior', 'primary',   1.0),
  ('Remada Curvada (pegada aberta)',       'costas_media',       'primary',   1.0),
  ('Remada Curvada (pegada aberta)',       'dorsais',            'secondary', 0.5),
  ('Remada Curvada (pegada aberta)',       'biceps',             'secondary', 0.5),
  ('Abdução de Quadril (cabo ou máquina)', 'gluteos',            'primary',   1.0),
  ('Desenvolvimento com Halteres',         'deltoide_anterior',  'primary',   1.0),
  ('Desenvolvimento com Halteres',         'deltoide_lateral',   'secondary', 0.5),
  ('Desenvolvimento com Halteres',         'triceps',            'secondary', 0.5),
  ('Elevação Lateral com Halteres',        'deltoide_lateral',   'primary',   1.0),
  ('Rosca Scott Máquina',                  'biceps',             'primary',   1.0),
  ('Crucifixo Máquina',                    'peitoral',           'primary',   1.0)
)
insert into public.exercise_muscles (exercise_id, muscle_slug, role, contribution)
select e.id, m.muscle_slug, m.role, m.contribution::numeric
  from m
  join public.exercises e on e.name = m.ex_name
on conflict (exercise_id, muscle_slug) do nothing;

-- 3) PLANO ALVO -------------------------------------------------
-- Tabela de trabalho = "fonte da verdade" desta migração. É uma tabela
-- comum (não TEMP) de propósito: o SQL Editor do Supabase passa pelo
-- pooler e cada statement pode cair num backend diferente, então uma
-- temp table some entre um comando e outro. Ela é apagada no fim.

drop table if exists public.tmp_plano_isa;
create unlogged table public.tmp_plano_isa (
  day_id text, position int, ex_name text,
  sets text, reps text, rest text, rir text, note text, priority boolean
);

insert into public.tmp_plano_isa values
  -- A · Glúteos · Costas · Bíceps
  ('A', 0, 'Hip Thrust com Barra',                 '4', '8–10',   '2 min',   '1 RIR', 'Sessão pesada — pausa de 1s no topo',                                 true),
  ('A', 1, 'Agachamento Livre',                    '3', '8–10',   '2–3 min', '2 RIR', 'Profundo — amplitude máxima, glúteo alongado',                        false),
  ('A', 2, 'Puxada Alta (pegada supinada)',        '3', '10–12',  '2 min',   '2 RIR', 'Pegada supinada maximiza recrutamento de bíceps',                     false),
  ('A', 3, 'Remada Curvada (pegada aberta)',       '3', '10–12',  '2 min',   '2 RIR', 'Cotovelos abertos — deltoide posterior + trapézio médio',             false),
  ('A', 4, 'Rosca Direta com Barra',               '4', '8–10',   '90s',     '1 RIR', 'Ponto fraco — carga progressiva',                                     true),
  ('A', 5, 'Rosca Inclinada com Halteres',         '3', '10–12',  '90s',     '1 RIR', 'Banco 45–60° — bíceps na posição alongada (Pedrosa et al., 2023)',    true),
  ('A', 6, 'Abdominal Inclinado',                  '3', '10–12',  '60s',     '1 RIR', 'Carga progressiva',                                                   false),

  -- B · Posterior · Empurrar · Tríceps
  ('B', 0, 'Levantamento Terra Romeno',            '4', '8–10',   '2–3 min', '2 RIR', 'Excêntrico lento (3s) — stretch hypertrophy',                         true),
  ('B', 1, 'Cadeira Flexora (Leg Curl)',           '3', '12–15',  '90s',     '1 RIR', 'Pausa de 1s na contração',                                            false),
  ('B', 2, 'Supino Inclinado com Halteres',        '3', '8–10',   '2 min',   '2 RIR', 'Angulação 30°',                                                       false),
  ('B', 3, 'Desenvolvimento com Halteres',         '3', '10–12',  '2 min',   '2 RIR', 'Ombro é limitante no DXA — amplitude completa',                       true),
  ('B', 4, 'Elevação Lateral com Halteres',        '3', '12–15',  '60s',     '1 RIR', 'Deltoide médio responde bem a volume',                                true),
  ('B', 5, 'Rosca Martelo (Hammer Curl)',          '3', '10–12',  '90s',     '1 RIR', 'Braquial + braquiorradial',                                           true),
  ('B', 6, 'Tríceps Overhead no Cabo',             '3', '12–15',  '90s',     '1 RIR', 'Cabeça longa alongada — ~1,5× mais hipertrofia (Maeo et al., 2023)',  false),
  ('B', 7, 'Elevação de Pernas Suspenso',          '3', '12–15',  '60s',     '1 RIR', 'Controle na descida',                                                 false),

  -- C · Unilateral · Glúteo Médio · Bíceps
  ('C', 0, 'Agachamento Búlgaro',                  '3', '10–12',  '2 min',   '2 RIR', 'Começar pela perna ESQUERDA (assimetria DXA)',                        true),
  ('C', 1, 'Hip Thrust com Barra',                 '3', '10–12',  '2 min',   '1 RIR', '2ª sessão — pausa de 2s no topo',                                     true),
  ('C', 2, 'Abdução de Quadril (cabo ou máquina)', '3', '15–20',  '60s',     '1 RIR', 'Glúteo médio — forma lateral do quadril',                             true),
  ('C', 3, 'Remada Cavalinho / Chest-Supported',   '3', '10–12',  '90s',     '2 RIR', '',                                                                    false),
  ('C', 4, 'Rosca Scott Máquina',                  '3', '10–12',  '90s',     '1 RIR', 'Pode ir à falha',                                                     true),
  ('C', 5, 'Tríceps Francês (Skull Crusher)',      '3', '10–12',  '90s',     '1 RIR', 'Cabeça longa — amplitude máxima',                                     false),
  ('C', 6, 'Abdominal Inclinado',                  '3', '8–12',   '60s',     '1 RIR', 'Carga progressiva',                                                   false);

-- Sanidade: todo nome do plano precisa existir no catálogo. Se não
-- existir, a migração aborta AQUI, antes de mexer em qualquer placement.
do $$
declare faltando text;
begin
  select string_agg(p.ex_name, ', ') into faltando
    from public.tmp_plano_isa p
   where not exists (select 1 from public.exercises e where e.name = p.ex_name);
  if faltando is not null then
    raise exception 'Exercícios ausentes no catálogo: %', faltando;
  end if;
end $$;

-- 4) SOFT-DELETE do que sai do plano ----------------------------
-- (Tríceps Pulley, Cadeira Extensora, Crucifixo Máquina, e os
--  placements de exercícios que mudaram de dia.)

update public.plan_exercises pe
   set active = false, updated_at = now()
  from public.exercises e
 where pe.person = 'isa'
   and pe.active
   and e.id = pe.exercise_id
   and not exists (
     select 1 from public.tmp_plano_isa p
      where p.day_id = pe.day_id and p.ex_name = e.name
   );

-- 5) UPSERT do plano ---------------------------------------------
-- Conflito no índice parcial (person, day_id, exercise_id) where active
-- → atualiza a prescrição no lugar, preservando o id do placement.
-- sets_n usa a mesma regra do setsToNumber() do db.js (primeiro grupo
-- de dígitos).

insert into public.plan_exercises
  (person, day_id, exercise_id, position, sets, sets_n, reps, rest, rir, note, priority, active)
select 'isa', p.day_id, e.id, p.position,
       p.sets, nullif(substring(p.sets from '\d+'), '')::int,
       p.reps, p.rest, p.rir, nullif(p.note, ''), p.priority, true
  from public.tmp_plano_isa p
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

drop table if exists public.tmp_plano_isa;

-- 6) METAS DE VOLUME (aba Análise) ------------------------------
-- Reflete as prioridades de agora. Aqui é "do update" de propósito:
-- as metas da 003 foram derivadas do DXA de julho e agora mudam.
-- Só as linhas listadas são tocadas.

insert into public.volume_targets (person, muscle_slug, min_sets, max_sets, priority, note) values
  ('isa', 'gluteos',           14, 16, true,  'Prioridade — hip thrust 2×/sem + alongado + glúteo médio'),
  ('isa', 'biceps',            12, 15, true,  'Prioridade — menor massa magra relativa no DXA'),
  ('isa', 'triceps',            6,  9, false, 'Manutenção — indireto de supino/desenvolvimento'),
  ('isa', 'quadriceps',         6,  8, false, 'Reduzido para liberar sessão para glúteo'),
  ('isa', 'deltoide_lateral',   8, 12, true,  'Limitante no DXA'),
  ('isa', 'deltoide_posterior', 6, 10, false, null),
  ('isa', 'dorsais',            8, 12, false, null),
  ('isa', 'peitoral',           4,  8, false, 'Não prioritário — supino inclinado + indireto'),
  ('isa', 'isquiotibiais',      8, 12, false, null),
  ('isa', 'abdomen',            6, 10, false, null)
on conflict (person, muscle_slug) do update
  set min_sets   = excluded.min_sets,
      max_sets   = excluded.max_sets,
      priority   = excluded.priority,
      note       = excluded.note,
      updated_at = now();

-- 7) CONFERÊNCIA ---------------------------------------------------
-- Rode isto depois para ver o plano final:
--
--   select pe.day_id, pe.position, e.name, pe.sets, pe.reps, pe.rir
--     from plan_exercises pe join exercises e on e.id = pe.exercise_id
--    where pe.person = 'isa' and pe.active
--    order by pe.day_id, pe.position;
--
-- E o volume planejado:
--
--   select muscle_slug, sets from v_weekly_volume_planned
--    where person = 'isa' order by sets desc;
