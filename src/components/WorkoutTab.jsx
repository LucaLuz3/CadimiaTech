import { useState, useEffect, useMemo, useRef } from "react";
import { font, color, space, radius, tap, tint, chip, chipMuted, numInput, iconBtn } from "../theme";
import {
  saveWorkoutLog, getWorkoutLogs, bestSet,
  updatePlanExercise, addPlanExercise, deactivatePlanExercise, swapPlanExercise,
  reorderPlanExercises,
  addCatalogExercise, updateCatalogExercise,
} from "../lib/db";

const today = () => new Date().toISOString().slice(0, 10);
const fmtShort = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const setCount = (sets) => Math.max(1, parseInt(String(sets).match(/\d+/)?.[0] || "3", 10));

// Converte o campo "rest" (ex: "90s", "2 min", "2–3 min") em segundos.
// Para faixas (2–3 min) usa o limite inferior como padrão.
function parseRestSeconds(rest) {
  if (!rest) return 90;
  const str = String(rest).toLowerCase();
  const nums = (str.match(/\d+/g) || []).map(Number);
  if (nums.length === 0) return 90;
  const val = nums[0];
  return str.includes("min") ? val * 60 : val;
}

const mmss = (s) => {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const RIRBadge = ({ rir, color }) => (
  <span style={{
    background: color + "22",
    border: `1px solid ${color}44`,
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "11px",
    fontFamily: "'DM Mono', monospace",
    color: color,
  }}>{rir}</span>
);

/* ---------- Mídia de execução ----------
   media_url do catálogo aceita:
     · uma URL única (GIF/imagem), ou
     · duas URLs separadas por "|" (posição inicial | posição final),
       que o app alterna como animação de dois quadros.
   Quem preenche é scripts/seed-exercise-media.mjs (free-exercise-db) ou o editor ✎. */
function mediaFrames(mediaUrl) {
  return String(mediaUrl || "").split("|").map((u) => u.trim()).filter(Boolean);
}

/* ---------- Persistência local do treino em andamento ----------
   Guarda rascunho + progresso no aparelho p/ sobreviver a recarregar a página.
   É por aparelho (não sincroniza entre Bela/Luca) — o que sincroniza é o treino salvo. */
const WIP_KEY = "treino-duo:wip";
function loadWipPart(part) {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(WIP_KEY) : null;
    const obj = raw ? JSON.parse(raw) : {};
    return obj[part] || {};
  } catch { return {}; }
}

export default function WorkoutTab({ who, p, catalog = [], exLoading = false, onExercisesChanged }) {
  const [activeDay, setActiveDay] = useState("A");
  const [date, setDate] = useState(today());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // ----- Modo de edição do plano (Fase 1: editar / adicionar / remover) -----
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(null);   // exercício sendo editado/criado (objeto) | null
  const [savingEx, setSavingEx] = useState(false);

  // ----- Reordenação (Fase 2) -----
  // Ordem otimista por dia enquanto persiste: { [dayId]: [placementId, ...] }.
  // Dá feedback instantâneo sem esperar o round-trip; some quando o banco confirma.
  const [orderOverride, setOrderOverride] = useState({});
  const [reordering, setReordering] = useState(false);

  // ----- Visualizador de execução (▶) -----
  const [viewing, setViewing] = useState(null);   // exercício aberto no visualizador | null

  // ----- Modo foco: um exercício expandido por vez -----
  // openKey = placementId do exercício aberto. Ao trocar de dia, abre o 1º pendente.
  // Quando o descanso da última série zera, avança para o próximo sozinho.
  const [openKey, setOpenKey] = useState(null);
  const [advanceFrom, setAdvanceFrom] = useState(null); // { key, exName } pedido pelo timer

  // ----- Timer de descanso -----
  // timer: { key, label, maxSets, total, remaining, endAt, running, done } | null
  const [timer, setTimer] = useState(null);
  const [muted, setMuted] = useState(false);
  const audioCtxRef = useRef(null);

  // ----- Estado do treino em andamento, indexado por "perfil:dia:data" -----
  // Persiste no aparelho: sobrevive a trocas de aba/perfil/dia E a recarregar a página.
  // A data na chave faz cada treino ter o seu progresso (não vem "sujo" do dia anterior).
  const [draftMap, setDraftMap] = useState(() => loadWipPart("draftMap"));       // { "isa:A:2026-05-27": { [ex]: linhas } }
  const [completedMap, setCompletedMap] = useState(() => loadWipPart("completedMap")); // { "isa:A:2026-05-27": { [ex]: nº } }

  const day = p.days.find((d) => d.id === activeDay) || p.days[0];
  const key = `${who}:${activeDay}:${date}`;
  const draft = draftMap[key] || {};
  const completedSets = completedMap[key] || {};

  // Ordem exibida do dia: aplica o override otimista (reordenação em andamento),
  // caindo na ordem que veio do banco quando não há override.
  const orderedExercises = (() => {
    const base = day?.exercises || [];
    const ov = orderOverride[activeDay];
    if (!ov) return base;
    const byId = new Map(base.map((e) => [e.placementId, e]));
    const ordered = ov.map((id) => byId.get(id)).filter(Boolean);
    const inOv = new Set(ov);
    base.forEach((e) => { if (!inOv.has(e.placementId)) ordered.push(e); }); // segurança
    return ordered;
  })();

  // Persiste o treino em andamento no aparelho sempre que mudar
  useEffect(() => {
    try { localStorage.setItem(WIP_KEY, JSON.stringify({ draftMap, completedMap })); } catch { /* storage cheio/indisponível: ignora */ }
  }, [draftMap, completedMap]);

  async function refresh() {
    setLoading(true);
    try { setLogs(await getWorkoutLogs(who)); }
    catch (e) { setMsg("Erro ao carregar histórico: " + e.message); }
    setLoading(false);
  }

  // Ao trocar de perfil: recarrega o histórico do novo perfil (sem apagar o treino em andamento)
  useEffect(() => { setMsg(""); setLogs([]); refresh(); }, [who]);
  // Ao trocar de dia: só limpa a mensagem (rascunho/progresso ficam guardados por perfil:dia:data)
  useEffect(() => { setMsg(""); }, [activeDay]);
  // Ao trocar de dia/perfil (ou quando o plano chega): abre o primeiro exercício ainda não concluído.
  useEffect(() => {
    const list = orderedExercises;
    if (!list.length) { setOpenKey(null); return; }
    const cc = completedMap[key] || {};
    const firstPending = list.find((e) => (cc[e.name] || 0) < setCount(e.sets)) || list[0];
    setOpenKey(firstPending.placementId || firstPending.id || firstPending.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, activeDay, day?.exercises?.length]);

  // Avanço automático: o timer pediu para conferir se o exercício terminou.
  useEffect(() => {
    if (!advanceFrom) return;
    setAdvanceFrom(null);
    if (advanceFrom.key !== key) return;                       // timer de outro dia/perfil: ignora
    const list = orderedExercises;
    const idx = list.findIndex((e) => e.name === advanceFrom.exName);
    if (idx < 0) return;
    const ex = list[idx];
    const rows = draft[ex.name] || baseRows(ex);
    const total = rows.filter((r) => !r.warmup).length || setCount(ex.sets);
    if ((completedSets[ex.name] || 0) < total) return;         // ainda faltam séries
    const next = list[idx + 1];
    if (next) setOpenKey(next.placementId || next.id || next.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceFrom, completedMap]);

  /* ---------- Patches do estado por "perfil:dia:data" ---------- */
  function patchDraft(k, updater) {
    setDraftMap((m) => ({ ...m, [k]: updater(m[k] || {}) }));
  }
  function patchCompleted(k, updater) {
    setCompletedMap((m) => ({ ...m, [k]: updater(m[k] || {}) }));
  }

  /* ---------- Áudio (chime suave gerado via Web Audio) ---------- */
  function ensureAudio() {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }
  const CHIME_VOLUME = 0.40;
  const CHIME_SOUND = "bell3";

  function playTone(freq, t0, dur, peak, type) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function playChime() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const n = ctx.currentTime;
    const v = CHIME_VOLUME;
    switch (CHIME_SOUND) {
      case "current":
        [784, 1047].forEach((f, i) => playTone(f, n + i * 0.16, 0.5, v, "sine"));
        break;
      case "bell3":
        [0, 0.22, 0.44].forEach((d) => playTone(1047, n + d, 0.32, v, "triangle"));
        break;
      case "gym":
        [0, 0.45].forEach((d) => {
          playTone(660, n + d, 1.1, v, "sine");
          playTone(990, n + d, 0.9, v * 0.5, "sine");
          playTone(1320, n + d, 0.7, v * 0.3, "sine");
        });
        break;
      case "alarm":
        for (let i = 0; i < 5; i++) playTone(880, n + i * 0.18, 0.12, v, "square");
        break;
      case "rise":
      default:
        [659, 784, 988, 1319].forEach((f, i) => playTone(f, n + i * 0.18, 0.55, v, "triangle"));
    }
  }
  function buzz() {
    // curto [120,60,120] · médio [200,100,200,100,200] · forte [400,200,400,200,400]
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
  }

  /* ---------- Controles do timer ---------- */
  function startRest(seconds, label, maxSets) {
    ensureAudio(); // precisa rodar dentro do gesto de clique p/ desbloquear o áudio
    // guarda a "key" do treino atual p/ marcar a série no perfil/dia/data certo, mesmo se trocar depois
    setTimer({ key, label, maxSets, total: seconds, remaining: seconds, endAt: Date.now() + seconds * 1000, running: true, done: false });
  }
  function pauseResume() {
    setTimer((t) => {
      if (!t || t.done) return t;
      return t.running
        ? { ...t, running: false, endAt: null }
        : { ...t, running: true, endAt: Date.now() + t.remaining * 1000 };
    });
  }
  function adjust(delta) {
    setTimer((t) => {
      if (!t) return t;
      const rem = Math.max(1, t.remaining + delta);
      return { ...t, done: false, remaining: rem, total: Math.max(t.total, rem), endAt: t.running ? Date.now() + rem * 1000 : t.endAt };
    });
  }
  function stopTimer() { setTimer(null); }

  /* ---------- Progresso de séries ---------- */
  // Marca a próxima série pendente do exercício como concluída, sem passar do total.
  function markSetDone(k, exName, maxSets) {
    patchCompleted(k, (cc) => {
      const cur = cc[exName] || 0;
      const max = maxSets || cur + 1;
      return cur >= max ? cc : { ...cc, [exName]: cur + 1 };
    });
  }
  // Ajuste manual ao tocar no indicador de uma série de trabalho (progresso é
  // sequencial). `workIdx` é a posição entre as séries de TRABALHO — aquecimento
  // não entra na contagem nem nos pontinhos.
  function toggleSet(exName, workIdx, total) {
    patchCompleted(key, (cc) => {
      const cur = cc[exName] || 0;
      const next = workIdx < cur ? workIdx : Math.min(total, workIdx + 1);
      return { ...cc, [exName]: next };
    });
  }
  // Aquecimento tem o seu próprio "feito", guardado na linha, sem afetar o progresso.
  function toggleRowDone(exName, idx) {
    patchDraft(key, (dd) => {
      const ex = day.exercises.find((e) => e.name === exName);
      const rows = dd[exName] ? [...dd[exName]] : baseRows(ex);
      rows[idx] = { ...rows[idx], done: !rows[idx].done };
      return { ...dd, [exName]: rows };
    });
  }

  // Contagem regressiva baseada em timestamp (não acumula erro mesmo se a aba travar)
  useEffect(() => {
    if (!timer || !timer.running || !timer.endAt) return;
    let id;
    const tick = () => {
      const rem = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
      setTimer((t) => (t && t.running ? { ...t, remaining: rem } : t));
      if (rem <= 0) {
        if (!muted) playChime();
        buzz();
        // ✅ ao zerar o descanso, marca a próxima série pendente — no perfil/dia/data em que o timer começou
        markSetDone(timer.key, timer.label, timer.maxSets);
        setAdvanceFrom({ key: timer.key, exName: timer.label });
        setTimer((t) => (t ? { ...t, running: false, endAt: null, remaining: 0, done: true } : t));
        return;
      }
      id = setTimeout(tick, 250);
    };
    tick();
    return () => clearTimeout(id);
  }, [timer?.running, timer?.endAt, muted]);

  // Some sozinho alguns segundos após concluir
  useEffect(() => {
    if (!timer?.done) return;
    const id = setTimeout(() => setTimer((t) => (t?.done ? null : t)), 8000);
    return () => clearTimeout(id);
  }, [timer?.done]);

  /* ---------- Log de séries ---------- */
  // Identificador estável do exercício: usa o id do banco; cai no nome se faltar.
  const exKey = (ex) => ex.id || ex.name;

  // Indexa logs por id E por nome — assim casamos tanto registros novos
  // (com exercise_id) quanto históricos antigos (só com exercise_name).
  const logsByExercise = useMemo(() => {
    const byId = {};
    const byName = {};
    for (const l of logs) {
      if (l.exercise_id) (byId[l.exercise_id] ||= []).push(l);
      if (l.exercise_name) (byName[l.exercise_name] ||= []).push(l);
    }
    return { byId, byName };
  }, [logs]);

  // Retorna os logs de um exercício, juntando os casados por id e por nome
  // (sem duplicar) e ordenando do mais recente para o mais antigo.
  function logsFor(ex) {
    const a = ex.id ? (logsByExercise.byId[ex.id] || []) : [];
    const b = logsByExercise.byName[ex.name] || [];
    const seen = new Set();
    const merged = [];
    for (const l of [...a, ...b]) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      merged.push(l);
    }
    merged.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    return merged;
  }

  // Valores de partida de um exercício, vindos do último treino salvo (Supabase).
  // É o que deixa os campos já preenchidos "para a próxima vez".
  // O nº de linhas é o maior entre a prescrição e o que foi realmente logado da
  // última vez — assim as séries de aquecimento que você registrou reaparecem.
  function baseRows(ex) {
    const last = logsFor(ex)[0];
    const n = Math.max(setCount(ex.sets), last?.sets?.length || 0);
    return Array.from({ length: n }, (_, idx) => ({
      weight: last?.sets?.[idx]?.weight != null ? String(last.sets[idx].weight) : "",
      reps: last?.sets?.[idx]?.reps != null ? String(last.sets[idx].reps) : "",
      warmup: last?.sets?.[idx]?.warmup === true,
    }));
  }

  // Marca/desmarca uma série como aquecimento. Aquecimento é logado igual, mas
  // não conta como volume (view v_weekly_volume_performed) nem como PR (bestSet).
  function toggleWarmup(exName, idx) {
    patchDraft(key, (dd) => {
      const ex = day.exercises.find((e) => e.name === exName);
      const rows = dd[exName] ? [...dd[exName]] : baseRows(ex);
      rows[idx] = { ...rows[idx], warmup: !rows[idx].warmup };
      return { ...dd, [exName]: rows };
    });
  }

  // Séries de aquecimento são EXTRAS: entram além da prescrição, não no lugar
  // dela. Por isso dá para adicionar/remover linhas.
  function addRow(exName, warmup) {
    patchDraft(key, (dd) => {
      const ex = day.exercises.find((e) => e.name === exName);
      const rows = dd[exName] ? [...dd[exName]] : baseRows(ex);
      const row = { weight: "", reps: "", warmup: !!warmup };
      if (warmup) rows.unshift(row); else rows.push(row);
      return { ...dd, [exName]: rows };
    });
  }

  function removeRow(exName, idx) {
    patchDraft(key, (dd) => {
      const ex = day.exercises.find((e) => e.name === exName);
      const rows = dd[exName] ? [...dd[exName]] : baseRows(ex);
      if (rows.length <= 1) return dd;
      rows.splice(idx, 1);
      return { ...dd, [exName]: rows };
    });
  }

  function setCell(exName, idx, field, value) {
    patchDraft(key, (dd) => {
      const ex = day.exercises.find((e) => e.name === exName);
      // ao tocar pela 1ª vez, parte dos valores do último treino (não zera as outras séries)
      const rows = dd[exName] ? [...dd[exName]] : baseRows(ex);
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...dd, [exName]: rows };
    });
  }

  async function save() {
    setSaving(true); setMsg("");
    try {
      let count = 0;
      for (const ex of day.exercises) {
        const edited = !!draft[ex.name];                       // mexeu nos campos
        const done = (completedSets[ex.name] || 0) > 0;        // marcou alguma série
        if (!edited && !done) continue;                        // exercício não realizado hoje → não grava
        const rowsToSave = (draft[ex.name] || baseRows(ex)).filter((r) => r.weight !== "" || r.reps !== "");
        if (rowsToSave.length === 0) continue;
        const sets = rowsToSave.map((r) => ({ weight: Number(r.weight) || 0, reps: Number(r.reps) || 0, warmup: !!r.warmup }));
        // saveWorkoutLog faz upsert pelo id estável do exercício (cai no nome se não houver id)
        await saveWorkoutLog({ person: who, dayId: activeDay, exerciseId: ex.id, exerciseName: ex.name, date, sets });
        count++;
      }
      if (count === 0) { setMsg("Marque as séries feitas ou edite algum peso para salvar."); }
      else { setMsg(`✅ Treino ${activeDay} salvo (${count} exercício${count > 1 ? "s" : ""})! Os valores ficaram preenchidos.`); await refresh(); }
    } catch (e) { setMsg("Erro ao salvar: " + e.message); }
    setSaving(false);
  }

  /* ---------- Edição do plano ---------- */
  // Prescrição padrão de um novo bloco
  const BLANK_PRESCRIPTION = { sets: "3", reps: "10–12", rest: "90s", rir: "1 RIR", note: "", priority: false };

  // Adicionar: abre o seletor de catálogo + a prescrição do bloco.
  function openAdd() {
    setEditing({
      _mode: "add",
      catalogId: null, query: "", creatingNew: false,
      newName: "", newMuscles: "",
      ...BLANK_PRESCRIPTION,
    });
  }
  // Editar: campos do catálogo (nome/músculos, globais) + prescrição do bloco.
  // Também permite TROCAR por outro exercício do catálogo (substituir o movimento).
  function openEdit(ex) {
    setEditing({
      _mode: "edit",
      placementId: ex.placementId, catalogId: ex.id,
      name: ex.name, muscles: ex.muscles, mediaUrl: ex.mediaUrl || "",
      sets: ex.sets, reps: ex.reps, rest: ex.rest, rir: ex.rir,
      note: ex.note, priority: !!ex.priority,
      // estado de troca (começa desligado)
      swapping: false, swapTargetId: null, query: "", creatingNew: false,
      newName: "", newMuscles: "",
    });
  }
  function closeEditor() { setEditing(null); }

  async function saveEx() {
    if (!editing) return;
    setSavingEx(true); setMsg("");
    try {
      const prescription = {
        sets: editing.sets, reps: editing.reps, rest: editing.rest,
        rir: editing.rir, note: editing.note, priority: !!editing.priority,
      };

      if (editing._mode === "add") {
        // 1) Resolve o exercício do catálogo: existente ou recém-criado.
        let catalogId = editing.catalogId;
        if (editing.creatingNew) {
          if (!editing.newName?.trim()) { setMsg("Dê um nome ao novo exercício."); setSavingEx(false); return; }
          const created = await addCatalogExercise({ name: editing.newName, muscles: editing.newMuscles });
          catalogId = created.id;
        }
        if (!catalogId) { setMsg("Escolha um exercício ou crie um novo."); setSavingEx(false); return; }
        // 2) Cria o placement nesse dia.
        await addPlanExercise({ person: who, dayId: activeDay, exerciseId: catalogId, fields: prescription });
      } else {
        // Modo editar.
        if (editing.swapping) {
          // Substituir o movimento: resolve o alvo (existente ou novo) e troca o ponteiro.
          let targetId = editing.swapTargetId;
          if (editing.creatingNew) {
            if (!editing.newName?.trim()) { setMsg("Dê um nome ao novo exercício."); setSavingEx(false); return; }
            const created = await addCatalogExercise({ name: editing.newName, muscles: editing.newMuscles });
            targetId = created.id;
          }
          if (!targetId) { setMsg("Escolha o exercício para o qual trocar."); setSavingEx(false); return; }
          await swapPlanExercise(editing.placementId, targetId);
          await updatePlanExercise(editing.placementId, prescription);
        } else {
          // Editar o catálogo (nome/músculos — afeta todos os planos) e a prescrição.
          if (!editing.name?.trim()) { setMsg("O exercício precisa de um nome."); setSavingEx(false); return; }
          await updateCatalogExercise(editing.catalogId, {
            name: editing.name, muscles: editing.muscles,
            media_url: (editing.mediaUrl || "").trim() || null,
          });
          await updatePlanExercise(editing.placementId, prescription);
        }
      }

      setEditing(null);
      if (onExercisesChanged) await onExercisesChanged();
      setMsg("✅ Plano atualizado.");
    } catch (e) {
      // 23505 = violação de unicidade (nome de catálogo repetido, ou exercício já no dia)
      const friendly = e?.code === "23505"
        ? (editing.swapping ? "Esse exercício já está neste dia." : "Já existe um exercício com esse nome no catálogo.")
        : e.message;
      setMsg("Erro ao salvar: " + friendly);
    }
    setSavingEx(false);
  }

  async function removeEx(ex) {
    if (!ex.placementId) { setMsg("Este exercício ainda não está no banco — recarregue a página."); return; }
    const ok = typeof window !== "undefined"
      ? window.confirm(`Remover "${ex.name}" do Treino ${activeDay}?\n\nO histórico de cargas é preservado — o exercício só deixa de aparecer neste dia.`)
      : true;
    if (!ok) return;
    setMsg("");
    try {
      await deactivatePlanExercise(ex.placementId);
      if (onExercisesChanged) await onExercisesChanged();
      setMsg(`"${ex.name}" removido do plano (histórico preservado).`);
    } catch (e) { setMsg("Erro ao remover: " + e.message); }
  }

  /* ---------- Reordenar (Fase 2) ---------- */
  // Move o exercício do índice `index` (na ordem exibida) para cima (-1) ou baixo (+1).
  function moveEx(orderedList, index, dir) {
    const j = index + dir;
    if (j < 0 || j >= orderedList.length) return;
    const newList = orderedList.slice();
    [newList[index], newList[j]] = [newList[j], newList[index]];
    const ids = newList.map((e) => e.placementId);
    const dayId = activeDay;
    setOrderOverride((o) => ({ ...o, [dayId]: ids })); // feedback imediato
    persistOrder(dayId, ids);
  }

  async function persistOrder(dayId, ids) {
    setReordering(true); setMsg("");
    try {
      await reorderPlanExercises(ids);
      if (onExercisesChanged) await onExercisesChanged();
      // Limpa o override só se ninguém mexeu de novo nesse dia nesse meio-tempo.
      setOrderOverride((o) => {
        if (!o[dayId] || o[dayId].join() !== ids.join()) return o;
        const n = { ...o }; delete n[dayId]; return n;
      });
    } catch (e) { setMsg("Erro ao reordenar: " + e.message); }
    setReordering(false);
  }

  return (
    <div className="fade-in">
      {/* ===== Cabeçalho compacto: seletor A/B/C + faixa do treino ===== */}
      <div style={{
        background: color.surface, border: `1px solid ${color.lineSoft}`,
        borderRadius: radius.lg, padding: space.sm, marginBottom: space.md,
      }}>
        <div role="tablist" aria-label="Dia de treino" style={{
          display: "grid", gridTemplateColumns: `repeat(${p.days.length}, 1fr)`,
          gap: 4, padding: 3, background: "rgba(0,0,0,0.35)", borderRadius: radius.md,
        }}>
          {p.days.map((d) => {
            const on = activeDay === d.id;
            return (
              <button key={d.id} role="tab" aria-selected={on} onClick={() => setActiveDay(d.id)} style={{
                height: 40, border: "none", cursor: "pointer", borderRadius: radius.sm,
                background: on ? `linear-gradient(135deg, ${tint(p.color, 0xcc)}, ${tint(p.color, 0x88)})` : "transparent",
                color: on ? "#fff" : color.text4, fontFamily: font.display, fontSize: 22, letterSpacing: "0.06em",
                transition: "background 0.2s, color 0.2s",
              }}>{d.id}</button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: space.sm, padding: `${space.md}px ${space.xs}px 4px` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: font.display, fontSize: 22, color: p.accent, letterSpacing: "0.05em", lineHeight: 1 }}>
              TREINO {day.id}
            </div>
            <div style={{ fontSize: 12, color: color.text2, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {day.theme}
            </div>
          </div>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)}
            aria-label="Data do treino" style={dateInput} />
          <button
            onClick={() => { setEditMode((v) => !v); setEditing(null); }}
            className="hover-lift"
            aria-pressed={editMode}
            title={editMode ? "Concluir edição do plano" : "Editar plano"}
            style={iconBtn(p.color, editMode)}>
            {editMode ? "✓" : "✎"}
          </button>
        </div>
        {editMode && (
          <div style={{ fontSize: 11, color: color.text3, padding: `0 ${space.xs}px ${space.xs}px` }}>
            Modo edição: reordene com ▲▼, ✎ para alterar, 🗑 para remover. Toque em ✓ para concluir.
          </div>
        )}
      </div>

      {/* ===== Exercícios (modo foco: um aberto por vez) ===== */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {orderedExercises.map((ex, i) => {
          const exLogs = logsFor(ex);
          const pr = bestSet(exLogs);
          const last = exLogs[0];
          const restSecs = parseRestSeconds(ex.rest);
          const isResting = timer && !timer.done && timer.key === key && timer.label === ex.name;
          const rows = draft[ex.name] || baseRows(ex);
          const prescribed = setCount(ex.sets);
          // Progresso e timer contam SÓ séries de trabalho: aquecimento é extra.
          const totalSets = rows.filter((r) => !r.warmup).length || prescribed;
          const doneSets = Math.min(completedSets[ex.name] || 0, totalSets);
          const complete = totalSets > 0 && doneSets >= totalSets;
          const exId = ex.placementId || ex.id || ex.name;
          const open = !editMode && openKey === exId;

          return (
            <div key={exId} className="ex-card" style={{
              background: open ? color.surface2 : color.surface,
              borderTop: `1px solid ${open ? tint(p.color, 0x66) : color.lineSoft}`,
              borderRight: `1px solid ${open ? tint(p.color, 0x66) : color.lineSoft}`,
              borderBottom: `1px solid ${open ? tint(p.color, 0x66) : color.lineSoft}`,
              borderLeft: `3px solid ${ex.priority ? p.color : (complete ? color.success : "transparent")}`,
              borderRadius: radius.lg,
              transition: "background 0.2s, border-color 0.2s",
            }}>
              {/* ---- Linha de cabeçalho (sempre visível; toca para abrir/fechar) ---- */}
              <div
                role={editMode ? undefined : "button"}
                tabIndex={editMode ? -1 : 0}
                aria-expanded={editMode ? undefined : open}
                onClick={() => { if (!editMode) setOpenKey(open ? null : exId); }}
                onKeyDown={(e) => { if (!editMode && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenKey(open ? null : exId); } }}
                style={{
                  display: "flex", alignItems: "center", gap: space.sm,
                  padding: `${space.sm + 2}px ${space.md}px`, minHeight: 48, cursor: editMode ? "default" : "pointer",
                }}>
                <span style={{
                  width: 24, height: 24, borderRadius: radius.sm, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: complete ? tint(color.success, 0x22) : (ex.priority ? tint(p.color, 0x44) : color.surface2),
                  color: complete ? color.success : (ex.priority ? p.accent : color.text4),
                  fontSize: 10, fontFamily: font.mono, fontWeight: 600,
                }}>{complete ? "✓" : i + 1}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{
                      fontWeight: 600, fontSize: 14, color: open ? color.text : color.text2,
                      whiteSpace: open ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{ex.name}</span>
                    {ex.mediaUrl && !editMode && (
                      <button onClick={(e) => { e.stopPropagation(); setViewing(ex); }}
                        title="Ver execução" aria-label={`Ver execução de ${ex.name}`}
                        className="hover-lift" style={playBtn(p.color)}>▶</button>
                    )}
                  </div>
                  {!open && (
                    <div style={{ fontFamily: font.mono, fontSize: 10, color: color.text4, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ex.sets} × {ex.reps} · {mmss(restSecs)}{ex.priority ? " · prioridade" : ""}
                    </div>
                  )}
                </div>

                {editMode ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button onClick={() => moveEx(orderedExercises, i, -1)} disabled={i === 0 || reordering}
                        title="Mover para cima" style={arrowBtn(p.color, i === 0 || reordering)}>▲</button>
                      <button onClick={() => moveEx(orderedExercises, i, +1)} disabled={i === orderedExercises.length - 1 || reordering}
                        title="Mover para baixo" style={arrowBtn(p.color, i === orderedExercises.length - 1 || reordering)}>▼</button>
                    </div>
                    <button onClick={() => openEdit(ex)} title="Editar exercício" className="hover-lift" style={miniActionBtn(p.color)}>✎</button>
                    <button onClick={() => removeEx(ex)} title="Remover do plano" className="hover-lift" style={miniActionBtn(color.danger)}>🗑</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: space.sm, flexShrink: 0 }}>
                    <SetProgress done={doneSets} total={totalSets} />
                    {open && <RIRBadge rir={ex.rir} color={p.color} />}
                  </div>
                )}
              </div>

              {/* ---- Corpo (só do exercício aberto) ---- */}
              {open && (
                <div style={{ padding: `0 ${space.md}px ${space.md}px`, borderTop: `1px solid ${color.lineSoft}` }}>
                  {/* Prescrição em chips + ação principal (descanso) */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingTop: space.md }}>
                    <span style={chip(p.accent)}>{ex.sets} × {ex.reps}</span>
                    {pr && <span style={chip(p.accent)} title="Melhor série registrada">🏆 {pr.weight} × {pr.reps}</span>}
                    {last && <span style={chipMuted} title="Último treino salvo">último {fmtShort(last.date)}</span>}
                    <button
                      onClick={() => startRest(restSecs, ex.name, totalSets)}
                      className="hover-lift"
                      title={`Iniciar descanso de ${mmss(restSecs)} — marca a próxima série ao zerar`}
                      style={{
                        marginLeft: "auto", height: 34, padding: "0 12px", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: isResting ? tint(p.color, 0x44) : `linear-gradient(135deg, ${tint(p.color, 0x55)}, ${tint(p.color, 0x33)})`,
                        border: `1px solid ${isResting ? p.color : tint(p.color, 0x77)}`,
                        borderRadius: radius.md, color: "#fff",
                        fontFamily: font.mono, fontSize: 13, fontWeight: 600,
                      }}>
                      ⏱ {mmss(restSecs)}
                    </button>
                  </div>
                  {ex.muscles && <div style={{ fontSize: 11, color: color.text3, marginTop: space.sm }}>{ex.muscles}</div>}
                  {ex.note && <div style={{ fontSize: 11, color: color.text3, fontStyle: "italic", marginTop: 4 }}>💡 {ex.note}</div>}

                  {/* Séries: grade fixa [✓] [kg] × [reps] [aq] [×] */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: space.md }}>
                    {rows.map((r, idx) => {
                      const isW = !!r.warmup;
                      const workIdx = rows.slice(0, idx).filter((x) => !x.warmup).length; // posição entre as de trabalho
                      const isDone = isW ? !!r.done : workIdx < doneSets;
                      const removable = isW || workIdx >= prescribed; // só linhas além da prescrição
                      const holder = last?.sets?.[idx];
                      return (
                        <div key={idx} style={{ ...setGrid, opacity: isW && !isDone ? 0.7 : 1 }}>
                          <button
                            onClick={() => (isW ? toggleRowDone(ex.name, idx) : toggleSet(ex.name, workIdx, totalSets))}
                            aria-pressed={isDone}
                            title={isDone ? "Marcar como não feita" : "Marcar como feita"}
                            style={{
                              height: tap, borderRadius: radius.md, cursor: "pointer", padding: 0,
                              border: `1px solid ${isDone ? color.success : (isW ? tint(color.warn, 0x66) : color.line)}`,
                              background: isDone ? tint(color.success, 0x22) : "transparent",
                              color: isDone ? color.success : (isW ? color.warn : color.text3),
                              fontSize: isW ? 10 : 12, fontFamily: font.mono, fontWeight: 600,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>{isDone ? "✓" : (isW ? "aq" : workIdx + 1)}</button>
                          <input type="number" inputMode="decimal" placeholder={holder ? String(holder.weight) : "kg"} aria-label="Carga em kg"
                            value={r.weight} onChange={(e) => setCell(ex.name, idx, "weight", e.target.value)} style={numInput} />
                          <span style={{ color: color.text4, fontSize: 12, textAlign: "center" }}>×</span>
                          <input type="number" inputMode="numeric" placeholder={holder ? String(holder.reps) : "reps"} aria-label="Repetições"
                            value={r.reps} onChange={(e) => setCell(ex.name, idx, "reps", e.target.value)} style={numInput} />
                          <button
                            onClick={() => toggleWarmup(ex.name, idx)}
                            aria-pressed={isW}
                            title={isW ? "Aquecimento: não conta como volume nem PR. Toque para virar série de trabalho." : "Marcar como aquecimento"}
                            style={{
                              height: tap, borderRadius: radius.md, cursor: "pointer", padding: 0,
                              border: `1px solid ${isW ? color.warn : color.line}`,
                              background: isW ? tint(color.warn, 0x1f) : "transparent",
                              color: isW ? color.warn : color.text5, fontSize: 10, fontFamily: font.mono,
                            }}>aq</button>
                          {removable ? (
                            <button onClick={() => removeRow(ex.name, idx)} title="Remover esta linha" aria-label="Remover linha" style={{
                              height: tap, borderRadius: radius.md, cursor: "pointer", padding: 0,
                              border: "1px solid transparent", background: "transparent",
                              color: color.text5, fontSize: 16, lineHeight: 1,
                            }}>×</button>
                          ) : <span />}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: space.sm, marginTop: space.sm }}>
                    <button onClick={() => addRow(ex.name, true)} style={addRowBtn(color.warn)}>＋ aquecimento</button>
                    <button onClick={() => addRow(ex.name, false)} style={addRowBtn(color.text3)}>＋ série</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Adicionar exercício (modo edição) */}
      {editMode && (
        <button onClick={openAdd} className="hover-lift" style={{
          width: "100%", marginTop: 10, padding: "12px",
          background: "rgba(255,255,255,0.04)", border: `1px dashed ${p.color}66`,
          borderRadius: 10, color: p.accent, fontSize: 13, cursor: "pointer",
        }}>＋ Adicionar exercício ao Treino {activeDay}</button>
      )}

      {/* Visualizador de execução */}
      {viewing && <ExerciseMediaSheet ex={viewing} p={p} onClose={() => setViewing(null)} />}

      {/* Editor de exercício */}
      {editing && (
        <ExerciseEditor
          editing={editing} setEditing={setEditing} p={p}
          dayId={activeDay} saving={savingEx}
          catalog={catalog}
          excludeIds={day.exercises.map((e) => e.id)}
          onSave={saveEx} onClose={closeEditor}
        />
      )}

      {/* Mensagem + salvar */}
      {loading && <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: 16 }}>Carregando histórico…</div>}
      {msg && <div style={{ fontSize: 12, color: msg.startsWith("✅") ? "#7CFC9B" : "#ff9b9b", margin: "12px 0", textAlign: "center" }}>{msg}</div>}
      <button onClick={save} disabled={saving} className="hover-lift" style={saveBtn(p)}>
        {saving ? "Salvando…" : `💾 Salvar Treino ${activeDay}`}
      </button>

      {/* Espaçador para a barra do timer não cobrir o botão de salvar */}
      {timer && <div style={{ height: 96 }} />}

      {/* Barra de timer fixa no rodapé */}
      {timer && (
        <RestTimerBar
          timer={timer} p={p} muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onPauseResume={pauseResume}
          onAdjust={adjust}
          onStop={stopTimer}
        />
      )}
    </div>
  );
}

/* =================== VISUALIZADOR DE EXECUÇÃO =================== */
// Folha que sobe do rodapé com a animação de dois quadros (ou o GIF),
// músculos, dicas e instruções do catálogo. Fecha por ✕, Esc ou toque fora.
function ExerciseMediaSheet({ ex, p, onClose }) {
  const frames = mediaFrames(ex.mediaUrl);
  const twoFrames = frames.length >= 2;
  const reduceMotion = typeof window !== "undefined"
    && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [failed, setFailed] = useState(false);

  // Alterna os quadros; pausa se o usuário tocar na imagem ou se pedir menos movimento.
  useEffect(() => {
    if (!twoFrames || !playing) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 900);
    return () => clearInterval(t);
  }, [twoFrames, playing, frames.length]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = frames[twoFrames ? frame : 0];
  const captionMono = { fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#777", letterSpacing: "0.06em", textTransform: "uppercase" };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={`Execução: ${ex.name}`} style={{
      position: "fixed", inset: 0, zIndex: 60,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto",
        background: "#14141c", borderTop: `2px solid ${p.color}`,
        borderRadius: "18px 18px 0 0", padding: "16px 18px 28px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: p.accent, letterSpacing: "0.05em", lineHeight: 1.1 }}>
              {ex.name}
            </div>
            {ex.muscles && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{ex.muscles}</div>}
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>✕</button>
        </div>

        {/* Mídia */}
        <div style={{ position: "relative", background: "#fff", borderRadius: 12, overflow: "hidden" }}>
          {failed ? (
            <div style={{ padding: 28, textAlign: "center", color: "#555", fontSize: 12, background: "#1a1a24" }}>
              Não foi possível carregar a imagem. Confira a URL no modo ✎ Editar plano.
            </div>
          ) : (
            <img
              src={src} alt={`${ex.name} — ${twoFrames ? (frame === 0 ? "posição inicial" : "posição final") : "execução"}`}
              onClick={() => { if (twoFrames) { setPlaying(false); setFrame((f) => (f + 1) % frames.length); } }}
              onError={() => setFailed(true)}
              style={{ display: "block", width: "100%", maxHeight: "48vh", objectFit: "contain", cursor: twoFrames ? "pointer" : "default", userSelect: "none" }}
            />
          )}
          {twoFrames && !failed && (
            <div style={{ position: "absolute", left: 10, bottom: 10, display: "flex", gap: 6, alignItems: "center" }}>
              {frames.map((_, i) => (
                <span key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i === frame ? p.color : "rgba(0,0,0,0.25)" }} />
              ))}
            </div>
          )}
        </div>

        {twoFrames && !failed && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={captionMono}>{frame === 0 ? "Posição inicial" : "Posição final"} · toque para avançar</span>
            <button onClick={() => setPlaying((v) => !v)} style={{
              background: "none", border: `1px solid ${p.color}55`, color: p.accent,
              borderRadius: 7, padding: "3px 9px", fontSize: 11, cursor: "pointer",
            }}>{playing ? "⏸ Pausar" : "▶ Animar"}</button>
          </div>
        )}

        {/* Prescrição + instruções do catálogo */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {ex.sets && ex.reps && <span style={chip(p.color)}>{ex.sets} × {ex.reps}</span>}
          {ex.rest && <span style={chip(p.color)}>⏱ {ex.rest}</span>}
          {ex.rir && <span style={chip(p.color)}>{ex.rir}</span>}
        </div>
        {ex.note && <p style={{ fontSize: 12, color: "#bbb", lineHeight: 1.55, margin: "12px 0 0" }}>{ex.note}</p>}
        {ex.tips && (
          <>
            <div style={{ ...captionMono, marginTop: 14, marginBottom: 4 }}>Dicas</div>
            <p style={{ fontSize: 12, color: "#bbb", lineHeight: 1.55, margin: 0, whiteSpace: "pre-line" }}>{ex.tips}</p>
          </>
        )}
        {ex.instructions && (
          <>
            <div style={{ ...captionMono, marginTop: 14, marginBottom: 4 }}>Execução</div>
            <p style={{ fontSize: 12, color: "#bbb", lineHeight: 1.55, margin: 0, whiteSpace: "pre-line" }}>{ex.instructions}</p>
          </>
        )}
      </div>
    </div>
  );
}

// Prévia pequena no editor: mostra o(s) quadro(s) da URL digitada.
function MediaPreview({ mediaUrl, p }) {
  const frames = mediaFrames(mediaUrl);
  const [broken, setBroken] = useState({});
  useEffect(() => { setBroken({}); }, [mediaUrl]);
  if (frames.length === 0) {
    return (
      <div style={{ fontSize: 10, color: "#666", lineHeight: 1.5, margin: "-6px 0 12px" }}>
        Sem imagem. Cole a URL de um GIF, ou de duas fotos (inicial|final) separadas por “|”.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, margin: "-4px 0 12px" }}>
      {frames.slice(0, 2).map((u, i) => (
        <div key={i} style={{ width: 96, height: 72, borderRadius: 8, overflow: "hidden", background: "#fff", border: `1px solid ${p.color}33`, flexShrink: 0 }}>
          {broken[i]
            ? <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#a33", background: "#1a1a24", textAlign: "center", padding: 4 }}>não carregou</div>
            : <img src={u} alt="" onError={() => setBroken((b) => ({ ...b, [i]: true }))} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />}
        </div>
      ))}
    </div>
  );
}

const playBtn = (c) => ({
  flexShrink: 0, background: tint(c, 0x22), border: `1px solid ${tint(c, 0x55)}`, color: c,
  borderRadius: 5, width: 24, height: 22, fontSize: 9, lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", padding: 0,
});

/* =================== BARRA DO TIMER =================== */
function RestTimerBar({ timer, p, muted, onToggleMute, onPauseResume, onAdjust, onStop }) {
  const pct = timer.total > 0 ? Math.max(0, Math.min(100, (timer.remaining / timer.total) * 100)) : 0;
  const done = timer.done;

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
      background: "rgba(17,17,24,0.96)", backdropFilter: "blur(10px)",
      borderTop: `2px solid ${done ? "#7CFC9B" : p.color}`,
    }}>
      {/* Barra de progresso */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
        <div style={{
          height: "100%", width: `${done ? 100 : pct}%`,
          background: done ? "#7CFC9B" : `linear-gradient(90deg, ${p.color}, ${p.accent})`,
          transition: "width 0.25s linear",
        }} />
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: 10 }}>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace" }}>
            {done ? "Descanso concluído · série ✓" : "Descansando"}
          </div>
          <div style={{ fontSize: 12, color: "#bbb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {timer.label}
          </div>
        </div>

        {/* Tempo */}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, lineHeight: 1,
          color: done ? "#7CFC9B" : p.accent, letterSpacing: "0.02em",
          minWidth: 78, textAlign: "center",
        }}>
          {done ? "✓" : mmss(timer.remaining)}
        </div>

        {/* Controles */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!done && (
            <>
              <CtrlBtn onClick={() => onAdjust(-30)} title="-30s">−30</CtrlBtn>
              <CtrlBtn onClick={onPauseResume} title={timer.running ? "Pausar" : "Continuar"} accent={p.color}>
                {timer.running ? "⏸" : "▶"}
              </CtrlBtn>
              <CtrlBtn onClick={() => onAdjust(30)} title="+30s">+30</CtrlBtn>
              <CtrlBtn onClick={onToggleMute} title={muted ? "Ativar som" : "Silenciar"}>{muted ? "🔕" : "🔔"}</CtrlBtn>
            </>
          )}
          {done && (
            <CtrlBtn onClick={() => onAdjust(60)} title="Mais 1 min" accent={p.color}>＋1:00</CtrlBtn>
          )}
          <CtrlBtn onClick={onStop} title="Encerrar">✕</CtrlBtn>
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({ children, onClick, title, accent }) {
  return (
    <button onClick={onClick} title={title} className="hover-lift" style={{
      minWidth: 38, height: 38, padding: "0 8px",
      background: accent ? accent + "33" : "rgba(255,255,255,0.06)",
      border: `1px solid ${accent ? accent : "#2a2a35"}`,
      borderRadius: 9, color: "#f0eee8", fontSize: 13, cursor: "pointer",
      fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", justifyContent: "center",
    }}>{children}</button>
  );
}

/* =================== PROGRESSO DE SÉRIES =================== */
function SetProgress({ done, total }) {
  const complete = total > 0 && done >= total;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }} title={`${done} de ${total} séries concluídas`}>
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: "50%",
            background: i < done ? "#7CFC9B" : "rgba(255,255,255,0.12)",
            transition: "background 0.2s",
          }} />
        ))}
      </div>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: complete ? "#7CFC9B" : "#888" }}>
        {done}/{total}
      </span>
    </div>
  );
}

/* =================== EDITOR DE EXERCÍCIO =================== */
function ExerciseEditor({ editing, setEditing, p, dayId, saving, catalog, excludeIds = [], onSave, onClose }) {
  const set = (field, value) => setEditing((e) => ({ ...e, [field]: value }));
  const isAdd = editing._mode === "add";
  const isEdit = !isAdd;

  // Quando mostrar o seletor de catálogo: ao adicionar, ou ao trocar (editar).
  const selecting = (isAdd && !editing.creatingNew) || (isEdit && editing.swapping && !editing.creatingNew);
  const creatingNew = !!editing.creatingNew && (isAdd || editing.swapping);
  // Campos de nome/músculos do catálogo só aparecem ao editar SEM trocar.
  const showCatalogEdit = isEdit && !editing.swapping;

  // Campo onde o alvo escolhido é guardado (add usa catalogId; troca usa swapTargetId).
  const targetField = isAdd ? "catalogId" : "swapTargetId";
  const selectedId = isAdd ? editing.catalogId : editing.swapTargetId;
  const selected = (catalog || []).find((c) => c.id === selectedId);

  // Catálogo filtrado: tira o que já está neste dia + aplica a busca digitada.
  const exclude = new Set(excludeIds);
  const q = (editing.query || "").trim().toLowerCase();
  const options = (catalog || [])
    .filter((c) => !exclude.has(c.id))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.muscles || "").toLowerCase().includes(q));

  const showPrescription = isEdit || editing.catalogId || editing.creatingNew;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60, padding: 16,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto",
          background: "#14141c", border: `1px solid ${p.color}55`,
          borderRadius: 16, padding: "22px 20px",
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: p.accent, letterSpacing: "0.05em" }}>
            {isAdd ? `ADICIONAR · TREINO ${dayId}` : "EDITAR EXERCÍCIO"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* ---------- SELETOR DE CATÁLOGO (adicionar OU trocar) ---------- */}
        {selecting && (
          <>
            {isEdit && (
              <div style={{ fontSize: 10, color: "#777", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Trocar “{editing.name}” por:
              </div>
            )}
            <EditorField label="Exercício">
              <input
                value={editing.query || ""}
                onChange={(e) => set("query", e.target.value)}
                style={fullInput} autoFocus
                placeholder="Buscar no catálogo…" />
            </EditorField>

            <div style={{
              maxHeight: 200, overflowY: "auto", margin: "0 0 6px",
              border: "1px solid #2a2a35", borderRadius: 10,
            }}>
              {options.length === 0 ? (
                <div style={{ padding: "14px", fontSize: 12, color: "#666", textAlign: "center" }}>
                  {q ? "Nenhum exercício encontrado." : "Catálogo vazio."}
                </div>
              ) : options.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button key={c.id} onClick={() => set(targetField, c.id)} style={{
                    display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "10px 12px", border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    background: active ? p.color + "22" : "transparent",
                    color: active ? p.accent : "#ddd",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{c.name}</div>
                    {c.muscles && <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{c.muscles}</div>}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14 }}>
              <button onClick={() => set("creatingNew", true)} style={{
                background: "none", border: "none", color: p.accent, cursor: "pointer", fontSize: 12, padding: "4px 0",
              }}>＋ Criar exercício novo</button>
              {isEdit && (
                <button onClick={() => { set("swapping", false); set("swapTargetId", null); }} style={{
                  background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12, padding: "4px 0",
                }}>← Cancelar troca</button>
              )}
            </div>
          </>
        )}

        {/* ---------- CRIAR NOVO NO CATÁLOGO (adicionar OU trocar) ---------- */}
        {creatingNew && (
          <>
            <div style={{ fontSize: 10, color: "#777", marginBottom: 10, lineHeight: 1.5 }}>
              Novo exercício no catálogo — fica disponível para os dois perfis.
            </div>
            <EditorField label="Nome">
              <input value={editing.newName || ""} onChange={(e) => set("newName", e.target.value)} style={fullInput} autoFocus placeholder="Ex.: Abdominal Inclinado" />
            </EditorField>
            <EditorField label="Músculos">
              <input value={editing.newMuscles || ""} onChange={(e) => set("newMuscles", e.target.value)} style={fullInput} placeholder="Reto Abdominal" />
            </EditorField>
            <button onClick={() => set("creatingNew", false)} style={{
              background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12, padding: "0 0 14px",
            }}>← Escolher do catálogo existente</button>
          </>
        )}

        {/* ---------- EDITAR CATÁLOGO (editar, sem trocar) ---------- */}
        {showCatalogEdit && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Catálogo · afeta todos os planos
              </span>
              <button onClick={() => set("swapping", true)} style={{
                background: "none", border: `1px solid ${p.color}55`, color: p.accent,
                cursor: "pointer", fontSize: 11, padding: "4px 8px", borderRadius: 7,
              }}>🔄 Trocar exercício</button>
            </div>
            <EditorField label="Nome">
              <input value={editing.name || ""} onChange={(e) => set("name", e.target.value)} style={fullInput} placeholder="Ex.: Agachamento Livre" />
            </EditorField>
            <EditorField label="Músculos">
              <input value={editing.muscles || ""} onChange={(e) => set("muscles", e.target.value)} style={fullInput} placeholder="Quadríceps, Glúteos" />
            </EditorField>
            <EditorField label="Imagem ou GIF de execução (URL)">
              <input value={editing.mediaUrl || ""} onChange={(e) => set("mediaUrl", e.target.value)} style={fullInput}
                placeholder="https://… (ou duas fotos: inicial|final)" inputMode="url" />
            </EditorField>
            <MediaPreview mediaUrl={editing.mediaUrl} p={p} />
            <div style={{ height: 1, background: "#2a2a35", margin: "6px 0 16px" }} />
          </>
        )}

        {/* ---------- Prescrição do bloco ---------- */}
        {showPrescription && (
          <>
            <div style={{ fontSize: 10, color: "#777", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Prescrição neste dia
              {selected && <span style={{ color: p.accent, textTransform: "none", letterSpacing: 0 }}> · {selected.name}</span>}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <EditorField label="Séries" flex>
                <input value={editing.sets || ""} onChange={(e) => set("sets", e.target.value)} style={fullInput} placeholder="4" />
              </EditorField>
              <EditorField label="Reps" flex>
                <input value={editing.reps || ""} onChange={(e) => set("reps", e.target.value)} style={fullInput} placeholder="8–10" />
              </EditorField>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <EditorField label="Intervalo" flex>
                <input value={editing.rest || ""} onChange={(e) => set("rest", e.target.value)} style={fullInput} placeholder="2 min" />
              </EditorField>
              <EditorField label="RIR" flex>
                <input value={editing.rir || ""} onChange={(e) => set("rir", e.target.value)} style={fullInput} placeholder="2 RIR" />
              </EditorField>
            </div>

            <EditorField label="Dica deste bloco (opcional)">
              <textarea value={editing.note || ""} onChange={(e) => set("note", e.target.value)} style={{ ...fullInput, minHeight: 56, resize: "vertical" }} placeholder="Pausa de 1s no topo…" />
            </EditorField>

            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 18px", cursor: "pointer", fontSize: 13, color: "#bbb" }}>
              <input type="checkbox" checked={!!editing.priority} onChange={(e) => set("priority", e.target.checked)} style={{ width: 16, height: 16, accentColor: p.color }} />
              Marcar como prioridade
            </label>
          </>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a35", borderRadius: 10, color: "#bbb", fontSize: 14, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={onSave} disabled={saving} className="hover-lift" style={{ flex: 1, padding: "12px", background: `linear-gradient(135deg, ${p.color}, ${p.accent})`, border: "none", borderRadius: 10, color: "#0d0d12", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            {saving ? "Salvando…" : (isAdd ? "Adicionar" : "Salvar")}
          </button>
        </div>

        {isEdit && !editing.swapping && (
          <p style={{ fontSize: 10, color: "#555", marginTop: 14, lineHeight: 1.6 }}>
            Renomear é seguro: o histórico continua ligado a este exercício. Para substituir por um movimento diferente (ex.: prancha → abdominal), use “Trocar exercício” — cada um mantém o seu histórico.
          </p>
        )}
      </div>
    </div>
  );
}

function EditorField({ label: lbl, flex, children }) {
  return (
    <div style={{ marginBottom: 12, flex: flex ? 1 : undefined }}>
      <div style={{ ...label, marginBottom: 5 }}>{lbl}</div>
      {children}
    </div>
  );
}

const miniActionBtn = (color) => ({
  width: 30, height: 30, borderRadius: 8, padding: 0, cursor: "pointer",
  background: color + "1a", border: `1px solid ${color}55`, color,
  fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
});
const arrowBtn = (color, disabled) => ({
  width: 26, height: 18, borderRadius: 5, padding: 0,
  cursor: disabled ? "default" : "pointer",
  background: disabled ? "rgba(255,255,255,0.03)" : color + "1a",
  border: `1px solid ${disabled ? "#2a2a35" : color + "55"}`,
  color: disabled ? "#3a3a45" : color,
  fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
});
const fullInput = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a35", borderRadius: 8,
  padding: "10px 12px", color: "#f0eee8", fontSize: 13, fontFamily: "inherit",
};
const label = { color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 };
const dateInput = {
  height: 36, padding: "0 8px", boxSizing: "border-box",
  background: color.surface2, border: `1px solid ${color.line}`, borderRadius: radius.md,
  color: color.text, fontSize: 12, fontFamily: font.mono, colorScheme: "dark",
};
// Grade da linha de série: [✓] [kg] × [reps] [aq] [×] — larguras iguais em todas as linhas
const setGrid = {
  display: "grid", gridTemplateColumns: "40px minmax(0,1fr) 14px minmax(0,1fr) 40px 28px",
  gap: 6, alignItems: "center",
};
const addRowBtn = (c) => ({
  background: "transparent", border: `1px dashed ${tint(c, 0x66)}`, borderRadius: radius.sm,
  height: 32, padding: "0 12px", color: c, fontSize: 11, cursor: "pointer",
  fontFamily: font.mono,
});
const saveBtn = (p) => ({
  width: "100%", background: `linear-gradient(135deg, ${p.color}, ${p.accent})`, border: "none",
  borderRadius: 12, padding: "14px", color: "#0d0d12", fontWeight: 600, fontSize: 14,
  cursor: "pointer", marginTop: 8,
});