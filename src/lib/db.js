import { supabase } from "./supabase";

const PHOTO_BUCKET = "progress-photos";

/* ---------------- WORKOUT LOGS ---------------- */
// sets é um array [{ weight: number, reps: number }]

export async function saveWorkoutLog({ person, dayId, exerciseName, date, sets, notes }) {
  // Procura um registro já existente (mesmo perfil, exercício e data)
  const { data: rows, error: selErr } = await supabase
    .from("workout_logs")
    .select("id")
    .eq("person", person)
    .eq("exercise_name", exerciseName)
    .eq("date", date)
    .order("id", { ascending: true })
    .limit(1);
  if (selErr) throw selErr;
 
  const existing = rows && rows[0];
 
  if (existing) {
    // Atualiza o registro do dia em vez de criar outro
    const payload = { day_id: dayId, sets };
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
    .insert({ person, day_id: dayId, exercise_name: exerciseName, date, sets, notes })
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
export function bestSet(logs) {
  let best = null;
  for (const log of logs) {
    for (const s of log.sets || []) {
      const w = Number(s.weight) || 0;
      if (!best || w > best.weight) best = { weight: w, reps: Number(s.reps) || 0, date: log.date };
    }
  }
  return best;
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
