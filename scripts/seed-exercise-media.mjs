#!/usr/bin/env node
// ============================================================
//  seed-exercise-media.mjs — preenche exercises.media_url com as
//  fotos de execução da free-exercise-db (domínio público).
//
//  Cada exercício ganha DUAS fotos (posição inicial | posição final),
//  guardadas na mesma coluna separadas por "|". O app alterna as duas
//  como uma animação de dois quadros. Uma URL única (ex.: um GIF que
//  vocês colarem pelo editor ✎) também funciona — e nunca é sobrescrita
//  por este script, a não ser com --force.
//
//  Uso (na raiz do projeto, Node 18+):
//
//    SUPABASE_URL="https://SEU-PROJETO.supabase.co" \
//    SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key" \
//    node scripts/seed-exercise-media.mjs [--dry-run] [--force]
//
//    --dry-run  só mostra o que faria, não grava nada
//    --force    sobrescreve media_url já preenchida
//
//  ⚠️  A service_role key dá acesso total ao banco: só no terminal,
//      nunca no código do app nem no Git.
//
//  Fonte: https://github.com/yuhonas/free-exercise-db (Unlicense)
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

const IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

// Nome no catálogo (português) → id na free-exercise-db.
// Quando um exercício não tem equivalente exato, usa o mais próximo e
// deixa anotado. Para corrigir: edite aqui e rode de novo com --force,
// ou cole outra URL no app (✎ → "Imagem ou GIF de execução").
const MAP = {
  "Ab Rollout (roda abdominal)":            "Ab_Roller",
  "Abdominal Inclinado":                    "Decline_Crunch",
  "Abdução de Quadril (cabo ou máquina)":   "Thigh_Abductor",
  "Agachamento Búlgaro":                    "Split_Squat_with_Dumbbells",   // ≈ (sem pé elevado na foto)
  "Agachamento Livre":                      "Barbell_Full_Squat",
  "Arnold Press":                           "Arnold_Dumbbell_Press",
  "Cadeira Extensora":                      "Leg_Extensions",
  "Cadeira Flexora (Leg Curl)":             "Seated_Leg_Curl",
  "Crucifixo Máquina":                      "Butterfly",
  "Crucifixo com Cabo (alto p/ baixo)":     "Cable_Crossover",
  "Crucifixo com Cabo (baixo p/ alto)":     "Low_Cable_Crossover",
  "Desenvolvimento com Halteres":           "Dumbbell_Shoulder_Press",
  "Elevação Lateral com Halteres":          "Side_Lateral_Raise",
  "Elevação de Pernas":                     "Flat_Bench_Lying_Leg_Raise",
  "Elevação de Pernas Suspenso":            "Hanging_Leg_Raise",
  "Face Pull com Corda":                    "Face_Pull",
  "Hip Thrust com Barra":                   "Barbell_Hip_Thrust",
  "Levantamento Terra Romeno":              "Romanian_Deadlift",
  "Prancha com Elevação de Braço":          "Plank",                        // ≈
  "Puxada Alta (pegada aberta)":            "Wide-Grip_Lat_Pulldown",
  "Puxada Alta (pegada supinada)":          "Underhand_Cable_Pulldowns",
  "Remada Cavalinho (Chest-Supported)":     "Lying_T-Bar_Row",
  "Remada Cavalinho / Chest-Supported":     "Lying_T-Bar_Row",
  "Remada Curvada (pegada aberta)":         "Bent_Over_Barbell_Row",        // ≈ (pegada normal na foto)
  "Remada Curvada com Barra":               "Bent_Over_Barbell_Row",
  "Remada com Halter (unilateral)":         "One-Arm_Dumbbell_Row",
  "Rosca Direta com Barra":                 "Barbell_Curl",
  "Rosca Inclinada com Halteres":           "Incline_Dumbbell_Curl",
  "Rosca Martelo (Hammer Curl)":            "Hammer_Curls",
  "Rosca Martelo no Cabo":                  "Cable_Hammer_Curls_-_Rope_Attachment",
  "Rosca Scott Máquina":                    "Machine_Preacher_Curls",
  "Rosca Scott com Halteres":               "Two-Arm_Dumbbell_Preacher_Curl",
  "Supino Inclinado com Halteres":          "Incline_Dumbbell_Press",
  "Supino Reto com Barra":                  "Barbell_Bench_Press_-_Medium_Grip",
  "Supino Reto com Halteres":               "Dumbbell_Bench_Press",
  "Tríceps Francês (Skull Crusher)":        "EZ-Bar_Skullcrusher",
  "Tríceps Overhead no Cabo":               "Cable_Rope_Overhead_Triceps_Extension",
  "Tríceps Pulley (corda)":                 "Triceps_Pushdown_-_Rope_Attachment",
};

// Normaliza para casar nomes com pequenas diferenças (acento, caixa, espaços).
const norm = (s) => String(s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();
const MAP_NORM = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [norm(k), v]));

function fail(msg) { console.error("✖ " + msg); process.exit(1); }
if (!SUPABASE_URL || !KEY) fail("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
if (typeof fetch !== "function") fail("Precisa de Node 18 ou mais novo.");

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};
const rest = (path) => `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;

async function getCatalog() {
  const r = await fetch(rest("exercises?select=id,name,media_url&order=name"), { headers });
  if (!r.ok) fail(`Erro ao ler o catálogo (${r.status}): ${await r.text()}`);
  return r.json();
}

async function exists(url) {
  try { const r = await fetch(url, { method: "HEAD" }); return r.ok; }
  catch { return false; }
}

async function setMedia(id, mediaUrl) {
  const r = await fetch(rest(`exercises?id=eq.${id}`), {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ media_url: mediaUrl, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
}

const catalog = await getCatalog();
console.log(`${catalog.length} exercícios no catálogo${DRY ? " (dry-run: nada será gravado)" : ""}\n`);

const done = [], kept = [], missing = [], broken = [];

for (const ex of catalog) {
  if (ex.media_url && !FORCE) { kept.push(ex.name); continue; }

  const fedbId = MAP[ex.name] || MAP_NORM[norm(ex.name)];
  if (!fedbId) { missing.push(ex.name); continue; }

  const frames = [`${IMG_BASE}/${fedbId}/0.jpg`, `${IMG_BASE}/${fedbId}/1.jpg`];
  const ok = await Promise.all(frames.map(exists));
  if (!ok[0]) { broken.push(`${ex.name} (${fedbId})`); continue; }
  const value = ok[1] ? frames.join("|") : frames[0];

  if (!DRY) {
    try { await setMedia(ex.id, value); }
    catch (e) { broken.push(`${ex.name}: ${e.message}`); continue; }
  }
  done.push(`${ex.name} ← ${fedbId}${ok[1] ? "" : " (só 1 foto)"}`);
}

if (done.length)    console.log(`✅ ${DRY ? "Preencheria" : "Preenchidos"} (${done.length}):\n   ` + done.join("\n   "));
if (kept.length)    console.log(`\n⏭  Já tinham mídia — mantidos (${kept.length}; use --force para sobrescrever):\n   ` + kept.join("\n   "));
if (missing.length) console.log(`\n⚠️  Sem correspondência no MAP (${missing.length}) — cole a URL pelo app ou adicione ao MAP:\n   ` + missing.join("\n   "));
if (broken.length)  console.log(`\n✖ Falharam (${broken.length}):\n   ` + broken.join("\n   "));
console.log("");
