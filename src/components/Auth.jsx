import { useState } from "react";
import { supabase, isConfigured } from "../lib/supabase";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(traduzErro(error.message));
    setLoading(false);
  }

  if (!isConfigured) {
    return (
      <div style={wrap}>
        <div style={{ ...card, maxWidth: 460 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>⚙️</div>
          <div style={title}>QUASE LÁ</div>
          <p style={{ color: "#999", fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
            O app ainda não está conectado ao Supabase. Crie um arquivo{" "}
            <code style={code}>.env</code> na raiz do projeto (copie de{" "}
            <code style={code}>.env.example</code>) com as suas chaves do Supabase e
            reinicie o servidor. O passo a passo completo está no{" "}
            <strong style={{ color: "#ccc" }}>README.md</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>💪</div>
        <div style={title}>TREINO DUO</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#666", marginTop: 4, marginBottom: 22 }}>
          🌸 ISA &nbsp;·&nbsp; ⚡ LUCA
        </div>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="E-mail compartilhado"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
            autoComplete="username"
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
            autoComplete="current-password"
            required
          />
          {error && <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <button type="submit" disabled={loading} style={btn}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p style={{ color: "#555", fontSize: 11, lineHeight: 1.6, marginTop: 18 }}>
          Vocês usam <strong style={{ color: "#888" }}>um login só</strong>, compartilhado entre os dois.
          O perfil (Isa/Luca) é escolhido dentro do app.
        </p>
      </div>
    </div>
  );
}

function traduzErro(msg) {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Confirme o e-mail antes de entrar (veja a caixa de entrada).";
  return msg;
}

const wrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "radial-gradient(circle at 30% 20%, #1a0f2e 0%, #0d0d12 55%)",
};
const card = {
  width: "100%",
  maxWidth: 360,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid #2a2a35",
  borderRadius: 18,
  padding: "34px 28px",
  textAlign: "center",
};
const title = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 34,
  letterSpacing: "0.08em",
  background: "linear-gradient(90deg, #e0aaff, #ffd166)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};
const input = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid #2a2a35",
  borderRadius: 10,
  padding: "12px 14px",
  color: "#f0eee8",
  fontSize: 14,
  marginBottom: 12,
};
const btn = {
  width: "100%",
  background: "linear-gradient(135deg, #c77dff, #f77f00)",
  border: "none",
  borderRadius: 10,
  padding: "13px",
  color: "#0d0d12",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
const code = {
  background: "rgba(255,255,255,0.08)",
  borderRadius: 4,
  padding: "1px 6px",
  fontFamily: "'DM Mono', monospace",
  fontSize: 12,
};
