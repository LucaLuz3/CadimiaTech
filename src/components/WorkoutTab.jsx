import { useState, useEffect, useMemo } from "react";
import { saveWorkoutLog, getWorkoutLogs, bestSet } from "../lib/db";

const today = () => new Date().toISOString().slice(0, 10);
const fmtShort = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const setCount = (sets) => Math.max(1, parseInt(String(sets).match(/\d+/)?.[0] || "3", 10));

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

export default function WorkoutTab({ who, p }) {
  const [activeDay, setActiveDay] = useState("A");
  const [date, setDate] = useState(today());
  const [draft, setDraft] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const day = p.days.find((d) => d.id === activeDay);

  async function refresh() {
    setLoading(true);
    try { setLogs(await getWorkoutLogs(who)); }
    catch (e) { setMsg("Erro ao carregar histórico: " + e.message); }
    setLoading(false);
  }

  // Ao trocar de perfil: volta pro treino A, limpa rascunho e recarrega histórico
  useEffect(() => { setActiveDay("A"); setDraft({}); setMsg(""); refresh(); }, [who]);
  // Ao trocar de dia: limpa rascunho e mensagem (o histórico já está carregado)
  useEffect(() => { setDraft({}); setMsg(""); }, [activeDay]);

  // Agrupa os logs por nome de exercício (logs já vêm ordenados por data desc)
  const logsByExercise = useMemo(() => {
    const map = {};
    for (const l of logs) (map[l.exercise_name] ||= []).push(l);
    return map;
  }, [logs]);

  function setCell(exName, idx, field, value) {
    setDraft((d) => {
      const rows = d[exName]
        ? [...d[exName]]
        : Array.from({ length: setCount(day.exercises.find((e) => e.name === exName).sets) }, () => ({ weight: "", reps: "" }));
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...d, [exName]: rows };
    });
  }

  async function save() {
    setSaving(true); setMsg("");
    try {
      let count = 0;
      for (const ex of day.exercises) {
        const rows = (draft[ex.name] || []).filter((r) => r.weight !== "" || r.reps !== "");
        if (rows.length === 0) continue;
        const sets = rows.map((r) => ({ weight: Number(r.weight) || 0, reps: Number(r.reps) || 0 }));
        await saveWorkoutLog({ person: who, dayId: activeDay, exerciseName: ex.name, date, sets });
        count++;
      }
      if (count === 0) { setMsg("Preencha pelo menos uma série para salvar."); }
      else { setMsg(`✅ Treino ${activeDay} salvo (${count} exercício${count > 1 ? "s" : ""})!`); setDraft({}); await refresh(); }
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
          const rows = draft[ex.name] || Array.from({ length: setCount(ex.sets) }, () => ({ weight: "", reps: "" }));
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
                <RIRBadge rir={ex.rir} color={p.color} />
              </div>

              {/* Meta do exercício */}
              <div style={{ display: "flex", gap: 12, marginLeft: 32, flexWrap: "wrap" }}>
                <div>
                  <div style={label}>Séries × Reps</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: p.accent }}>{ex.sets} × {ex.reps}</div>
                </div>
                <div>
                  <div style={label}>Intervalo</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#bbb" }}>{ex.rest}</div>
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
                  {rows.map((r, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "#555", width: 16, fontFamily: "'DM Mono', monospace" }}>{idx + 1}</span>
                      <input type="number" inputMode="decimal"
                        placeholder={last?.sets?.[idx]?.weight != null ? String(last.sets[idx].weight) : "kg"}
                        value={r.weight}
                        onChange={(e) => setCell(ex.name, idx, "weight", e.target.value)} style={miniInput} />
                      <span style={{ color: "#555", fontSize: 12 }}>×</span>
                      <input type="number" inputMode="numeric"
                        placeholder={last?.sets?.[idx]?.reps != null ? String(last.sets[idx].reps) : "reps"}
                        value={r.reps}
                        onChange={(e) => setCell(ex.name, idx, "reps", e.target.value)} style={miniInput} />
                    </div>
                  ))}
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
