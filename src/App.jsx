import { useState, useEffect, useCallback } from "react";
import { font, color, space, radius, tint } from "./theme";
import { supabase, isConfigured } from "./lib/supabase";
import { profiles } from "./data/plans";
import { getPlanExercises, getCatalog } from "./lib/db";
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

  // Exercícios carregados do banco, por perfil: { isa: [...placements], luca: [...] }
  const [exercisesByPerson, setExercisesByPerson] = useState({});
  // Catálogo de exercícios (compartilhado) — alimenta o dropdown de seleção.
  const [catalog, setCatalog] = useState([]);
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

  // Carrega os placements (exercícios do plano) de um perfil.
  const loadExercises = useCallback(async (person) => {
    const rows = await getPlanExercises(person);
    setExercisesByPerson((m) => ({ ...m, [person]: rows }));
    return rows;
  }, []);

  // Recarrega o catálogo (após criar/editar um item).
  const loadCatalog = useCallback(async () => {
    const rows = await getCatalog();
    setCatalog(rows);
    return rows;
  }, []);

  // Recarrega após uma edição: o perfil afetado + o catálogo (nome/músculos
  // podem ter mudado e isso reflete em todos os planos).
  const refreshExercises = useCallback(async (person) => {
    try { await Promise.all([loadExercises(person), loadCatalog()]); }
    catch (e) { setExError("Erro ao recarregar exercícios: " + e.message); }
  }, [loadExercises, loadCatalog]);

  // Quando logar, carrega catálogo + exercícios dos dois perfis uma vez.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      setExLoading(true); setExError("");
      try {
        await Promise.all([
          loadCatalog(),
          ...Object.keys(profiles).map((person) => loadExercises(person)),
        ]);
      } catch (e) {
        if (alive) setExError("Erro ao carregar exercícios: " + e.message);
      } finally {
        if (alive) setExLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [session, loadExercises, loadCatalog]);

  if (!authReady) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: color.text3 }}>Carregando…</div>;
  }
  if (!isConfigured || !session) return <Auth />;

  const baseProfile = profiles[who];
  // Monta os "days" a partir dos exercícios do banco, mantendo id/theme do plano.
  // Se ainda não carregou, cai no plano em código (fallback) para nunca quebrar.
  const dbRows = exercisesByPerson[who];
  const days = buildDays(baseProfile, dbRows);
  const p = { ...baseProfile, days };

  const tabs = [
    ["treinos",  "Treinos",  <path d="M6 5v14M18 5v14M3 8v8M21 8v8M6 12h12" />],
    ["evolucao", "Evolução", <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>],
    ["analise",  "Análise",  <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />],
    ["nutricao", "Nutrição", <path d="M4 11h16M5 11a7 7 0 0 1 14 0M6 15h12M8 19h8" />],
  ];

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, paddingBottom: 78 }}>
      {/* ---- Topo: marca + troca de perfil ---- */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: `${space.md}px ${space.lg}px ${space.xs}px`, display: "flex", alignItems: "center", gap: space.sm }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: color.text3 }}>TREINO DUO</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {["isa", "luca"].map((k) => {
            const pr = profiles[k];
            const active = who === k;
            return (
              <button key={k} onClick={() => setWho(k)} aria-pressed={active}
                title={`${pr.name} · ${pr.weight}kg · ${pr.height}cm`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
                  height: 34, padding: active ? "0 4px 0 12px" : "0 4px",
                  background: active ? color.surface2 : "transparent",
                  border: `1px solid ${active ? color.hair : "transparent"}`,
                  borderRadius: radius.pill, color: active ? color.text : color.text3,
                  fontSize: 13, fontWeight: active ? 600 : 400,
                }}>
                {active && <span>{pr.name}</span>}
                <span style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700,
                  background: active ? color.accent : color.surface2,
                  color: active ? color.onAccent : color.text3,
                }}>{pr.name.charAt(0).toUpperCase()}</span>
              </button>
            );
          })}
          <button onClick={() => supabase.auth.signOut()} title="Sair" aria-label="Sair" style={{
            width: 34, height: 34, marginLeft: 2, cursor: "pointer",
            display: "grid", placeItems: "center",
            background: "transparent", border: "none", color: color.text3,
          }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---- Conteúdo ---- */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: `${space.xs}px ${space.md}px` }}>
        {exError && (
          <div style={{ fontSize: 12, color: color.danger, background: tint(color.danger, 0x14), borderRadius: radius.md, padding: "8px 12px", marginBottom: space.md }}>
            {exError}
          </div>
        )}
        {/* WorkoutTab fica SEMPRE montado (só escondido) para não perder o progresso/valores
            ao trocar de aba. O estado vive na sessão e some apenas ao recarregar a página. */}
        <div style={{ display: activeTab === "treinos" ? "block" : "none" }}>
          <WorkoutTab who={who} p={p} catalog={catalog} exLoading={exLoading} onExercisesChanged={() => refreshExercises(who)} />
        </div>
        {activeTab === "evolucao" && <ProgressTab who={who} p={p} />}
        {activeTab === "analise" && <AnalysisTab who={who} p={p} />}
        {activeTab === "nutricao" && <NutritionTab who={who} p={p} />}
      </div>

      {/* ---- Navegação fixa no rodapé (alcance do polegar) ---- */}
      <nav style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
        height: 64, paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(19,18,17,0.93)", backdropFilter: "blur(14px)",
        borderTop: `1px solid ${color.hair}`,
        display: "grid", gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
      }}>
        {tabs.map(([id, label, icon]) => {
          const on = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} aria-current={on ? "page" : undefined} style={{
              display: "grid", placeItems: "center", gap: 3, cursor: "pointer",
              background: "none", border: "none", padding: 0,
              color: on ? color.accent : color.text3, fontSize: 10.5, fontWeight: on ? 600 : 400,
            }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* Monta a lista de dias (A/B/C) a partir dos placements do banco, preservando
   o theme/ordem definidos no plano em código. Cada exercício traz o id do
   CATÁLOGO (vínculo com os logs) e o placementId (para editar/remover o bloco).
   Se ainda não houver dados do banco, usa o plano em código como fallback. */
function buildDays(baseProfile, dbRows) {
  const planDays = baseProfile?.days || [];
  if (!dbRows) return planDays; // ainda carregando → fallback no plano em código

  const byDay = {};
  for (const r of dbRows) (byDay[r.day_id] ||= []).push(r);

  const planIds = planDays.map((d) => d.id);
  const extraIds = Object.keys(byDay).filter((id) => !planIds.includes(id)).sort();
  const order = [...planIds, ...extraIds];

  return order.map((id) => {
    const planDay = planDays.find((d) => d.id === id);
    const rows = (byDay[id] || []).slice().sort((a, b) => a.position - b.position);
    return {
      id,
      theme: planDay?.theme || "",
      exercises: rows.map((r) => {
        const cat = r.exercises || {};        // item de catálogo embutido
        return {
          id: cat.id || r.exercise_id,        // 👈 id do CATÁLOGO (vínculo com os logs)
          placementId: r.id,                  // 👈 id do placement (editar/remover o bloco)
          name: cat.name || "(sem nome)",
          muscles: cat.muscles || "",
          mediaUrl: cat.media_url || "",
          instructions: cat.instructions || "",
          tips: cat.tips || "",
          sets: r.sets || "",
          reps: r.reps || "",
          rest: r.rest || "",
          rir: r.rir || "",
          note: r.note || "",
          priority: !!r.priority,
        };
      }),
    };
  }).filter((d) => d.exercises.length > 0 || planDays.some((pd) => pd.id === d.id));
}