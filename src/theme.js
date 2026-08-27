// ============================================================
//  theme.js — tokens de design do Treino Duo
//
//  Fonte única para fontes, cores neutras, espaçamentos e raios.
//  A cor de destaque continua vindo do perfil (p.color / p.accent):
//  roxo para a Bela, dourado para o Luca. Aqui fica só o que é igual
//  para os dois.
//
//  Regra de uso: componente novo importa daqui; componente antigo migra
//  quando for refinado. Nada de copiar "#2a2a35" à mão de novo.
// ============================================================

export const font = {
  display: "'Bebas Neue', sans-serif",   // títulos, números grandes
  mono:    "'DM Mono', monospace",       // valores, rótulos técnicos, chips
  body:    "'DM Sans', sans-serif",      // texto corrido, botões
};

export const color = {
  bg:        "#0d0d12",
  surface:   "rgba(255,255,255,0.03)",   // card em repouso
  surface2:  "rgba(255,255,255,0.06)",   // card ativo / input
  line:      "#2a2a35",                  // borda de input
  lineSoft:  "rgba(255,255,255,0.07)",   // borda de card
  text:      "#f0eee8",
  text2:     "#bbb",                     // secundário
  text3:     "#777",                     // terciário (músculos, notas)
  text4:     "#555",                     // rótulos
  text5:     "#3a3a45",                  // desabilitado
  success:   "#7CFC9B",
  warn:      "#ffc46b",                  // aquecimento
  danger:    "#ff7676",
};

// Espaçamento em múltiplos de 4 — evita "8 aqui, 10 ali, 12 acolá".
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 9, lg: 12, xl: 16, pill: 999 };

// Alvo mínimo de toque no celular (Apple HIG: 44pt; usamos 40 + gap).
export const tap = 40;

// Cor do perfil com transparência: tint(p.color, 0x22) → "#c77dff22"
export const tint = (hex, a) => hex + a.toString(16).padStart(2, "0");

// Rótulo técnico pequeno em caixa alta (o "DATA", "MÚSCULOS" etc.)
export const microLabel = {
  fontFamily: font.mono, fontSize: 9, color: color.text4,
  textTransform: "uppercase", letterSpacing: "0.08em",
};

// Chip monoespaçado com a cor do perfil
export const chip = (c) => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  fontFamily: font.mono, fontSize: 11, color: c,
  background: tint(c, 0x18), border: `1px solid ${tint(c, 0x44)}`,
  borderRadius: radius.sm, padding: "3px 8px", whiteSpace: "nowrap",
});

// Chip neutro (sem cor de perfil)
export const chipMuted = {
  display: "inline-flex", alignItems: "center", gap: 4,
  fontFamily: font.mono, fontSize: 11, color: color.text2,
  background: color.surface2, border: `1px solid ${color.lineSoft}`,
  borderRadius: radius.sm, padding: "3px 8px", whiteSpace: "nowrap",
};

// Input de número compacto (kg / reps): altura de toque, fonte mono
export const numInput = {
  width: "100%", minWidth: 0, boxSizing: "border-box",
  height: tap, padding: "0 8px", textAlign: "center",
  background: color.surface2, border: `1px solid ${color.line}`, borderRadius: radius.md,
  color: color.text, fontSize: 15, fontFamily: font.mono, fontVariantNumeric: "tabular-nums",
};

// Botão de ícone quadrado
export const iconBtn = (c, active = false) => ({
  width: 36, height: 36, padding: 0, flexShrink: 0, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: active ? tint(c, 0x33) : color.surface2,
  border: `1px solid ${active ? c : color.line}`,
  borderRadius: radius.md, color: active ? c : color.text3, fontSize: 14,
});
