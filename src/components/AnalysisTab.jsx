import { volumeData } from "../data/plans";

export default function AnalysisTab({ who, p }) {
  const rows = volumeData[who];

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: p.accent, letterSpacing: "0.05em", marginBottom: 4 }}>
          ANÁLISE DE VOLUME — {p.name.toUpperCase()}
        </div>
        <p style={{ color: "#666", fontSize: 12, lineHeight: 1.6 }}>
          Séries semanais por grupo muscular. Grupos prioritários recebem volume aumentado.
          Grupos fortes recebem volume de manutenção (8–10 séries).
        </p>
      </div>

      {rows.map(({ m, v, max, priority, note }) => (
        <div key={m} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: priority ? "#f0eee8" : "#777" }}>{m}</span>
              {priority && <span style={{ fontSize: 9, color: p.accent, background: p.color + "22", borderRadius: 3, padding: "1px 5px", fontFamily: "'DM Mono', monospace" }}>PRIORIDADE</span>}
              {note && <span style={{ fontSize: 10, color: "#555", fontStyle: "italic" }}>— {note}</span>}
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: priority ? p.accent : "#555" }}>
              {v > 0 ? `${v} séries` : "—"}
            </span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div style={{
              width: `${(v / max) * 100}%`,
              height: "100%",
              background: priority ? p.color : "#333",
              borderRadius: 4,
              transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
            }} />
          </div>
        </div>
      ))}

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: "#c77dff18", border: "1px solid #c77dff33", borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#e0aaff", letterSpacing: "0.05em", marginBottom: 8 }}>🌸 ISA</div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
            <div><strong style={{ color: "#ccc" }}>Prioridade:</strong> Braços, Inferiores, Core</div>
            <div><strong style={{ color: "#ccc" }}>Manutenção:</strong> Ombros</div>
            <div><strong style={{ color: "#ccc" }}>Proteína:</strong> 94–129g/dia</div>
          </div>
        </div>
        <div style={{ background: "#f77f0018", border: "1px solid #f77f0033", borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffd166", letterSpacing: "0.05em", marginBottom: 8 }}>⚡ LUCA</div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
            <div><strong style={{ color: "#ccc" }}>Prioridade:</strong> Peito, Ombros, Glúteos, Bíceps, Core</div>
            <div><strong style={{ color: "#ccc" }}>Manutenção:</strong> Quads, Panturrilha</div>
            <div><strong style={{ color: "#ccc" }}>Proteína:</strong> 122–167g/dia</div>
          </div>
        </div>
      </div>
    </div>
  );
}
