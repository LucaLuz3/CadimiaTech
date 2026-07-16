import { useEffect, useState } from "react";
import { getVolumeAnalysis } from "../lib/db";

const REGIONS = [
  { key: "bracos", label: "Braços / ombros" },
  { key: "tronco", label: "Tronco" },
  { key: "pernas", label: "Pernas" },
];

const OK = "#7CFC9B";
const LOW = "#ffc46b";
const HIGH = "#ff9b9b";

// Situação de um músculo em relação à faixa-alvo.
// Julgamos pelo PLANEJADO e pela MÉDIA DAS 4 SEMANAS — nunca pela semana
// atual, que é parcial (numa quinta-feira faltam treinos por definição).
function status(v, min, max) {
  if (max <= 0) return { color: "#555", text: "sem meta" };
  if (v < min) return { color: LOW, text: "abaixo" };
  if (v > max) return { color: HIGH, text: "acima" };
  return { color: OK, text: "na faixa" };
}

function fmt(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

export default function AnalysisTab({ who, p }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    getVolumeAnalysis(who)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message || String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [who]);

  if (loading) {
    return <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: 24 }}>Calculando volume…</div>;
  }
  if (err) {
    return <div style={{ color: "#ff9b9b", fontSize: 12, padding: 16, textAlign: "center" }}>Erro ao carregar: {err}</div>;
  }
  if (!data) return null;

  const { rows, unmapped } = data;
  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: p.accent, letterSpacing: "0.05em", marginBottom: 4 }}>
          ANÁLISE DE VOLUME — {p.name.toUpperCase()}
        </div>
        <p style={{ color: "#666", fontSize: 12, lineHeight: 1.6 }}>
          Séries semanais por grupo muscular, calculadas a partir do plano e dos treinos registrados.
          Primário conta 1,0 · secundário 0,5. Aquecimento não conta.
        </p>
      </div>

      {/* Exercícios sem mapeamento: sem este aviso, o número mente por omissão */}
      {unmapped.length > 0 && (
        <div style={{
          background: "#ffc46b14", border: "1px solid #ffc46b44", borderRadius: 10,
          padding: 12, marginBottom: 16, fontSize: 11, color: "#ffc46b", lineHeight: 1.6,
        }}>
          ⚠️ {unmapped.length} exercício{unmapped.length > 1 ? "s" : ""} do plano sem músculo mapeado —
          o volume abaixo <strong>não</strong> os inclui:{" "}
          <span style={{ color: "#caa464" }}>{unmapped.map((u) => u.exercise_name).join(" · ")}</span>
        </div>
      )}

      {REGIONS.map((reg) => {
        const list = rows.filter((r) => r.region === reg.key);
        if (list.length === 0) return null;
        const regPlanned = list.reduce((s, r) => s + r.planned, 0);
        const share = totalPlanned > 0 ? Math.round((regPlanned / totalPlanned) * 100) : 0;

        return (
          <div key={reg.key} style={{ marginBottom: 22 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              borderBottom: "1px solid #ffffff12", paddingBottom: 5, marginBottom: 12,
            }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: "#999", letterSpacing: "0.08em" }}>
                {reg.label.toUpperCase()}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#666" }}>
                {fmt(regPlanned)} séries · {share}% do plano
              </span>
            </div>

            {list.map((r) => {
              const scale = Math.max(r.max * 1.25, r.planned, r.avg4, 1);
              const st = status(r.planned, r.min, r.max);
              return (
                <div key={r.slug} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: r.priority ? "#f0eee8" : "#888" }}>{r.label}</span>
                      {r.priority && (
                        <span style={{
                          fontSize: 9, color: p.accent, background: p.color + "22", borderRadius: 3,
                          padding: "1px 5px", fontFamily: "'DM Mono', monospace",
                        }}>PRIORIDADE</span>
                      )}
                      <span style={{
                        fontSize: 9, color: st.color, border: `1px solid ${st.color}44`,
                        borderRadius: 3, padding: "1px 5px", fontFamily: "'DM Mono', monospace",
                      }}>{st.text}</span>
                    </div>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>
                      meta {fmt(r.min)}–{fmt(r.max)}
                    </span>
                  </div>

                  {/* Trilho: faixa-alvo sombreada + barra do planejado + marca da média */}
                  <div style={{ position: "relative", background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 10 }}>
                    {r.max > 0 && (
                      <div style={{
                        position: "absolute", top: 0, bottom: 0,
                        left: `${(r.min / scale) * 100}%`,
                        width: `${((r.max - r.min) / scale) * 100}%`,
                        background: OK + "1f", borderLeft: `1px solid ${OK}55`, borderRight: `1px solid ${OK}55`,
                      }} />
                    )}
                    <div style={{
                      position: "absolute", top: 0, bottom: 0, left: 0,
                      width: `${Math.min(100, (r.planned / scale) * 100)}%`,
                      background: r.priority ? p.color : "#4a4a55",
                      borderRadius: 4,
                      transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
                    }} />
                    <div title={`Média das 4 semanas: ${fmt(r.avg4)}`} style={{
                      position: "absolute", top: -2, bottom: -2,
                      left: `${Math.min(100, (r.avg4 / scale) * 100)}%`,
                      width: 2, background: "#f0eee8", opacity: 0.85, borderRadius: 1,
                    }} />
                  </div>

                  <div style={{
                    display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap",
                    fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#666",
                  }}>
                    <span style={{ color: r.priority ? p.accent : "#777" }}>plano {fmt(r.planned)}</span>
                    <span>│ média 4sem {fmt(r.avg4)}</span>
                    <span style={{ color: "#555" }}>│ esta semana {fmt(r.currentWeek)} (parcial)</span>
                    {r.note && <span style={{ color: "#555", fontStyle: "italic" }}>— {r.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div style={{
        marginTop: 18, padding: 14, background: "rgba(255,255,255,0.03)",
        border: "1px solid #ffffff10", borderRadius: 10, fontSize: 11, color: "#666", lineHeight: 1.7,
      }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, background: p.color, borderRadius: 2, marginRight: 6, verticalAlign: -1 }} />
          barra = volume <strong style={{ color: "#999" }}>planejado</strong> ·
          <span style={{ display: "inline-block", width: 2, height: 10, background: "#f0eee8", margin: "0 6px 0 8px", verticalAlign: -1 }} />
          marca = <strong style={{ color: "#999" }}>média realizada</strong> das 4 semanas ·
          <span style={{ display: "inline-block", width: 14, height: 10, background: OK + "1f", border: `1px solid ${OK}55`, margin: "0 6px", verticalAlign: -1 }} />
          faixa-alvo
        </div>
        Faixa em vez de teto: abaixo do mínimo é subestímulo, acima do máximo é fadiga sem retorno
        proporcional (Schoenfeld, Ogborn &amp; Krieger, <em>J Sports Sci</em>, 2017). A média das 4 semanas
        conta semana sem treino como zero — treino não feito é volume zero.
      </div>
    </div>
  );
}