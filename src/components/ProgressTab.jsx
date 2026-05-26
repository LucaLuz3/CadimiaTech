import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { measurementTypes } from "../data/plans";
import {
  addBodyWeight, getBodyWeights, deleteBodyWeight,
  addMeasurement, getMeasurements, deleteMeasurement,
  uploadPhoto, getPhotos, deletePhoto,
} from "../lib/db";

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtShort = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function ProgressTab({ who, p }) {
  const [sub, setSub] = useState("peso");
  const subs = [
    ["peso", "⚖️ Peso"],
    ["medidas", "📏 Medidas"],
    ["fotos", "📸 Fotos"],
  ];

  return (
    <div className="fade-in">
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: p.accent, letterSpacing: "0.05em", marginBottom: 14 }}>
        EVOLUÇÃO — {p.name.toUpperCase()}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {subs.map(([id, label]) => (
          <button key={id} className="tab-btn" onClick={() => setSub(id)} style={{
            background: sub === id ? p.color + "22" : "rgba(255,255,255,0.04)",
            border: `1px solid ${sub === id ? p.color + "66" : "#2a2a35"}`,
            borderRadius: 20, padding: "7px 14px", fontSize: 12,
            color: sub === id ? p.accent : "#888", fontWeight: sub === id ? 600 : 400,
          }}>{label}</button>
        ))}
      </div>

      <p style={{ fontSize: 11, color: "#555", marginBottom: 16, lineHeight: 1.6 }}>
        💡 As cargas e repetições de cada treino agora são registradas direto na aba <strong style={{ color: "#888" }}>Treinos</strong>.
      </p>

      {sub === "peso" && <BodyWeight who={who} p={p} />}
      {sub === "medidas" && <Measurements who={who} p={p} />}
      {sub === "fotos" && <Photos who={who} p={p} />}
    </div>
  );
}

/* =================== PESO CORPORAL =================== */
function BodyWeight({ who, p }) {
  const [entries, setEntries] = useState([]);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try { setEntries(await getBodyWeights(who)); } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [who]);

  async function add() {
    if (!weight) return;
    await addBodyWeight({ person: who, date, weight: Number(weight) });
    setWeight(""); refresh();
  }
  async function remove(id) { await deleteBodyWeight(id); refresh(); }

  const chart = entries.map((e) => ({ date: fmtShort(e.date), peso: Number(e.weight) }));
  const latest = entries[entries.length - 1];
  const first = entries[0];
  const delta = latest && first ? (latest.weight - first.weight).toFixed(1) : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input type="number" inputMode="decimal" placeholder="Peso (kg)" value={weight}
          onChange={(e) => setWeight(e.target.value)} style={{ ...dateInput, flex: 1, minWidth: 110 }} />
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={dateInput} />
        <button onClick={add} className="hover-lift" style={addBtn(p)}>＋</button>
      </div>

      {loading ? <Loading /> : entries.length === 0 ? <Empty text="Nenhum registro de peso ainda." /> : (
        <>
          {delta !== null && (
            <div style={{ display: "flex", gap: 14, marginBottom: 12, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
              <span style={{ color: "#888" }}>Atual: <strong style={{ color: p.accent }}>{latest.weight}kg</strong></span>
              <span style={{ color: Number(delta) <= 0 ? "#7CFC9B" : "#ffd166" }}>Δ {delta > 0 ? "+" : ""}{delta}kg</span>
            </div>
          )}
          <Chart data={chart} dataKey="peso" color={p.color} unit="kg" />
          <HistoryList items={entries} render={(e) => `${e.weight} kg`} onDelete={remove} accent={p.accent} />
        </>
      )}
    </div>
  );
}

/* =================== MEDIDAS =================== */
function Measurements({ who, p }) {
  const [entries, setEntries] = useState([]);
  const [type, setType] = useState(measurementTypes[0].key);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState(measurementTypes[0].key);

  async function refresh() {
    setLoading(true);
    try { setEntries(await getMeasurements(who)); } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [who]);

  async function add() {
    if (!value) return;
    await addMeasurement({ person: who, date, type, value: Number(value) });
    setValue(""); setViewType(type); refresh();
  }
  async function remove(id) { await deleteMeasurement(id); refresh(); }

  const filtered = entries.filter((e) => e.type === viewType);
  const chart = filtered.map((e) => ({ date: fmtShort(e.date), v: Number(e.value) }));
  const typeLabel = measurementTypes.find((t) => t.key === viewType)?.label;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...dateInput, flex: 1, minWidth: 110 }}>
          {measurementTypes.map((t) => <option key={t.key} value={t.key} style={{ background: "#1a1a22" }}>{t.label}</option>)}
        </select>
        <input type="number" inputMode="decimal" placeholder="cm" value={value}
          onChange={(e) => setValue(e.target.value)} style={{ ...dateInput, width: 80 }} />
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={dateInput} />
        <button onClick={add} className="hover-lift" style={addBtn(p)}>＋</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {measurementTypes.map((t) => (
          <button key={t.key} onClick={() => setViewType(t.key)} className="tab-btn" style={{
            background: viewType === t.key ? p.color + "22" : "transparent",
            border: `1px solid ${viewType === t.key ? p.color + "66" : "#2a2a35"}`,
            borderRadius: 6, padding: "4px 9px", fontSize: 10,
            color: viewType === t.key ? p.accent : "#777", fontFamily: "'DM Mono', monospace",
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? <Loading /> : filtered.length === 0 ? <Empty text={`Nenhuma medida de "${typeLabel}" ainda.`} /> : (
        <>
          <Chart data={chart} dataKey="v" color={p.color} unit="cm" />
          <HistoryList items={filtered} render={(e) => `${typeLabel}: ${e.value} cm`} onDelete={remove} accent={p.accent} />
        </>
      )}
    </div>
  );
}

/* =================== FOTOS =================== */
function Photos({ who, p }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [date, setDate] = useState(today());
  const [pose, setPose] = useState("frente");

  async function refresh() {
    setLoading(true);
    try { setPhotos(await getPhotos(who)); } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [who]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { await uploadPhoto({ person: who, date, pose, file }); await refresh(); }
    catch (err) { alert("Erro ao enviar foto: " + err.message); }
    setUploading(false);
    e.target.value = "";
  }
  async function remove(row) {
    if (!confirm("Apagar esta foto?")) return;
    await deletePhoto(row); refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={pose} onChange={(e) => setPose(e.target.value)} style={dateInput}>
          {["frente", "lado", "costas"].map((x) => <option key={x} value={x} style={{ background: "#1a1a22" }}>{x}</option>)}
        </select>
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={dateInput} />
        <label className="hover-lift" style={{ ...addBtn(p), display: "inline-flex", alignItems: "center", padding: "0 16px", width: "auto", cursor: "pointer", fontSize: 12, gap: 6 }}>
          {uploading ? "Enviando…" : "📸 Adicionar"}
          <input type="file" accept="image/*" onChange={onFile} disabled={uploading} style={{ display: "none" }} />
        </label>
      </div>

      {loading ? <Loading /> : photos.length === 0 ? <Empty text="Nenhuma foto de progresso ainda." /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
          {photos.map((ph) => (
            <div key={ph.id} style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid #2a2a35", aspectRatio: "3/4" }}>
              {ph.url && <img src={ph.url} alt={ph.pose} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.8))", padding: "14px 8px 6px", fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#ddd", display: "flex", justifyContent: "space-between" }}>
                <span>{fmtShort(ph.date)} · {ph.pose}</span>
              </div>
              <button onClick={() => remove(ph)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6, color: "#fff", width: 22, height: 22, cursor: "pointer", fontSize: 12 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 10, color: "#555", marginTop: 12, lineHeight: 1.6 }}>
        As fotos ficam privadas (só acessíveis com o login de vocês) e são comprimidas automaticamente para economizar espaço. Tire sempre na mesma luz, pose e horário para comparações úteis.
      </p>
    </div>
  );
}

/* =================== HELPERS DE UI =================== */
function Chart({ data, dataKey, color, unit }) {
  return (
    <div style={{ height: 200, marginBottom: 16, marginLeft: -10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 14, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 10, fontFamily: "DM Mono" }} tickLine={false} axisLine={{ stroke: "#2a2a35" }} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "#666", fontSize: 10, fontFamily: "DM Mono" }} tickLine={false} axisLine={false} width={36} unit={unit} />
          <Tooltip contentStyle={{ background: "#16161f", border: "1px solid #2a2a35", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#999" }} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HistoryList({ items, render, onDelete, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {[...items].reverse().map((e) => (
        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.025)", borderRadius: 8, fontSize: 12 }}>
          <span style={{ color: "#999", fontFamily: "'DM Mono', monospace" }}>{fmt(e.date)}</span>
          <span style={{ color: accent }}>{render(e)}</span>
          <button onClick={() => onDelete(e.id)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      ))}
    </div>
  );
}

const Loading = () => <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: 30 }}>Carregando…</div>;
const Empty = ({ text }) => <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: 30, fontStyle: "italic" }}>{text}</div>;

const dateInput = {
  background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a35", borderRadius: 8,
  padding: "10px 12px", color: "#f0eee8", fontSize: 13, colorScheme: "dark",
};
const addBtn = (p) => ({
  background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)`, border: "none", borderRadius: 8,
  width: 44, color: "#0d0d12", fontSize: 20, fontWeight: 700, cursor: "pointer",
});
