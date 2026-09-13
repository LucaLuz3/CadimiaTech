import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { measurementTypes } from "../data/plans";
import {
  addBodyWeight, getBodyWeights, deleteBodyWeight,
  addMeasurement, getMeasurements, deleteMeasurement,
} from "../lib/db";
import { color, font, space, radius, tap, microLabel } from "../theme";

/* ============================================================
   Evolução — peso e medidas.

   A sub-aba de FOTOS saiu no corte de escopo do V0 (13/09). Com ela
   saiu toda a dependência de Storage no cliente. As 4 fotos existentes
   continuam no banco; a feature volta depois, com política de dono
   corrigida.

   O peso ficou, e não por inércia: a média móvel exponencial do peso é
   a entrada do motor de autorregulação da F1. Sem série histórica de
   peso, metade do motor não tem o que ler.
   ============================================================ */

const hoje = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtCurto = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function ProgressTab({ profileId, p, readOnly = false }) {
  const [sub, setSub] = useState("peso");
  const subs = [["peso", "Peso"], ["medidas", "Medidas"]];

  return (
    <div className="fade-in">
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 14 }}>
        Evolução — {p.name}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {subs.map(([id, label]) => {
          const on = sub === id;
          return (
            <button key={id} onClick={() => setSub(id)} aria-pressed={on} style={{
              background: on ? color.accentSoft : color.surface,
              border: `1px solid ${on ? color.accentLine : color.hair}`,
              borderRadius: radius.pill, padding: "7px 16px", fontSize: 12.5, cursor: "pointer",
              color: on ? color.accent : color.text3, fontWeight: on ? 600 : 400,
            }}>{label}</button>
          );
        })}
      </div>

      {sub === "peso" && <Peso profileId={profileId} readOnly={readOnly} />}
      {sub === "medidas" && <Medidas profileId={profileId} readOnly={readOnly} />}
    </div>
  );
}

/* =================== PESO =================== */

function Peso({ profileId, readOnly }) {
  const [itens, setItens] = useState([]);
  const [peso, setPeso] = useState("");
  const [data, setData] = useState(hoje());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try { setItens(await getBodyWeights(profileId)); setErro(""); }
    catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, [profileId]);

  useEffect(() => { recarregar(); }, [recarregar]);

  async function adicionar() {
    if (!peso) return;
    try { await addBodyWeight({ date: data, weight: Number(peso) }); setPeso(""); recarregar(); }
    catch (e) { setErro(e.message); }
  }

  async function remover(id) {
    try { await deleteBodyWeight(id); recarregar(); } catch (e) { setErro(e.message); }
  }

  const serie = itens.map((e) => ({ date: fmtCurto(e.date), peso: Number(e.weight) }));
  const ultimo = itens[itens.length - 1];
  const primeiro = itens[0];
  const delta = ultimo && primeiro ? (Number(ultimo.weight) - Number(primeiro.weight)).toFixed(1) : null;

  return (
    <div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <input type="number" inputMode="decimal" step="0.1" placeholder="Peso (kg)"
            value={peso} onChange={(e) => setPeso(e.target.value)}
            style={{ ...campo, flex: "1 1 120px" }} />
          <input type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} style={campo} />
          <button onClick={adicionar} style={botaoMais} aria-label="Adicionar peso">+</button>
        </div>
      )}

      {erro && <Erro texto={erro} />}

      {carregando ? <Carregando /> : itens.length === 0 ? (
        <Vazio>
          <p style={{ margin: "0 0 8px" }}>Nenhuma pesagem registrada ainda.</p>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7 }}>
            Vale pesar pelo menos 4 vezes por semana, sempre no mesmo horário. O peso de um
            dia isolado oscila 1–2 kg por hidratação e não diz nada — o que serve é a
            tendência, e tendência precisa de série.
          </p>
        </Vazio>
      ) : (
        <>
          <div style={{ display: "flex", gap: space.lg, marginBottom: 10, fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ color: color.text3 }}>
              Atual <strong style={{ color: color.accent, fontFamily: font.num }}>{ultimo.weight} kg</strong>
            </span>
            {delta !== null && (
              <span style={{ color: color.text3 }}>
                Desde o início{" "}
                <strong style={{ fontFamily: font.num, color: Number(delta) <= 0 ? color.success : color.text2 }}>
                  {Number(delta) > 0 ? "+" : ""}{delta} kg
                </strong>
              </span>
            )}
          </div>
          <Grafico dados={serie} chave="peso" unidade="kg" />
          <Historico itens={itens} render={(e) => `${e.weight} kg`} onRemover={readOnly ? null : remover} />
        </>
      )}
    </div>
  );
}

/* =================== MEDIDAS =================== */

function Medidas({ profileId, readOnly }) {
  const [itens, setItens] = useState([]);
  const [tipo, setTipo] = useState(measurementTypes[0].key);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [verTipo, setVerTipo] = useState(measurementTypes[0].key);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try { setItens(await getMeasurements(profileId)); setErro(""); }
    catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, [profileId]);

  useEffect(() => { recarregar(); }, [recarregar]);

  async function adicionar() {
    if (!valor) return;
    try { await addMeasurement({ date: data, type: tipo, value: Number(valor) }); setValor(""); recarregar(); }
    catch (e) { setErro(e.message); }
  }

  async function remover(id) {
    try { await deleteMeasurement(id); recarregar(); } catch (e) { setErro(e.message); }
  }

  const filtrados = itens.filter((e) => e.type === verTipo);
  const serie = filtrados.map((e) => ({ date: fmtCurto(e.date), v: Number(e.value) }));
  const rotulo = measurementTypes.find((t) => t.key === verTipo)?.label;

  return (
    <div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...campo, flex: "1 1 130px" }}>
            {measurementTypes.map((t) => (
              <option key={t.key} value={t.key} style={{ background: color.surface2 }}>{t.label}</option>
            ))}
          </select>
          <input type="number" inputMode="decimal" step="0.1" placeholder="cm"
            value={valor} onChange={(e) => setValor(e.target.value)} style={{ ...campo, width: 90 }} />
          <input type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} style={campo} />
          <button onClick={adicionar} style={botaoMais} aria-label="Adicionar medida">+</button>
        </div>
      )}

      {erro && <Erro texto={erro} />}

      <div style={{ ...microLabel, marginBottom: 6 }}>VER NO GRÁFICO</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
        {measurementTypes.map((t) => {
          const on = verTipo === t.key;
          return (
            <button key={t.key} onClick={() => setVerTipo(t.key)} aria-pressed={on} style={{
              background: on ? color.accentSoft : "transparent",
              border: `1px solid ${on ? color.accentLine : color.hair}`,
              borderRadius: radius.sm, padding: "5px 10px", cursor: "pointer",
              fontSize: 11, fontFamily: font.num,
              color: on ? color.accent : color.text3,
            }}>{t.label}</button>
          );
        })}
      </div>

      {carregando ? <Carregando /> : filtrados.length === 0 ? (
        <Vazio><p style={{ margin: 0 }}>Nenhuma medida de {rotulo?.toLowerCase()} registrada.</p></Vazio>
      ) : (
        <>
          <Grafico dados={serie} chave="v" unidade="cm" />
          <Historico itens={filtrados} render={(e) => `${rotulo}: ${e.value} cm`} onRemover={readOnly ? null : remover} />
        </>
      )}
    </div>
  );
}

/* =================== UI =================== */

function Grafico({ dados, chave, unidade }) {
  return (
    <div style={{ height: 200, marginBottom: 16, marginLeft: -10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 6, right: 14, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: color.text3, fontSize: 10, fontFamily: "DM Mono" }}
            tickLine={false} axisLine={{ stroke: color.hair }} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: color.text3, fontSize: 10, fontFamily: "DM Mono" }}
            tickLine={false} axisLine={false} width={38} unit={unidade} />
          <Tooltip
            contentStyle={{ background: color.surface2, border: `1px solid ${color.hair}`, borderRadius: radius.sm, fontSize: 12 }}
            labelStyle={{ color: color.text3 }} />
          <Line type="monotone" dataKey={chave} stroke={color.accent} strokeWidth={2.5}
            dot={{ fill: color.accent, r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Historico({ itens, render, onRemover }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {[...itens].reverse().map((e) => (
        <div key={e.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 12px", background: color.surface, borderRadius: radius.sm, fontSize: 12,
        }}>
          <span style={{ color: color.text3, fontFamily: font.num }}>{fmt(e.date)}</span>
          <span style={{ color: color.accent, fontFamily: font.num }}>{render(e)}</span>
          {onRemover ? (
            <button onClick={() => onRemover(e.id)} aria-label="Remover"
              style={{ background: "none", border: "none", color: color.text3, cursor: "pointer", fontSize: 14 }}>×</button>
          ) : <span style={{ width: 14 }} />}
        </div>
      ))}
    </div>
  );
}

const Carregando = () => (
  <div style={{ textAlign: "center", color: color.text3, fontSize: 12, padding: 30 }}>Carregando…</div>
);

const Vazio = ({ children }) => (
  <div style={{
    color: color.text3, fontSize: 13, padding: space.lg, textAlign: "center",
    background: color.surface, border: `1px solid ${color.hair}`, borderRadius: radius.md,
  }}>{children}</div>
);

const Erro = ({ texto }) => (
  <div style={{
    fontSize: 12, color: color.danger, background: "rgba(229,115,115,0.12)",
    borderRadius: radius.md, padding: "8px 12px", marginBottom: 12,
  }}>{texto}</div>
);

const campo = {
  boxSizing: "border-box", height: tap, padding: "0 12px",
  background: color.surface2, border: `1px solid ${color.hair}`, borderRadius: radius.md,
  color: color.text, fontSize: 15, colorScheme: "dark",
};

const botaoMais = {
  width: 44, height: tap, flexShrink: 0, cursor: "pointer",
  background: color.accent, border: "none", borderRadius: radius.md,
  color: color.onAccent, fontSize: 20, fontWeight: 700,
};
