import { supabase } from "./supabase";

/* ============================================================
   Acesso a dados — multi-tenant por profile_id.

   Duas regras que valem para o arquivo inteiro:

   1. LEITURA sempre recebe profileId explícito. É o que permite ver
      o parceiro em modo leitura sem gambiarra.

   2. ESCRITA nunca manda profile_id. A coluna tem
      `default auth.uid()` no banco (migração 006), então o dono da
      linha é decidido pelo Postgres a partir do JWT, não pelo
      cliente. Não dá para forjar dono nem por engano nem de
      propósito — e depois da 008 a RLS recusa de todo jeito.
   ============================================================ */

/* ---------------- PERFIL ---------------- */

export async function getProfile(profileId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, sex, birth_date, height_cm, timezone")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const PROFILE_FIELDS = ["display_name", "sex", "birth_date", "height_cm", "timezone"];

export async function updateProfile(profileId, patch) {
  const clean = {};
  for (const f of PROFILE_FIELDS) if (f in patch) clean[f] = patch[f] === "" ? null : patch[f];
  if (typeof clean.display_name === "string") clean.display_name = clean.display_name.trim();
  clean.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles").update(clean).eq("id", profileId).select().single();
  if (error) throw error;
  return data;
}

/* ---------------- WORKOUT LOGS ---------------- */
// sets é um array [{ weight, reps, warmup }]

export async function saveWorkoutLog({ profileId, dayId, exerciseId, exerciseName, date, sets, notes }) {
  // O vínculo estável é o exerciseId. Se existir, procuramos/gravamos por ele
  // (renomear o exercício não duplica nem perde o registro do dia).
  // exercise_name segue como rótulo de exibição/fallback.
  let q = supabase
    .from("workout_logs")
    .select("id")
    .eq("profile_id", profileId)
    .eq("date", date);
  q = exerciseId ? q.eq("exercise_id", exerciseId) : q.eq("exercise_name", exerciseName);
  const { data: rows, error: selErr } = await q.order("id", { ascending: true }).limit(1);
  if (selErr) throw selErr;

  const existing = rows && rows[0];

  if (existing) {
    const payload = { day_id: dayId, sets, exercise_name: exerciseName };
    if (exerciseId !== undefined) payload.exercise_id = exerciseId;
    if (notes !== undefined) payload.notes = notes;
    const { data, error } = await supabase
      .from("workout_logs")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // profile_id omitido de propósito — ver cabeçalho do arquivo.
  const { data, error } = await supabase
    .from("workout_logs")
    .insert({ day_id: dayId, exercise_id: exerciseId, exercise_name: exerciseName, date, sets, notes })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getWorkoutLogs(profileId, exerciseName = null) {
  let q = supabase
    .from("workout_logs").select("*")
    .eq("profile_id", profileId)
    .order("date", { ascending: false });
  if (exerciseName) q = q.eq("exercise_name", exerciseName);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function deleteWorkoutLog(id) {
  const { error } = await supabase.from("workout_logs").delete().eq("id", id);
  if (error) throw error;
}

// Melhor série histórica (maior carga) por exercício — usado para PRs.
// Aquecimento nunca é PR: séries com warmup:true ficam de fora.
export function bestSet(logs) {
  let best = null;
  for (const log of logs) {
    for (const s of log.sets || []) {
      if (s.warmup) continue;
      const w = Number(s.weight) || 0;
      if (!best || w > best.weight) best = { weight: w, reps: Number(s.reps) || 0, date: log.date };
    }
  }
  return best;
}

/* ---------------- CATÁLOGO DE EXERCÍCIOS ---------------- */
// owner_id null  = catálogo global curado. Todo mundo vê, ninguém edita.
// owner_id preenchido = exercício do usuário. Só ele vê e edita.
//
// Editar um global não é permitido: a UI chama forkCatalogExercise, que
// copia o exercício e os vínculos musculares para a conta de quem edita.
// Sem isso, mudar o mapeamento de "Remada Curvada" mudaria o volume
// calculado de todos os usuários, retroativamente.

const CATALOG_FIELDS = ["name", "muscles", "media_url", "instructions", "tips", "equipment"];

export function isGlobalExercise(ex) {
  return !ex || ex.owner_id == null;
}

export async function getCatalog() {
  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Cria um exercício NO CATÁLOGO DO USUÁRIO. Se ele já tiver um com o
// mesmo nome, devolve o existente em vez de duplicar.
export async function addCatalogExercise({ profileId, name, muscles }) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("O exercício precisa de um nome.");

  const { data: found, error: selErr } = await supabase
    .from("exercises").select("*")
    .eq("owner_id", profileId).eq("name", trimmed).limit(1);
  if (selErr) throw selErr;
  if (found && found[0]) return found[0];

  const { data, error } = await supabase
    .from("exercises")
    .insert({ name: trimmed, muscles: muscles || null, owner_id: profileId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCatalogExercise(id, patch) {
  const clean = {};
  for (const f of CATALOG_FIELDS) if (f in patch) clean[f] = patch[f];
  if (clean.name != null) clean.name = String(clean.name).trim();
  clean.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("exercises").update(clean).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// Copia um exercício global para o catálogo do usuário, com os vínculos
// musculares junto, e devolve a cópia. Os logs antigos continuam ligados
// ao exercício global — o histórico não se mistura, que é o mesmo
// princípio do swapPlanExercise.
export async function forkCatalogExercise(exerciseId, profileId) {
  const { data: orig, error: e1 } = await supabase
    .from("exercises").select("*").eq("id", exerciseId).single();
  if (e1) throw e1;
  if (!isGlobalExercise(orig)) return orig; // já é seu, nada a fazer

  const { data: existente } = await supabase
    .from("exercises").select("*")
    .eq("owner_id", profileId).eq("name", orig.name).limit(1);
  if (existente && existente[0]) return existente[0];

  const copia = { owner_id: profileId };
  for (const f of CATALOG_FIELDS) copia[f] = orig[f];

  const { data: novo, error: e2 } = await supabase
    .from("exercises").insert(copia).select().single();
  if (e2) throw e2;

  const { data: vinculos, error: e3 } = await supabase
    .from("exercise_muscles").select("muscle_slug, role, contribution")
    .eq("exercise_id", exerciseId);
  if (e3) throw e3;

  if (vinculos && vinculos.length) {
    const { error: e4 } = await supabase.from("exercise_muscles").insert(
      vinculos.map((v) => ({ ...v, exercise_id: novo.id }))
    );
    if (e4) throw e4;
  }
  return novo;
}

/* ---------------- PLACEMENTS (plano) ---------------- */

const PLACEMENT_FIELDS = ["sets", "reps", "rest", "rir", "note", "priority"];

export async function getPlanExercises(profileId) {
  const { data, error } = await supabase
    .from("plan_exercises")
    .select("id, profile_id, day_id, position, sets, reps, rest, rir, note, priority, active, exercise_id, exercises ( id, name, muscles, media_url, instructions, tips, equipment, owner_id )")
    .eq("profile_id", profileId)
    .eq("active", true)
    .order("day_id", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Converte a prescrição textual de séries no número que as views somam.
// Pega o PRIMEIRO grupo de dígitos: "4" → 4, "3-4" → 3, "4 séries" → 4.
// Precisa casar exatamente com o substring(sets from '\d+') da migração 003.
function setsToNumber(v) {
  const m = String(v ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

export async function updatePlanExercise(id, patch) {
  const clean = {};
  for (const f of PLACEMENT_FIELDS) if (f in patch) clean[f] = patch[f];
  if ("sets" in clean) clean.sets_n = setsToNumber(clean.sets);
  clean.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("plan_exercises").update(clean).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function addPlanExercise({ profileId, dayId, exerciseId, fields }) {
  if (!exerciseId) throw new Error("Escolha um exercício do catálogo.");
  const { count, error: cErr } = await supabase
    .from("plan_exercises")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("day_id", dayId)
    .eq("active", true);
  if (cErr) throw cErr;

  const row = { day_id: dayId, exercise_id: exerciseId, position: count || 0, active: true, priority: false };
  for (const f of PLACEMENT_FIELDS) if (fields && f in fields) row[f] = fields[f];
  row.sets_n = setsToNumber(row.sets);

  const { data, error } = await supabase
    .from("plan_exercises").insert(row).select().single();
  if (error) throw error;
  return data;
}

// Troca QUAL exercício do catálogo este bloco aponta (substituir movimento).
// O histórico não se mistura: os logs ficam ligados ao catálogo, não ao bloco.
export async function swapPlanExercise(placementId, newExerciseId) {
  if (!newExerciseId) throw new Error("Escolha um exercício.");
  const { data, error } = await supabase
    .from("plan_exercises")
    .update({ exercise_id: newExerciseId, updated_at: new Date().toISOString() })
    .eq("id", placementId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reorderPlanExercises(orderedPlacementIds) {
  const now = new Date().toISOString();
  const results = await Promise.all(
    (orderedPlacementIds || []).map((id, idx) =>
      supabase.from("plan_exercises").update({ position: idx, updated_at: now }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

// "Remover" = marcar inativo. Some da tela mas preserva os logs antigos.
export async function deactivatePlanExercise(id) {
  const { error } = await supabase
    .from("plan_exercises")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* ---------------- VOLUME POR GRUPO MUSCULAR ---------------- */
// O cálculo mora no Postgres (views v_weekly_volume_*), não aqui: a regra
// precisa ser a mesma para todo mundo e não faz sentido duplicá-la em JS.

// Segunda-feira da semana de `d`, em ISO (YYYY-MM-DD).
// Precisa casar com o date_trunc('week', ...) do Postgres, que começa na segunda.
export function weekStartISO(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (x.getUTCDay() + 6) % 7; // 0 = segunda
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

export function addWeeksISO(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

export async function getMuscleGroups() {
  const { data, error } = await supabase
    .from("muscle_groups").select("*").order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getVolumeTargets(profileId) {
  const { data, error } = await supabase
    .from("volume_targets").select("*").eq("profile_id", profileId);
  if (error) throw error;
  return data || [];
}

export async function upsertVolumeTarget({ profileId, muscleSlug, minSets, maxSets, priority, note }) {
  const { data, error } = await supabase
    .from("volume_targets")
    .upsert({
      profile_id: profileId,
      muscle_slug: muscleSlug,
      min_sets: Number(minSets) || 0,
      max_sets: Number(maxSets) || 0,
      priority: !!priority,
      note: note || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,muscle_slug" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPlannedVolume(profileId) {
  const { data, error } = await supabase
    .from("v_weekly_volume_planned").select("*").eq("profile_id", profileId);
  if (error) throw error;
  return data || [];
}

export async function getPerformedVolume(profileId, weeks = 5) {
  const from = addWeeksISO(weekStartISO(), -(weeks - 1));
  const { data, error } = await supabase
    .from("v_weekly_volume_performed")
    .select("*")
    .eq("profile_id", profileId)
    .gte("week_start", from);
  if (error) throw error;
  return data || [];
}

export async function getUnmappedExercises(profileId) {
  const { data, error } = await supabase
    .from("v_unmapped_exercises").select("*").eq("profile_id", profileId);
  if (error) throw error;
  return data || [];
}

export async function getExerciseMuscles(exerciseId) {
  const { data, error } = await supabase
    .from("exercise_muscles").select("*").eq("exercise_id", exerciseId);
  if (error) throw error;
  return data || [];
}

// Substitui o conjunto de vínculos de um exercício (delete + insert).
// links = [{ muscleSlug, role, contribution }]
//
// Recusa exercício global: mudar o vínculo de um global reescreveria o
// volume calculado de todos os usuários. Quem quer um mapeamento próprio
// chama forkCatalogExercise antes.
export async function setExerciseMuscles(exerciseId, links) {
  if (!exerciseId) throw new Error("Exercício inválido.");

  const { data: ex, error: exErr } = await supabase
    .from("exercises").select("id, owner_id, name").eq("id", exerciseId).single();
  if (exErr) throw exErr;
  if (isGlobalExercise(ex)) {
    throw new Error(
      `"${ex.name}" é do catálogo compartilhado e não pode ser alterado. ` +
      `Crie uma cópia sua para ajustar o mapeamento muscular.`
    );
  }

  const { error: delErr } = await supabase
    .from("exercise_muscles").delete().eq("exercise_id", exerciseId);
  if (delErr) throw delErr;

  const rows = (links || [])
    .filter((l) => l && l.muscleSlug)
    .map((l) => ({
      exercise_id: exerciseId,
      muscle_slug: l.muscleSlug,
      role: l.role === "secondary" ? "secondary" : "primary",
      contribution: Math.min(1, Math.max(0, Number(l.contribution ?? (l.role === "secondary" ? 0.5 : 1)))),
    }));
  if (rows.length === 0) return [];

  const { data, error } = await supabase.from("exercise_muscles").insert(rows).select();
  if (error) throw error;
  return data || [];
}

// Monta a linha por músculo consumida pela aba Análise:
// semana atual (parcial) + média das 4 anteriores + planejado + meta.
export async function getVolumeAnalysis(profileId) {
  const [groups, targets, planned, performed, unmapped] = await Promise.all([
    getMuscleGroups(),
    getVolumeTargets(profileId),
    getPlannedVolume(profileId),
    getPerformedVolume(profileId, 5),
    getUnmappedExercises(profileId),
  ]);

  const current = weekStartISO();
  const prior4 = [1, 2, 3, 4].map((n) => addWeeksISO(current, -n));

  const at = (slug, week) => {
    const r = performed.find((x) => x.muscle_slug === slug && x.week_start === week);
    return r ? Number(r.sets) : 0;
  };

  const rows = groups.map((g) => {
    const t = targets.find((x) => x.muscle_slug === g.slug);
    const pl = planned.find((x) => x.muscle_slug === g.slug);
    // Semana sem registro conta como zero — treino não feito É volume zero,
    // então a média divide sempre por 4, não pelo nº de semanas com dado.
    const avg4 = prior4.reduce((s, w) => s + at(g.slug, w), 0) / 4;
    return {
      slug: g.slug,
      label: g.label_pt,
      region: g.region,
      min: t ? Number(t.min_sets) : 0,
      max: t ? Number(t.max_sets) : 0,
      priority: t ? !!t.priority : false,
      note: t ? t.note : null,
      planned: pl ? Number(pl.sets) : 0,
      currentWeek: at(g.slug, current),
      avg4,
    };
  });

  return { rows, unmapped, currentWeek: current };
}

/* ---------------- PESO CORPORAL ---------------- */
// Entrada da tendência (EWMA) que o motor da F1 vai consumir. É por isso
// que peso ficou no V0 mesmo com nutrição e fotos cortadas.

export async function addBodyWeight({ date, weight }) {
  const { data, error } = await supabase
    .from("body_weights")
    .insert({ date, weight })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getBodyWeights(profileId) {
  const { data, error } = await supabase
    .from("body_weights")
    .select("*")
    .eq("profile_id", profileId)
    .order("date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function deleteBodyWeight(id) {
  const { error } = await supabase.from("body_weights").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- MEDIDAS ---------------- */

export async function addMeasurement({ date, type, value }) {
  const { data, error } = await supabase
    .from("measurements")
    .insert({ date, type, value })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMeasurements(profileId) {
  const { data, error } = await supabase
    .from("measurements")
    .select("*")
    .eq("profile_id", profileId)
    .order("date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function deleteMeasurement(id) {
  const { error } = await supabase.from("measurements").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- FOTOS DE PROGRESSO ---------------- */
//
//  REMOVIDO NO V0 (decisão de 13/09).
//
//  uploadPhoto / getPhotos / deletePhoto e o compressImage saíram daqui
//  junto com toda a dependência de Storage no cliente. Motivo: as fotos
//  de corpo eram a maior superfície de LGPD do app, e as políticas do
//  bucket não verificavam dono nenhum.
//
//  A tabela `progress_photos` e o bucket CONTINUAM no banco com as 4
//  fotos existentes, e a 008 corrige a política. Quando a feature voltar,
//  o dado está lá — e o caminho legado `isa/…` segue válido, porque a
//  política nova resolve o dono por join com progress_photos, não por
//  prefixo do caminho.
