import { useState } from "react";
import { supabase, isConfigured } from "../lib/supabase";
import { color, font, space, radius, tap } from "../theme";

/* ============================================================
   Entrada do app: login, cadastro e recuperação de senha.

   O que mudou da versão de conta compartilhada:

   - Existe cadastro. Antes só havia signInWithPassword, e a conta era
     criada à mão no painel do Supabase. Sem tela de cadastro não existe
     terceiro usuário — e a Apple rejeita app que exige login sem
     oferecer criação de conta (diretriz 5.1.1(v)).

   - Existe consentimento destacado para dado de saúde. Peso e
     composição corporal são dado pessoal sensível pela LGPD (art. 5º,
     II), e para sensível NÃO vale legítimo interesse: a base é
     consentimento específico e destacado (art. 11, I). Por isso é um
     checkbox próprio, separado dos termos, e não uma linha escondida
     num texto que ninguém lê.
   ============================================================ */

const MODOS = {
  login:    { titulo: "ENTRAR",          acao: "Entrar" },
  cadastro: { titulo: "CRIAR CONTA",     acao: "Criar conta" },
  reset:    { titulo: "RECUPERAR SENHA", acao: "Enviar link" },
};

export default function Auth({ convitePendente }) {
  const [modo, setModo] = useState("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [consentiu, setConsentiu] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  async function enviar(e) {
    e.preventDefault();
    setErro(""); setOk(""); setCarregando(true);
    try {
      if (modo === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;

      } else if (modo === "cadastro") {
        if (!consentiu) throw new Error("Para criar a conta é preciso concordar com o tratamento dos dados de treino e peso.");
        if (senha.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { display_name: nome.trim() || email.split("@")[0] } },
        });
        if (error) throw error;
        // Com confirmação de e-mail ligada, não há sessão ainda.
        if (!data.session) setOk("Conta criada. Confirme pelo link que enviamos no seu e-mail para entrar.");

      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setOk("Se existir conta para esse e-mail, o link de recuperação chegou lá.");
      }
    } catch (err) {
      setErro(traduzErro(err.message));
    } finally {
      setCarregando(false);
    }
  }

  if (!isConfigured) {
    return (
      <div style={wrap}>
        <div style={{ ...card, maxWidth: 460 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>⚙️</div>
          <div style={titulo}>QUASE LÁ</div>
          <p style={{ color: color.text2, fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
            O app ainda não está conectado ao Supabase. Crie um arquivo{" "}
            <code style={code}>.env</code> na raiz do projeto (copie de{" "}
            <code style={code}>.env.example</code>) com as suas chaves e reinicie o servidor.
            O passo a passo está no <strong style={{ color: color.text }}>README.md</strong>.
          </p>
        </div>
      </div>
    );
  }

  const m = MODOS[modo];

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>💪</div>
        <div style={titulo}>TREINO DUO</div>

        {convitePendente && modo !== "reset" && (
          <p style={{ ...aviso, background: color.accentSoft, color: color.accent }}>
            Você foi convidado para uma dupla. Entre ou crie sua conta — a dupla
            se forma sozinha em seguida.
          </p>
        )}

        <div style={{ fontFamily: font.num, fontSize: 11, color: color.text3, margin: "14px 0 18px", letterSpacing: "0.08em" }}>
          {m.titulo}
        </div>

        <form onSubmit={enviar}>
          {modo === "cadastro" && (
            <input id="auth-nome" type="text" placeholder="Como quer ser chamado(a)" value={nome}
              onChange={(e) => setNome(e.target.value)} style={input} autoComplete="name" />
          )}

          <input id="auth-email" type="email" placeholder="E-mail" value={email}
            onChange={(e) => setEmail(e.target.value)} style={input} autoComplete="username" required />

          {modo !== "reset" && (
            <input id="auth-senha" type="password"
              placeholder={modo === "cadastro" ? "Senha (mínimo 8 caracteres)" : "Senha"}
              value={senha} onChange={(e) => setSenha(e.target.value)} style={input}
              autoComplete={modo === "cadastro" ? "new-password" : "current-password"} required />
          )}

          {modo === "cadastro" && (
            <label htmlFor="auth-consent" style={{
              display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left",
              fontSize: 12, lineHeight: 1.6, color: color.text2,
              background: color.surface2, border: `1px solid ${color.hair}`,
              borderRadius: radius.md, padding: "12px 14px", margin: "4px 0 16px", cursor: "pointer",
            }}>
              <input id="auth-consent" type="checkbox" checked={consentiu}
                onChange={(e) => setConsentiu(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: color.accent, flexShrink: 0 }} />
              <span>
                Concordo que o app registre meus <strong style={{ color: color.text }}>treinos, peso e
                medidas corporais</strong> para acompanhar minha evolução. São dados de saúde e
                ficam visíveis só para mim — e para meu parceiro de treino, se eu escolher
                compartilhar. Posso desligar o compartilhamento ou apagar a conta a qualquer
                momento, pela aba Conta.
              </span>
            </label>
          )}

          {erro && <div style={{ ...aviso, background: "rgba(229,115,115,0.12)", color: color.danger }}>{erro}</div>}
          {ok &&   <div style={{ ...aviso, background: "rgba(111,220,154,0.12)", color: color.success }}>{ok}</div>}

          <button type="submit" disabled={carregando} style={{ ...botao, opacity: carregando ? 0.6 : 1 }}>
            {carregando ? "…" : m.acao}
          </button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
          {modo !== "login" && <button type="button" onClick={() => trocar("login")} style={link}>Já tenho conta</button>}
          {modo !== "cadastro" && <button type="button" onClick={() => trocar("cadastro")} style={link}>Criar uma conta</button>}
          {modo !== "reset" && <button type="button" onClick={() => trocar("reset")} style={link}>Esqueci a senha</button>}
        </div>
      </div>
    </div>
  );

  function trocar(novo) { setModo(novo); setErro(""); setOk(""); }
}

function traduzErro(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed"))       return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("user already registered"))   return "Já existe conta com esse e-mail. Tente entrar.";
  if (m.includes("password should be"))        return "A senha precisa de pelo menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas seguidas. Espere um minuto.";
  if (m.includes("unable to validate email"))  return "Esse e-mail não parece válido.";
  return msg;
}

const wrap = {
  minHeight: "100vh", display: "grid", placeItems: "center",
  background: color.bg, padding: space.lg,
};

const card = {
  width: "100%", maxWidth: 380, textAlign: "center",
  background: color.surface, border: `1px solid ${color.hair}`,
  borderRadius: radius.lg, padding: `${space.xl}px ${space.lg}px`,
};

const titulo = {
  fontSize: 22, fontWeight: 700, letterSpacing: "0.04em", color: color.text,
};

const input = {
  width: "100%", boxSizing: "border-box", height: tap,
  padding: "0 14px", marginBottom: 10,
  background: color.bg, border: `1px solid ${color.hair}`, borderRadius: radius.md,
  color: color.text, fontSize: 16,
};

const botao = {
  width: "100%", height: tap, cursor: "pointer",
  background: color.accent, border: "none", borderRadius: radius.md,
  color: color.onAccent, fontSize: 15, fontWeight: 600,
};

const link = {
  background: "none", border: "none", cursor: "pointer",
  color: color.text3, fontSize: 12.5, textDecoration: "underline", padding: 2,
};

const aviso = {
  fontSize: 12, lineHeight: 1.6, textAlign: "left",
  borderRadius: radius.md, padding: "10px 12px", marginBottom: 12,
};

const code = {
  fontFamily: font.num, fontSize: 12,
  background: color.surface2, padding: "1px 5px", borderRadius: 4, color: color.text2,
};
