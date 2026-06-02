import { useState, useEffect, useCallback } from "react";
import { supabase, isConfigured } from "./lib/supabase";
import { profiles } from "./data/plans";
import { getPlanExercises, seedPlanExercisesIfEmpty } from "./lib/db";
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

  // Exercícios carregados do banco, por perfil: { isa: [...linhas], luca: [...] }
  const [exercisesByPerson, setExercisesByPerson] = useState({});
  const [exLoading, setExLoading] = useState(true);
  const [exError, setExError] = useState("");

  useEffect(() => {
    if (!isConfigured) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Carrega (e semeia, se preciso) os exercícios de um perfil a partir do banco.
  const loadExercises = useCallback(async (person) => {
    // Na primeira vez popula a tabela a partir do plano em código (plans.js).
    await seedPlanExercisesIfEmpty(person, profiles[person]?.days || []);
    const rows = await getPlanExercises(person);
    setExercisesByPerson((m) => ({ ...m, [person]: rows }));
    return rows;
  }, []);

  // Recarrega só um perfil — chamado pelas abas após uma edição.
  const refreshExercises = useCallback(async (person) => {
    try { await loadExercises(person); }
    catch (e) { setExError("Erro ao recarregar exercícios: " + e.message); }
  }, [loadExercises]);

  // Quando logar, carrega os exercícios dos dois perfis uma vez.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      setExLoading(true); setExError("");
      try {
        await Promise.all(Object.keys(profiles).map((person) => loadExercises(person)));
      } catch (e) {
        if (alive) setExError("Erro ao carregar exercícios: " + e.message);
      } finally {
        if (alive) setExLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [session, loadExercises]);

  if (!authReady) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>Carregando…</div>;
  }
  if (!isConfigured || !session) return <Auth />;

  const baseProfile = profiles[who];
  // Monta os "days" a partir dos exercícios do banco, mantendo id/theme do plano.
  // Se ainda não carregou, cai no plano em código (fallback) para nunca quebrar.
  const dbRows = exercisesByPerson[who];
  const days = buildDays(baseProfile, dbRows);
  const p = { ...baseProfile, days };

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
        {exError && <div style={{ fontSize: 12, color: "#ff9b9b", textAlign: "center", marginBottom: 12 }}>{exError}</div>}
        {/* WorkoutTab fica SEMPRE montado (só escondido) para não perder o progresso/valores
            ao trocar de aba. O estado vive na sessão e some apenas ao recarregar a página. */}
        <div style={{ display: activeTab === "treinos" ? "block" : "none" }}>
          <WorkoutTab who={who} p={p} exLoading={exLoading} onExercisesChanged={() => refreshExercises(who)} />
        </div>
        {activeTab === "evolucao" && <ProgressTab who={who} p={p} />}
        {activeTab === "analise" && <AnalysisTab who={who} p={p} />}
        {activeTab === "nutricao" && <NutritionTab who={who} p={p} />}
      </div>
    </div>
  );
}

/* Monta a lista de dias (A/B/C) a partir das linhas do banco, preservando o
   theme/ordem definidos no plano em código. Se ainda não houver dados do banco,
   usa o próprio plano como fallback — assim o app nunca aparece vazio. */
function buildDays(baseProfile, dbRows) {
  const planDays = baseProfile?.days || [];
  if (!dbRows) return planDays; // ainda carregando → fallback no plano em código

  const byDay = {};
  for (const r of dbRows) (byDay[r.day_id] ||= []).push(r);

  // Mantém a ordem/tema dos dias do plano; inclui dias novos que só existam no banco.
  const planIds = planDays.map((d) => d.id);
  const extraIds = Object.keys(byDay).filter((id) => !planIds.includes(id)).sort();
  const order = [...planIds, ...extraIds];

  return order.map((id) => {
    const planDay = planDays.find((d) => d.id === id);
    const rows = (byDay[id] || []).slice().sort((a, b) => a.position - b.position);
    return {
      id,
      theme: planDay?.theme || "",
      exercises: rows.map((r) => ({
        id: r.id,            // 👈 id estável do exercício (vínculo com os logs)
        name: r.name,
        sets: r.sets || "",
        reps: r.reps || "",
        rest: r.rest || "",
        rir: r.rir || "",
        muscles: r.muscles || "",
        note: r.note || "",
        priority: !!r.priority,
      })),
    };
  }).filter((d) => d.exercises.length > 0 || planDays.some((pd) => pd.id === d.id));
}