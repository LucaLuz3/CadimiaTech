import { useState, useEffect } from "react";
import { supabase, isConfigured } from "./lib/supabase";
import { profiles } from "./data/plans";
import Auth from "./components/Auth";
import WorkoutTab from "./components/WorkoutTab";
import AnalysisTab from "./components/AnalysisTab";
import NutritionTab from "./components/NutritionTab";
import ProgressTab from "./components/ProgressTab";

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [who, setWho] = useState("isa");
  const [activeTab, setActiveTab] = useState("treinos");

  useEffect(() => {
    if (!isConfigured) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>Carregando…</div>;
  }
  if (!isConfigured || !session) return <Auth />;

  const p = profiles[who];

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d12", color: "#f0eee8" }}>
      {/* WHO TOGGLE */}
      <div style={{ background: "#111118", padding: "16px 20px 0", borderBottom: "1px solid #222" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: "0.08em", color: "#444" }}>TREINO DUO</span>
            <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "1px solid #2a2a35", borderRadius: 8, color: "#666", fontSize: 11, padding: "5px 10px", cursor: "pointer" }}>Sair</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["isa", "luca"].map((k) => {
              const pr = profiles[k];
              const active = who === k;
              return (
                <button key={k} className="hover-lift" onClick={() => setWho(k)} style={{
                  flex: 1,
                  background: active ? `linear-gradient(135deg, ${pr.color}33, ${pr.color}18)` : "rgba(255,255,255,0.04)",
                  border: `2px solid ${active ? pr.color : "#2a2a35"}`,
                  borderRadius: 14, padding: "16px", cursor: "pointer", textAlign: "left", color: "#fff",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 22 }}>{pr.emoji}</span>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: "0.05em", color: active ? pr.accent : "#555" }}>{pr.name.toUpperCase()}</span>
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: active ? "#bbb" : "#444", lineHeight: 1.5 }}>
                    {pr.weight}kg · {pr.height}cm
                  </div>
                  <div style={{ fontSize: 11, color: active ? pr.accent : "#444", marginTop: 4 }}>{pr.tagline}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* NAV */}
      <div style={{ background: "#0d0d12", borderBottom: "1px solid #1e1e28", position: "sticky", top: 0, zIndex: 10, padding: "0 20px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", overflowX: "auto" }}>
          {[["treinos", "💪 Treinos"], ["evolucao", "📈 Evolução"], ["analise", "📊 Análise"], ["nutricao", "🥗 Nutrição"]].map(([id, label]) => (
            <button key={id} className="tab-btn" onClick={() => setActiveTab(id)} style={{
              borderBottom: `2px solid ${activeTab === id ? p.color : "transparent"}`,
              color: activeTab === id ? "#fff" : "#555",
              padding: "12px 14px", fontSize: 12, whiteSpace: "nowrap",
              fontWeight: activeTab === id ? 600 : 400,
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "20px 16px 60px" }}>
        {activeTab === "treinos" && <WorkoutTab p={p} />}
        {activeTab === "evolucao" && <ProgressTab who={who} p={p} />}
        {activeTab === "analise" && <AnalysisTab who={who} p={p} />}
        {activeTab === "nutricao" && <NutritionTab who={who} p={p} />}
      </div>
    </div>
  );
}
