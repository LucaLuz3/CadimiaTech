// ============================================================
//  theme.js — tokens de design do Treino Duo
//
//  Fonte única de fontes, cores, espaçamentos e raios. Paleta "quente"
//  (fundo levemente amarelado, não azulado) com destaque ferrugem, igual
//  para os dois perfis: quem diferencia Bela e Luca é o nome e a inicial,
//  não a cor.
//
//  Regra de uso: componente novo importa daqui; componente antigo migra
//  quando for refinado. Nada de repetir "#2a2a35" à mão.
// ============================================================

export const font = {
  head: "'Inter', system-ui, sans-serif",   // títulos e nomes
  body: "'Inter', system-ui, sans-serif",   // texto corrido
  num:  "'DM Mono', monospace",             // cargas, reps, tempo, rótulos técnicos
};

export const color = {
  bg:       "#131211",                   // fundo da página
  surface:  "#1a1917",                   // card em repouso
  surface2: "#22201d",                   // card aberto / input
  hair:     "rgba(255,255,255,0.08)",    // borda fina
  text:     "#f2efe9",
  text2:    "#a8a39a",                   // secundário
  text3:    "#6f6a62",                   // terciário / desabilitado

  accent:     "#d97757",                 // ferrugem
  accentSoft: "rgba(217,119,87,0.14)",   // fundo de chip
  accentLine: "rgba(217,119,87,0.36)",   // borda de card aberto
  onAccent:   "#2b1109",                 // texto sobre o ferrugem cheio

  success: "#6fdc9a",                    // série concluída
  warn:    "#e7b86a",                    // aquecimento
  danger:  "#e57373",
};

// Espaçamento em múltiplos de 4 — evita "8 aqui, 10 ali, 12 acolá".
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 11, lg: 16, xl: 20, pill: 999 };

// Alvo mínimo de toque no celular (Apple HIG: 44pt).
export const tap = 42;

// Transparência sobre um hex: tint("#d97757", 0x22) → "#d9775722"
export const tint = (hex, a) => hex + a.toString(16).padStart(2, "0");

// ---- Estilos base reutilizáveis ----

export const chip = {
  display: "inline-flex", alignItems: "center", gap: 5,
  fontFamily: font.num, fontSize: 12, color: color.text2,
  background: color.bg, borderRadius: radius.sm, padding: "6px 9px",
  whiteSpace: "nowrap",
};

export const chipAccent = {
  ...chip, color: color.accent, background: color.accentSoft,
};

export const numInput = {
  width: "100%", minWidth: 0, boxSizing: "border-box",
  height: tap, padding: "0 8px", textAlign: "center",
  background: color.bg, border: "1px solid transparent", borderRadius: radius.md,
  color: color.text, fontSize: 16, fontFamily: font.num, fontVariantNumeric: "tabular-nums",
};

export const iconBtn = (active = false) => ({
  width: 38, height: 38, padding: 0, flexShrink: 0, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: active ? color.accent : color.surface2,
  border: `1px solid ${active ? color.accent : color.hair}`,
  borderRadius: radius.md, color: active ? color.onAccent : color.text2, fontSize: 15,
});

export const microLabel = {
  fontFamily: font.num, fontSize: 10, color: color.text3,
  textTransform: "uppercase", letterSpacing: "0.07em",
};
