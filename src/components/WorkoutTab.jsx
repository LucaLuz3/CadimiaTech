import { useState, useEffect, useMemo, useRef } from "react";
import { saveWorkoutLog, getWorkoutLogs, bestSet } from "../lib/db";

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

/* ---------- Persistência local do treino em andamento ----------
   Guarda rascunho + progresso no aparelho p/ sobreviver a recarregar a página.
   É por aparelho (não sincroniza entre Isa/Luca) — o que sincroniza é o treino salvo. */
const WIP_KEY = "treino-duo:wip";
function loadWipPart(part) {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(WIP_KEY) : null;
    const obj = raw ? JSON.parse(raw) : {};
    return obj[part] || {};
  } catch { return {}; }
}

export default function WorkoutTab({ who, p }) {
  const [activeDay, setActiveDay] = useState("A");
  const [date, setDate] = useState(today());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

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
  function playChime() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [784, 1047].forEach((freq, i) => { // G5 → C6, sobe leve
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.55);
    });
  }
  function buzz() {
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
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
  // Ajuste manual ao tocar no indicador de uma série (progresso é sequencial).
  function toggleSet(exName, idx, total) {
    patchCompleted(key, (cc) => {
      const cur = cc[exName] || 0;
      const next = idx < cur ? idx : Math.min(total, idx + 1);
      return { ...cc, [exName]: next };
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
  const logsByExercise = useMemo(() => {
    const map = {};
    for (const l of logs) (map[l.exercise_name] ||= []).push(l);
    return map;
  }, [logs]);

  // Valores de partida de um exercício, vindos do último treino salvo (Supabase).
  // É o que deixa os campos já preenchidos "para a próxima vez".
  function baseRows(ex) {
    const n = setCount(ex.sets);
    const last = (logsByExercise[ex.name] || [])[0];
    return Array.from({ length: n }, (_, idx) => ({
      weight: last?.sets?.[idx]?.weight != null ? String(last.sets[idx].weight) : "",
      reps: last?.sets?.[idx]?.reps != null ? String(last.sets[idx].reps) : "",
    }));
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
        const sets = rowsToSave.map((r) => ({ weight: Number(r.weight) || 0, reps: Number(r.reps) || 0 }));
        // saveWorkoutLog faz upsert: se já existe registro deste exercício/data, atualiza em vez de duplicar
        await saveWorkoutLog({ person: who, dayId: activeDay, exerciseName: ex.name, date, sets });
        count++;
      }
      if (count === 0) { setMsg("Marque as séries feitas ou edite algum peso para salvar."); }
      else { setMsg(`✅ Treino ${activeDay} salvo (${count} exercício${count > 1 ? "s" : ""})! Os valores ficaram preenchidos.`); await refresh(); }
    } catch (e) { setMsg("Erro ao salvar: " + e.message); }
    setSaving(false);
  }

  return (
    <div className="fade-in">
      {/* Day Selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {p.days.map((d) => (
          <button key={d.id} className="hover-lift" onClick={() => setActiveDay(d.id)} style={{
            background: activeDay === d.id ? `linear-gradient(135deg, ${p.color}bb, ${p.color}77)` : "rgba(255,255,255,0.04)",
            border: `1px solid ${activeDay === d.id ? p.color : "#2a2a35"}`,
            borderRadius: 10,
            padding: "12px 8px",
            textAlign: "center",
            color: "#fff",
            cursor: "pointer",
          }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, color: activeDay === d.id ? p.accent : "#444", lineHeight: 1 }}>{d.id}</div>
            <div style={{ fontSize: 10, color: activeDay === d.id ? "#ddd" : "#444", marginTop: 3, fontFamily: "'DM Mono', monospace" }}>TREINO {d.id}</div>
          </button>
        ))}
      </div>

      {/* Day theme + data do registro */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: 200,
          background: `${p.color}18`,
          border: `1px solid ${p.color}33`,
          borderRadius: 10,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: p.accent, letterSpacing: "0.05em" }}>TREINO {day.id}</span>
          <span style={{ color: "#666" }}>·</span>
          <span style={{ color: "#bbb", fontSize: 12 }}>{day.theme}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#666", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Data</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={dateInput} />
        </div>
      </div>

      {/* Exercises */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {day.exercises.map((ex, i) => {
          const exLogs = logsByExercise[ex.name] || [];
          const pr = bestSet(exLogs);
          const last = exLogs[0];
          const restSecs = parseRestSeconds(ex.rest);
          const totalSets = setCount(ex.sets);
          const doneSets = completedSets[ex.name] || 0;
          const isResting = timer && !timer.done && timer.key === key && timer.label === ex.name;
          // valores mostrados: o que está no rascunho (editado) ou o último treino salvo
          const rows = draft[ex.name] || baseRows(ex);
          return (
            <div key={i} className="ex-row" style={{
              background: i % 2 === 0 ? "rgba(255,255,255,0.025)" : "transparent",
              border: `1px solid ${ex.priority ? p.color + "44" : "rgba(255,255,255,0.06)"}`,
              borderLeft: ex.priority ? `3px solid ${p.color}` : "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "12px 14px",
            }}>
              {/* Cabeçalho do exercício */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    background: ex.priority ? p.color + "44" : "rgba(255,255,255,0.08)",
                    color: ex.priority ? p.accent : "#555",
                    borderRadius: 5, width: 24, height: 24,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, flexShrink: 0,
                  }}>{i + 1}</span>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</span>
                    {ex.priority && <span style={{ marginLeft: 6, fontSize: 9, color: p.accent, fontFamily: "'DM Mono', monospace", background: p.color + "22", borderRadius: 3, padding: "1px 5px" }}>PRIORIDADE</span>}
                  </div>
                </div>
                {/* Progresso de séries + RIR */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <SetProgress done={doneSets} total={totalSets} />
                  <RIRBadge rir={ex.rir} color={p.color} />
                </div>
              </div>

              {/* Meta do exercício — o Intervalo vira botão p/ iniciar o descanso */}
              <div style={{ display: "flex", gap: 12, marginLeft: 32, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={label}>Séries × Reps</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: p.accent }}>{ex.sets} × {ex.reps}</div>
                </div>
                <div>
                  <div style={label}>Intervalo</div>
                  <button
                    onClick={() => startRest(restSecs, ex.name, totalSets)}
                    className="hover-lift"
                    title={`Iniciar descanso de ${mmss(restSecs)} (marca a próxima série ao zerar)`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: isResting ? p.color + "33" : p.color + "1a",
                      border: `1px solid ${isResting ? p.color : p.color + "44"}`,
                      borderRadius: 7, padding: "4px 9px", cursor: "pointer",
                      color: p.accent, fontFamily: "'DM Mono', monospace", fontSize: 12,
                    }}>
                    ⏱ {mmss(restSecs)}
                  </button>
                </div>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <div style={label}>Músculos</div>
                  <div style={{ fontSize: 11, color: "#777" }}>{ex.muscles}</div>
                </div>
              </div>

              {/* Dica */}
              {ex.note && (
                <div style={{
                  marginLeft: 32, marginTop: 8, padding: "5px 10px",
                  background: "rgba(255,255,255,0.03)",
                  borderLeft: `2px solid ${p.color}66`,
                  borderRadius: "0 6px 6px 0",
                  fontSize: 11, color: "#777", fontStyle: "italic",
                }}>💡 {ex.note}</div>
              )}

              {/* PR + último treino */}
              {(pr || last) && (
                <div style={{ display: "flex", gap: 14, margin: "10px 0 6px 32px", fontSize: 10, fontFamily: "'DM Mono', monospace", flexWrap: "wrap" }}>
                  {pr && <span style={{ color: p.accent }}>🏆 PR: {pr.weight}kg × {pr.reps}</span>}
                  {last && <span style={{ color: "#666" }}>último ({fmtShort(last.date)}): {(last.sets || []).map((s) => `${s.weight}×${s.reps}`).join(", ")}</span>}
                </div>
              )}

              {/* Registro de séries */}
              <div style={{ marginLeft: 32, marginTop: 8 }}>
                <div style={{ ...label, marginBottom: 6 }}>Registrar séries</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {rows.map((r, idx) => {
                    const isDone = idx < doneSets;
                    return (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={() => toggleSet(ex.name, idx, rows.length)}
                          title={isDone ? "Marcar série como NÃO feita" : "Marcar série como feita"}
                          style={{
                            width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: "pointer", padding: 0,
                            border: `1px solid ${isDone ? "#7CFC9B" : "#3a3a45"}`,
                            background: isDone ? "#7CFC9B22" : "transparent",
                            color: isDone ? "#7CFC9B" : "#555", fontSize: 10,
                            fontFamily: "'DM Mono', monospace",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>{isDone ? "✓" : idx + 1}</button>
                        <input type="number" inputMode="decimal" placeholder="kg"
                          value={r.weight}
                          onChange={(e) => setCell(ex.name, idx, "weight", e.target.value)} style={miniInput} />
                        <span style={{ color: "#555", fontSize: 12 }}>×</span>
                        <input type="number" inputMode="numeric" placeholder="reps"
                          value={r.reps}
                          onChange={(e) => setCell(ex.name, idx, "reps", e.target.value)} style={miniInput} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

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

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
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

const label = { color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 };
const dateInput = {
  background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a35", borderRadius: 8,
  padding: "10px 12px", color: "#f0eee8", fontSize: 13, colorScheme: "dark",
};
const miniInput = {
  background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a35", borderRadius: 7,
  padding: "8px 10px", color: "#f0eee8", fontSize: 13, width: 72, textAlign: "center",
  fontFamily: "'DM Mono', monospace",
};
const saveBtn = (p) => ({
  width: "100%", background: `linear-gradient(135deg, ${p.color}, ${p.accent})`, border: "none",
  borderRadius: 12, padding: "14px", color: "#0d0d12", fontWeight: 600, fontSize: 14,
  cursor: "pointer", marginTop: 8,
});