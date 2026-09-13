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
    <Raiz />
  </React.StrictMode>
);
