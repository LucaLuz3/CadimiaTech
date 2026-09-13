import { useState, useEffect, useCallback, useMemo } from "react";
import { color, space, radius, tint } from "./theme";
import { supabase, isConfigured } from "./lib/supabase";
import { ORDEM_DIAS, temaDoDia } from "./data/plans";
import { getPlanExercises, getCatalog, getProfile } from "./lib/db";
import { getMyDuo, acceptInvite, pegarConviteDaURL } from "./lib/duo";
import Auth from "./components/Auth";
import Account from "./components/Account";
import WorkoutTab from "./components/WorkoutTab";
import AnalysisTab from "./components/AnalysisTab";
import ProgressTab from "./components/ProgressTab";

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Quem eu sou (do JWT) e de quem estou vendo os dados. São iguais na
  // maior parte do tempo; diferem só quando olho o perfil do parceiro,
  // e aí a interface fica em modo leitura.
  const meuId = session?.user?.id || null;
  const [profileId, setProfileId] = useState(null);

  const [perfis, setPerfis] = useState({});   // { [id]: { display_name, ... } }
  const [duo, setDuo] = useState(null);
  const [activeTab, setActiveTab] = useState("treinos");

  const [placementsPorPerfil, setPlacementsPorPerfil] = useState({});
  const [catalog, setCatalog] = useState([]);
  const [exLoading, setExLoading] = useState(true);
  const [exError, setExError] = useState("");
  const [aviso, setAviso] = useState("");

  const somenteLeitura = !!profileId && profileId !== meuId;

  /* ---------- sessão ---------- */
  useEffect(() => {
    if (!isConfigured) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Ao logar, o perfil visto começa sendo o meu.
  useEffect(() => { setProfileId(meuId); }, [meuId]);

  /* ---------- convite pendente na URL ---------- */
  // Guardado antes do login: quem clica no link do parceiro normalmente
  // ainda não tem conta, e o token não pode se perder no caminho.
  const [convitePendente] = useState(() => (isConfigured ? pegarConviteDaURL() : null));

  useEffect(() => {
    if (!meuId || !convitePendente) return;
    let vivo = true;
    (async () => {
      try {
        await acceptInvite(convitePendente);
        if (vivo) { setAviso("Dupla formada."); await carregarDuo(); }
      } catch (e) {
        if (vivo) setAviso("Não deu para aceitar o convite: " + e.message);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meuId, convitePendente]);

  /* ---------- dupla ---------- */
  const carregarDuo = useCallback(async () => {
    if (!meuId) return;
    try {
      const d = await getMyDuo(meuId);
      setDuo(d);
      if (d?.partner?.canRead) {
        const p = await getProfile(d.partner.id);
        if (p) setPerfis((m) => ({ ...m, [p.id]: p }));
      }
    } catch {
      // Dupla é camada opcional: falhar aqui não pode derrubar o app.
      // Quem está sozinho simplesmente segue sozinho.
      setDuo(null);
    }
  }, [meuId]);

  /* ---------- dados ---------- */
  const carregarPlacements = useCallback(async (id) => {
    const rows = await getPlanExercises(id);
    setPlacementsPorPerfil((m) => ({ ...m, [id]: rows }));
    return rows;
  }, []);

  const carregarCatalogo = useCallback(async () => {
    const rows = await getCatalog();
    setCatalog(rows);
    return rows;
  }, []);

  const recarregar = useCallback(async (id) => {
    try { await Promise.all([carregarPlacements(id), carregarCatalogo()]); }
    catch (e) { setExError("Erro ao recarregar exercícios: " + e.message); }
  }, [carregarPlacements, carregarCatalogo]);

  // Carga inicial: meu perfil, meu catálogo, meus exercícios e a dupla.
  useEffect(() => {
    if (!meuId) return;
    let vivo = true;
    (async () => {
      setExLoading(true); setExError("");
      try {
        const [meuPerfil] = await Promise.all([
          getProfile(meuId),
          carregarCatalogo(),
          carregarPlacements(meuId),
          carregarDuo(),
        ]);
        if (vivo && meuPerfil) setPerfis((m) => ({ ...m, [meuId]: meuPerfil }));
      } catch (e) {
        if (vivo) setExError("Erro ao carregar: " + e.message);
      } finally {
        if (vivo) setExLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [meuId, carregarCatalogo, carregarPlacements, carregarDuo]);

  // Os exercícios do parceiro só são buscados quando alguém realmente
  // abre o perfil dele — não na carga inicial.
  useEffect(() => {
    if (!profileId || placementsPorPerfil[profileId]) return;
    carregarPlacements(profileId).catch(() => {});
  }, [profileId, placementsPorPerfil, carregarPlacements]);

  /* ---------- montagem dos dias ---------- */
  const p = useMemo(() => {
    const perfil = perfis[profileId];
    return {
      name: perfil?.display_name || "—",
      days: montarDias(placementsPorPerfil[profileId]),
    };
  }, [perfis, profileId, placementsPorPerfil]);

  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: color.bg, color: color.text3 }}>
        Carregando…
      </div>
    );
  }
  if (!isConfigured || !session) return <Auth convitePendente={convitePendente} />;

  const abas = [
    ["treinos",  "Treinos",  <path d="M6 5v14M18 5v14M3 8v8M21 8v8M6 12h12" />],
    ["evolucao", "Evolução", <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>],
    ["analise",  "Análise",  <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />],
    ["conta",    "Conta",    <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>],
  ];

  // Só entra no seletor quem eu posso de fato ler. Parceiro que desligou
  // o compartilhamento simplesmente não aparece — sem aviso, sem cobrança.
  const perfisVisiveis = [
    { id: meuId, nome: perfis[meuId]?.display_name || "Você" },
    ...(duo?.partner?.canRead ? [{ id: duo.partner.id, nome: duo.partner.name }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: color.bg, color: color.text, paddingBottom: 78 }}>
      {/* ---- Topo ---- */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: `${space.md}px ${space.lg}px ${space.xs}px`, display: "flex", alignItems: "center", gap: space.sm }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: color.text3 }}>TREINO DUO</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {perfisVisiveis.length > 1 && perfisVisiveis.map((perfil) => {
            const ativo = profileId === perfil.id;
            return (
              <button key={perfil.id} onClick={() => setProfileId(perfil.id)} aria-pressed={ativo}
                title={perfil.nome}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
                  height: 34, padding: ativo ? "0 4px 0 12px" : "0 4px",
                  background: ativo ? color.surface2 : "transparent",
                  border: `1px solid ${ativo ? color.hair : "transparent"}`,
                  borderRadius: radius.pill, color: ativo ? color.text : color.text3,
                  fontSize: 13, fontWeight: ativo ? 600 : 400,
                }}>
                {ativo && <span>{perfil.nome}</span>}
                <span style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700,
                  background: ativo ? color.accent : color.surface2,
                  color: ativo ? color.onAccent : color.text3,
                }}>{(perfil.nome || "?").charAt(0).toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Conteúdo ---- */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: `${space.xs}px ${space.md}px` }}>
        {aviso && (
          <div style={{ fontSize: 12, color: color.accent, background: color.accentSoft, borderRadius: radius.md, padding: "8px 12px", marginBottom: space.md, display: "flex", gap: 8 }}>
            <span style={{ flex: 1 }}>{aviso}</span>
            <button onClick={() => setAviso("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
          </div>
        )}
        {exError && (
          <div style={{ fontSize: 12, color: color.danger, background: tint(color.danger, 0x14), borderRadius: radius.md, padding: "8px 12px", marginBottom: space.md }}>
            {exError}
          </div>
        )}
        {somenteLeitura && (
          <div style={{ fontSize: 12, color: color.text2, background: color.surface, border: `1px solid ${color.hair}`, borderRadius: radius.md, padding: "8px 12px", marginBottom: space.md }}>
            Você está vendo o perfil de {p.name}. Só leitura.
          </div>
        )}

        {/* WorkoutTab fica SEMPRE montado (só escondido) para não perder o
            progresso da sessão ao trocar de aba. */}
        <div style={{ display: activeTab === "treinos" ? "block" : "none" }}>
          <WorkoutTab
            profileId={profileId}
            p={p}
            catalog={catalog}
            exLoading={exLoading}
            readOnly={somenteLeitura}
            onExercisesChanged={() => recarregar(profileId)}
          />
        </div>
        {activeTab === "evolucao" && <ProgressTab profileId={profileId} p={p} readOnly={somenteLeitura} />}
        {activeTab === "analise"  && <AnalysisTab profileId={profileId} p={p} />}
        {activeTab === "conta"    && (
          <Account
            meuId={meuId}
            perfil={perfis[meuId]}
            duo={duo}
            onPerfilAtualizado={(novo) => setPerfis((m) => ({ ...m, [novo.id]: novo }))}
            onDuoMudou={async () => { await carregarDuo(); setProfileId(meuId); }}
          />
        )}
      </div>

      {/* ---- Navegação fixa no rodapé ---- */}
      <nav style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
        height: 64, paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(19,18,17,0.93)", backdropFilter: "blur(14px)",
        borderTop: `1px solid ${color.hair}`,
        display: "grid", gridTemplateColumns: `repeat(${abas.length}, 1fr)`,
      }}>
        {abas.map(([id, label, icone]) => {
          const on = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} aria-current={on ? "page" : undefined} style={{
              display: "grid", placeItems: "center", gap: 3, cursor: "pointer",
              background: "none", border: "none", padding: 0,
              color: on ? color.accent : color.text3, fontSize: 10.5, fontWeight: on ? 600 : 400,
            }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icone}</svg>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* Monta a lista de dias a partir dos placements do banco.

   Diferença para a versão anterior: não existe mais "plano em código"
   como fallback, porque não existe mais plano em código. Enquanto os
   dados não chegam, devolve lista vazia e a aba mostra o estado de
   carregamento — o que é honesto, em vez de exibir o plano de outra
   pessoa por um instante.

   Cada exercício traz o id do CATÁLOGO (vínculo com os logs) e o
   placementId (para editar/remover o bloco). */
function montarDias(rows) {
  if (!rows) return [];

  const porDia = {};
  for (const r of rows) (porDia[r.day_id] ||= []).push(r);

  const conhecidos = ORDEM_DIAS.filter((id) => porDia[id]);
  const extras = Object.keys(porDia).filter((id) => !ORDEM_DIAS.includes(id)).sort();

  return [...conhecidos, ...extras].map((id) => {
    const linhas = (porDia[id] || []).slice().sort((a, b) => a.position - b.position);
    const exercicios = linhas.map((r) => {
      const cat = r.exercises || {};
      return {
        id: cat.id || r.exercise_id,   // id do CATÁLOGO (vínculo com os logs)
        placementId: r.id,             // id do placement (editar/remover o bloco)
        name: cat.name || "(sem nome)",
        muscles: cat.muscles || "",
        mediaUrl: cat.media_url || "",
        instructions: cat.instructions || "",
        tips: cat.tips || "",
        ownerId: cat.owner_id ?? null,  // null = catálogo global, não editável
        sets: r.sets || "",
        reps: r.reps || "",
        rest: r.rest || "",
        rir: r.rir || "",
        note: r.note || "",
        priority: !!r.priority,
      };
    });
    return { id, theme: temaDoDia(exercicios), exercises: exercicios };
  });
}
