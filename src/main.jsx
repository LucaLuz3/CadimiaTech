import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import { color, radius, tap } from "./theme";
import "./styles.css";

/* ============================================================
   Registro do service worker.

   registerType: 'prompt' no vite.config significa que uma versão nova
   fica ESPERANDO em vez de assumir sozinha. Aqui mostramos a faixa que
   deixa a pessoa decidir quando recarregar.

   O motivo é concreto: sem isto, um deploy no meio do treino recarrega
   o app entre uma série e outra e leva junto o que ainda não foi salvo.
   ============================================================ */

/* Rede de segurança: sem isto, qualquer erro de render derruba a árvore
   inteira e o usuário vê uma tela preta, sem uma palavra do que houve.
   Foi exatamente o que aconteceu no primeiro deploy da F0 — um `day.id`
   com `day` indefinido, e nenhuma pista na tela.

   Um app usado no meio do treino não pode falhar em silêncio: ou mostra
   o que quebrou, ou pelo menos oferece recarregar. */
class Fronteira extends React.Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error("Erro de render:", erro, info); }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", background: color.bg, color: color.text,
        display: "grid", placeItems: "center", padding: 24,
      }}>
        <div style={{
          maxWidth: 420, background: color.surface, border: `1px solid ${color.hair}`,
          borderRadius: radius.md, padding: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 10 }}>
            Alguma coisa quebrou nesta tela
          </div>
          <p style={{ fontSize: 13.5, color: color.text2, lineHeight: 1.7, margin: "0 0 18px" }}>
            Seus dados estão salvos — o problema é só de exibição. Recarregar
            costuma resolver.
          </p>
          <pre style={{
            textAlign: "left", fontSize: 11, color: color.text3, background: color.bg,
            border: `1px solid ${color.hair}`, borderRadius: 8, padding: 10,
            margin: "0 0 18px", overflowX: "auto", whiteSpace: "pre-wrap",
          }}>{String(this.state.erro?.message || this.state.erro)}</pre>
          <button onClick={() => window.location.reload()} style={{
            width: "100%", height: tap, cursor: "pointer", background: color.accent,
            border: "none", borderRadius: radius.md, color: color.onAccent,
            fontSize: 15, fontWeight: 600,
          }}>Recarregar</button>
        </div>
      </div>
    );
  }
}

function Raiz() {
  const [precisaAtualizar, setPrecisaAtualizar] = useState(false);
  const [atualizar, setAtualizar] = useState(null);

  React.useEffect(() => {
    const update = registerSW({
      onNeedRefresh() { setAtualizar(() => update); setPrecisaAtualizar(true); },
    });
  }, []);

  return (
    <>
      <App />
      {precisaAtualizar && (
        <div role="status" style={{
          position: "fixed", left: 12, right: 12, bottom: 76, zIndex: 60,
          display: "flex", alignItems: "center", gap: 12,
          background: color.surface2, border: `1px solid ${color.accentLine}`,
          borderRadius: radius.md, padding: "10px 12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <span style={{ flex: 1, fontSize: 13, color: color.text }}>
            Tem uma versão nova do app.
          </span>
          <button onClick={() => setPrecisaAtualizar(false)} style={{
            height: 32, padding: "0 10px", cursor: "pointer", fontSize: 13,
            background: "none", border: "none", color: color.text3,
          }}>Depois</button>
          <button onClick={() => atualizar?.(true)} style={{
            height: 32, padding: "0 14px", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: color.accent, border: "none", borderRadius: radius.sm,
            color: color.onAccent, minWidth: 84, lineHeight: `${tap - 10}px`,
          }}>Atualizar</button>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Fronteira>
      <Raiz />
    </Fronteira>
  </React.StrictMode>
);
