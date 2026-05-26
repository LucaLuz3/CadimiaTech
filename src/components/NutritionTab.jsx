import { nutritionData } from "../data/plans";

export default function NutritionTab({ who, p }) {
  const cards = nutritionData[who];

  return (
    <div className="fade-in">
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: p.accent, letterSpacing: "0.05em", marginBottom: 16 }}>
        NUTRIÇÃO — {p.name.toUpperCase()}
      </div>

      {cards.map((card, i) => (
        <div key={i} style={{
          background: `${p.color}0f`,
          border: `1px solid ${p.color}2a`,
          borderRadius: 12,
          padding: 16,
          marginBottom: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>{card.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{card.title}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", color: p.accent, fontSize: 13 }}>{card.value}</div>
              <div style={{ color: "#666", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>{card.sub}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>{card.note}</div>
        </div>
      ))}

      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 16,
        marginTop: 4,
      }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: "#666", letterSpacing: "0.08em", marginBottom: 8 }}>DICA DE CASAL 💑</div>
        <p style={{ fontSize: 12, color: "#777", lineHeight: 1.7 }}>
          Vocês podem compartilhar praticamente todas as refeições — apenas ajustem as{" "}
          <strong style={{ color: "#bbb" }}>porções de proteína e carboidrato</strong> para os pesos de cada um.
          A base da dieta (vegetais, fontes proteicas, gorduras boas) é idêntica para ambos os objetivos.
        </p>
      </div>
    </div>
  );
}
