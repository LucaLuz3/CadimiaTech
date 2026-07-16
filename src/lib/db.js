import { supabase } from "./supabase";

const PHOTO_BUCKET = "progress-photos";

/* ---------------- WORKOUT LOGS ---------------- */
// sets é um array [{ weight: number, reps: number }]

export async function saveWorkoutLog({ person, dayId, exerciseId, exerciseName, date, sets, notes }) {
  // O vínculo estável é o exerciseId. Se ele existir, procuramos/gravamos por ele
  // (assim renomear o exercício não duplica nem perde o registro do dia).
  // Mantemos exercise_name como rótulo de exibição/fallback.
  let q = supabase
    .from("workout_logs")
    .select("id")
    .eq("person", person)
    .eq("date", date);
  q = exerciseId ? q.eq("exercise_id", exerciseId) : q.eq("exercise_name", exerciseName);
  const { data: rows, error: selErr } = await q.order("id", { ascending: true }).limit(1);
  if (selErr) throw selErr;

  const existing = rows && rows[0];

  if (existing) {
    // Atualiza o registro do dia em vez de criar outro
    const payload = { day_id: dayId, sets, exercise_name: exerciseName };
    if (exerciseId !== undefined) payload.exercise_id = exerciseId;
    if (notes !== undefined) payload.notes = notes; // só mexe em notes se foi informado
    const { data, error } = await supabase
      .from("workout_logs")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Não existe ainda → cria
  const { data, error } = await supabase
    .from("workout_logs")
    .insert({ person, day_id: dayId, exercise_id: exerciseId, exercise_name: exerciseName, date, sets, notes })
    .select()
    .single();
  if (error) throw error;
  return data;
}


export async function getWorkoutLogs(person, exerciseName = null) {
  let q = supabase.from("workout_logs").select("*").eq("person", person).order("date", { ascending: false });
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

/* ---------------- EXERCISES (catálogo reutilizável) ---------------- */
// O catálogo é a definição do movimento: nome, músculos e (futuro) mídia,
// instruções, dicas. É compartilhado entre os perfis. Os logs se ligam
// ao id do catálogo — o PR é do movimento, não do lugar no plano.

const CATALOG_FIELDS = ["name", "muscles", "media_url", "instructions", "tips", "equipment"];

// Lista o catálogo inteiro, em ordem alfabética.
export async function getCatalog() {
  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Cria um exercício no catálogo. Se já existir um com o mesmo nome,
// devolve o existente (o nome é único — evita duplicar o movimento).
export async function addCatalogExercise({ name, muscles }) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("O exercício precisa de um nome.");

  const { data: found, error: selErr } = await supabase
    .from("exercises").select("*").eq("name", trimmed).limit(1);
  if (selErr) throw selErr;
  if (found && found[0]) return found[0];

  const { data, error } = await supabase
    .from("exercises")
    .insert({ name: trimmed, muscles: muscles || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Atualiza um item do catálogo (afeta TODOS os planos que o usam).
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

/* ---------------- PLAN EXERCISES (placements) ---------------- */
// Um placement diz ONDE um exercício do catálogo entra no plano de alguém
// (perfil, dia, posição) e com qual PRESCRIÇÃO (séries, reps, descanso,
// RIR, prioridade, nota). O nome/músculos vêm do catálogo via join.

const PLACEMENT_FIELDS = ["sets", "reps", "rest", "rir", "note", "priority"];

// Lê os placements ativos de um perfil, já com o item de catálogo embutido.
export async function getPlanExercises(person) {
  const { data, error } = await supabase
    .from("plan_exercises")
    .select("id, person, day_id, position, sets, reps, rest, rir, note, priority, active, exercise_id, exercises ( id, name, muscles, media_url, instructions, tips, equipment )")
    .eq("person", person)
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

// Atualiza a prescrição de um placement (campos do bloco, não do catálogo).
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

// Adiciona um exercício do catálogo a um dia (no fim da lista).
export async function addPlanExercise({ person, dayId, exerciseId, fields }) {
  if (!exerciseId) throw new Error("Escolha um exercício do catálogo.");
  const { count, error: cErr } = await supabase
    .from("plan_exercises")
    .select("id", { count: "exact", head: true })
    .eq("person", person)
    .eq("day_id", dayId)
    .eq("active", true);
  if (cErr) throw cErr;

  const row = { person, day_id: dayId, exercise_id: exerciseId, position: count || 0, active: true, priority: false };
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

// Persiste a nova ordem dos exercícios de um dia: grava position = índice
// para cada placement, na ordem recebida. Os ids devem ser os placement ids.
export async function reorderPlanExercises(orderedPlacementIds) {
  const now = new Date().toISOString();
  const results = await Promise.all(
    (orderedPlacementIds || []).map((id, idx) =>
      supabase
        .from("plan_exercises")
        .update({ position: idx, updated_at: now })
        .eq("id", id)
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
// precisa ser a mesma para os dois perfis e não faz sentido duplicá-la em JS.
// Estas funções só leem e montam a série de semanas.

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

export async function getVolumeTargets(person) {
  const { data, error } = await supabase
    .from("volume_targets").select("*").eq("person", person);
  if (error) throw error;
  return data || [];
}

export async function upsertVolumeTarget({ person, muscleSlug, minSets, maxSets, priority, note }) {
  const { data, error } = await supabase
    .from("volume_targets")
    .upsert({
      person,
      muscle_slug: muscleSlug,
      min_sets: Number(minSets) || 0,
      max_sets: Number(maxSets) || 0,
      priority: !!priority,
      note: note || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "person,muscle_slug" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPlannedVolume(person) {
  const { data, error } = await supabase
    .from("v_weekly_volume_planned").select("*").eq("person", person);
  if (error) throw error;
  return data || [];
}

// Volume realizado das últimas `weeks` semanas (inclui a atual).
export async function getPerformedVolume(person, weeks = 5) {
  const from = addWeeksISO(weekStartISO(), -(weeks - 1));
  const { data, error } = await supabase
    .from("v_weekly_volume_performed")
    .select("*")
    .eq("person", person)
    .gte("week_start", from);
  if (error) throw error;
  return data || [];
}

export async function getUnmappedExercises(person) {
  const { data, error } = await supabase
    .from("v_unmapped_exercises").select("*").eq("person", person);
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
export async function setExerciseMuscles(exerciseId, links) {
  if (!exerciseId) throw new Error("Exercício inválido.");
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
export async function getVolumeAnalysis(person) {
  const [groups, targets, planned, performed, unmapped] = await Promise.all([
    getMuscleGroups(),
    getVolumeTargets(person),
    getPlannedVolume(person),
    getPerformedVolume(person, 5),
    getUnmappedExercises(person),
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

/* ---------------- BODY WEIGHT ---------------- */

export async function addBodyWeight({ person, date, weight }) {
  const { data, error } = await supabase
    .from("body_weights")
    .insert({ person, date, weight })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getBodyWeights(person) {
  const { data, error } = await supabase
    .from("body_weights")
    .select("*")
    .eq("person", person)
    .order("date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function deleteBodyWeight(id) {
  const { error } = await supabase.from("body_weights").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- MEASUREMENTS ---------------- */

export async function addMeasurement({ person, date, type, value }) {
  const { data, error } = await supabase
    .from("measurements")
    .insert({ person, date, type, value })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMeasurements(person) {
  const { data, error } = await supabase
    .from("measurements")
    .select("*")
    .eq("person", person)
    .order("date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function deleteMeasurement(id) {
  const { error } = await supabase.from("measurements").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- PROGRESS PHOTOS ---------------- */
// Comprime no navegador antes de subir (economiza o storage gratuito de 1 GB).

async function compressImage(file, maxSize = 1280, quality = 0.8) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > height && width > maxSize) {
    height = Math.round((height * maxSize) / width);
    width = maxSize;
  } else if (height > maxSize) {
    width = Math.round((width * maxSize) / height);
    height = maxSize;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
}

export async function uploadPhoto({ person, date, pose, file }) {
  const blob = await compressImage(file);
  const path = `${person}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("progress_photos")
    .insert({ person, date, pose, path })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPhotos(person) {
  const { data, error } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("person", person)
    .order("date", { ascending: false });
  if (error) throw error;

  // Gera URLs temporárias assinadas (bucket privado).
  const withUrls = await Promise.all(
    (data || []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(row.path, 60 * 60);
      return { ...row, url: signed?.signedUrl };
    })
  );
  return withUrls;
}

export async function deletePhoto(row) {
  await supabase.storage.from(PHOTO_BUCKET).remove([row.path]);
  const { error } = await supabase.from("progress_photos").delete().eq("id", row.id);
  if (error) throw error;
}