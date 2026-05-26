import { useState, useEffect } from "react";

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

export default function WorkoutTab({ p }) {
  const [activeDay, setActiveDay] = useState("A");

  // Volta pro treino A ao trocar de perfil
  useEffect(() => { setActiveDay("A"); }, [p.name]);

  const day = p.days.find((d) => d.id === activeDay);

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

      {/* Day theme */}
      <div style={{
        background: `${p.color}18`,
        border: `1px solid ${p.color}33`,
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: p.accent, letterSpacing: "0.05em" }}>TREINO {day.id}</span>
        <span style={{ color: "#666" }}>·</span>
        <span style={{ color: "#bbb", fontSize: 12 }}>{day.theme}</span>
      </div>

      {/* Exercises */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {day.exercises.map((ex, i) => (
          <div key={i} className="ex-row" style={{
            background: i % 2 === 0 ? "rgba(255,255,255,0.025)" : "transparent",
            border: `1px solid ${ex.priority ? p.color + "44" : "rgba(255,255,255,0.06)"}`,
            borderLeft: ex.priority ? `3px solid ${p.color}` : "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: "12px 14px",
          }}>
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

            {ex.note && (
              <div style={{
                marginLeft: 32, marginTop: 8, padding: "5px 10px",
                background: "rgba(255,255,255,0.03)",
                borderLeft: `2px solid ${p.color}66`,
                borderRadius: "0 6px 6px 0",
                fontSize: 11, color: "#777", fontStyle: "italic",
              }}>💡 {ex.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const label = { color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 };
