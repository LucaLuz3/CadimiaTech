import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { updateProfile } from "../lib/db";
import { createInvite, setMyShare, leaveDuo } from "../lib/duo";
import { color, font, space, radius, tap, microLabel } from "../theme";

/* ============================================================
   Conta — perfil, dupla e exclusão.

   As três seções existem por motivos diferentes:

   - PERFIL: sexo e nascimento não são enfeite. A equação de Ten-Haaf,
     que a F1 vai usar para estimar gasto energético, precisa dos dois.
     Ficam opcionais aqui porque o V0 ainda não calcula nada com eles.

   - DUPLA: convite por link colável. Mais de 90% do tráfego de convite
     em apps móveis passa por WhatsApp e SMS, então é um link, não um
     card social.

   - EXCLUSÃO: exigência da Apple (5.1.1 v) e do Google. Tem que estar
     DENTRO do app, não num e-mail para o suporte.
   ============================================================ */

export default function Account({ meuId, perfil, duo, onPerfilAtualizado, onDuoMudou }) {
  const [form, setForm] = useState({ display_name: "", sex: "", birth_date: "", height_cm: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [convite, setConvite] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [textoConfirma, setTextoConfirma] = useState("");

  useEffect(() => {
    if (!perfil) return;
    setForm({
      display_name: perfil.display_name || "",
      sex: perfil.sex || "",
      birth_date: perfil.birth_date || "",
      height_cm: perfil.height_cm ?? "",
    });
  }, [perfil]);

  function campo(k, v) { setForm((f) => ({ ...f, [k]: v })); setMsg(""); setErro(""); }

  async function salvar() {
    setSalvando(true); setErro(""); setMsg("");
    try {
      const novo = await updateProfile(meuId, {
        ...form,
        height_cm: form.height_cm === "" ? null : Number(form.height_cm),
      });
      onPerfilAtualizado?.(novo);
      setMsg("Salvo.");
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  async function gerarConvite() {
    setErro(""); setCopiado(false);
    try {
      const c = await createInvite(meuId);
      setConvite(c);
      try { await navigator.clipboard.writeText(c.url); setCopiado(true); } catch { /* sem clipboard: o link fica na tela */ }
    } catch (e) { setErro(e.message); }
  }

  async function alternarCompartilhamento(v) {
    setErro("");
    try { await setMyShare(meuId, v); await onDuoMudou?.(); }
    catch (e) { setErro(e.message); }
  }

  async function desfazerDupla() {
    setErro("");
    try { await leaveDuo(meuId); setConvite(null); await onDuoMudou?.(); }
    catch (e) { setErro(e.message); }
  }

  async function apagarConta() {
    setErro("");
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      await supabase.auth.signOut();
    } catch (e) {
      setErro(
        "Não deu para apagar agora: " + e.message +
        ". Escreva para contato@ilumatech.com.br que apagamos manualmente em até 7 dias."
      );
    }
  }

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: space.xl }}>

      {/* -------- Perfil -------- */}
      <section>
        <div style={microLabel}>PERFIL</div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <Campo id="ac-nome" rotulo="Nome">
            <input id="ac-nome" type="text" value={form.display_name}
              onChange={(e) => campo("display_name", e.target.value)} style={input} />
          </Campo>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Campo id="ac-sexo" rotulo="Sexo">
              <select id="ac-sexo" value={form.sex} onChange={(e) => campo("sex", e.target.value)} style={input}>
                <option value="">—</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
                <option value="outro">Outro</option>
              </select>
            </Campo>
            <Campo id="ac-altura" rotulo="Altura (cm)">
              <input id="ac-altura" type="number" inputMode="numeric" value={form.height_cm}
                onChange={(e) => campo("height_cm", e.target.value)} style={input} />
            </Campo>
          </div>

          <Campo id="ac-nasc" rotulo="Nascimento">
            <input id="ac-nasc" type="date" value={form.birth_date || ""}
              onChange={(e) => campo("birth_date", e.target.value)} style={input} />
          </Campo>

          <p style={nota}>
            Sexo, altura e nascimento entram na estimativa de gasto energético que o
            app vai usar mais para frente. Hoje não mudam nada — pode deixar em branco.
          </p>

          <button onClick={salvar} disabled={salvando} style={{ ...botao, opacity: salvando ? 0.6 : 1 }}>
            {salvando ? "Salvando…" : "Salvar perfil"}
          </button>
        </div>
      </section>

      {/* -------- Dupla -------- */}
      <section>
        <div style={microLabel}>PARCEIRO DE TREINO</div>

        {duo?.partner ? (
          <div style={{ ...caixa, marginTop: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{duo.partner.name}</div>
            <p style={{ ...nota, margin: "0 0 14px" }}>
              {duo.partner.canRead
                ? "Vocês estão compartilhando o progresso."
                : "Você ainda não vê o progresso dele(a) — a escolha é de cada um."}
            </p>

            <label htmlFor="ac-share" style={linhaCheck}>
              <input id="ac-share" type="checkbox" checked={!!duo.myShare}
                onChange={(e) => alternarCompartilhamento(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: color.accent }} />
              <span>Deixar {duo.partner.name} ver meu progresso</span>
            </label>

            <button onClick={desfazerDupla} style={{ ...botaoFraco, marginTop: 14 }}>
              Desfazer a dupla
            </button>
            <p style={{ ...nota, marginTop: 8 }}>
              Desfazer não apaga treino nenhum, de nenhum dos dois.
            </p>
          </div>
        ) : (
          <div style={{ ...caixa, marginTop: 10 }}>
            <p style={{ ...nota, marginTop: 0 }}>
              O app funciona inteiro sozinho. Se quiser, você pode convidar alguém
              para acompanhar o progresso junto — cada um com seu plano e seus dados.
            </p>
            {convite ? (
              <>
                <div style={{
                  fontFamily: font.num, fontSize: 11.5, wordBreak: "break-all",
                  background: color.bg, border: `1px solid ${color.hair}`,
                  borderRadius: radius.md, padding: "10px 12px", marginBottom: 8,
                }}>{convite.url}</div>
                <p style={{ ...nota, margin: 0 }}>
                  {copiado ? "Link copiado — é só colar no WhatsApp. " : "Copie o link e mande para a pessoa. "}
                  Vale por 7 dias.
                </p>
              </>
            ) : (
              <button onClick={gerarConvite} style={botao}>Gerar link de convite</button>
            )}
          </div>
        )}
      </section>

      {/* -------- Sair / apagar -------- */}
      <section>
        <div style={microLabel}>CONTA</div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <button onClick={() => supabase.auth.signOut()} style={botaoFraco}>Sair</button>

          {!confirmando ? (
            <button onClick={() => setConfirmando(true)} style={{ ...botaoFraco, color: color.danger }}>
              Apagar minha conta
            </button>
          ) : (
            <div style={{ ...caixa, borderColor: "rgba(229,115,115,0.4)" }}>
              <p style={{ ...nota, marginTop: 0, color: color.text }}>
                Isso apaga sua conta e <strong>todos</strong> os seus treinos, pesos e medidas.
                Não dá para desfazer. Se você estiver numa dupla, ela também se desfaz —
                mas os dados do seu parceiro continuam intactos.
              </p>
              <label htmlFor="ac-confirma" style={{ ...microLabel, display: "block", marginBottom: 6 }}>
                DIGITE APAGAR PARA CONFIRMAR
              </label>
              <input id="ac-confirma" type="text" value={textoConfirma}
                onChange={(e) => setTextoConfirma(e.target.value)} style={input} autoComplete="off" />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => { setConfirmando(false); setTextoConfirma(""); }} style={{ ...botaoFraco, flex: 1 }}>
                  Cancelar
                </button>
                <button onClick={apagarConta}
                  disabled={textoConfirma.trim().toUpperCase() !== "APAGAR"}
                  style={{
                    ...botao, flex: 1, background: color.danger, color: "#2b0f0f",
                    opacity: textoConfirma.trim().toUpperCase() === "APAGAR" ? 1 : 0.4,
                  }}>
                  Apagar
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {erro && <div style={{ ...caixa, borderColor: "rgba(229,115,115,0.4)", color: color.danger, fontSize: 13 }}>{erro}</div>}
      {msg && <div style={{ ...caixa, borderColor: "rgba(111,220,154,0.4)", color: color.success, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}

function Campo({ id, rotulo, children }) {
  return (
    <div>
      <label htmlFor={id} style={{ ...microLabel, display: "block", marginBottom: 5 }}>{rotulo.toUpperCase()}</label>
      {children}
    </div>
  );
}

const input = {
  width: "100%", boxSizing: "border-box", height: tap, padding: "0 12px",
  background: color.surface2, border: `1px solid ${color.hair}`, borderRadius: radius.md,
  color: color.text, fontSize: 16,
};

const botao = {
  width: "100%", height: tap, cursor: "pointer",
  background: color.accent, border: "none", borderRadius: radius.md,
  color: color.onAccent, fontSize: 15, fontWeight: 600,
};

const botaoFraco = {
  width: "100%", height: tap, cursor: "pointer",
  background: color.surface2, border: `1px solid ${color.hair}`, borderRadius: radius.md,
  color: color.text2, fontSize: 14,
};

const caixa = {
  background: color.surface, border: `1px solid ${color.hair}`,
  borderRadius: radius.md, padding: space.lg,
};

const nota = { fontSize: 12.5, lineHeight: 1.65, color: color.text3, margin: "10px 0 0" };

const linhaCheck = {
  display: "flex", alignItems: "center", gap: 10,
  fontSize: 13.5, color: color.text2, cursor: "pointer",
};
