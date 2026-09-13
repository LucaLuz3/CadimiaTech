// ============================================================
//  plans.js — o que sobrou de dado estático no app.
//
//  Histórico de esvaziamento deste arquivo:
//
//  • `volumeData` saiu na 003: o volume semanal por grupo muscular é
//    COMPUTADO a partir dos logs e do plano (views v_weekly_volume_*),
//    e as metas vivem em volume_targets.
//
//  • `profiles` saiu na F0: nome e altura passaram para a tabela
//    `profiles` no banco, e os dias do treino vêm dos placements em
//    plan_exercises. Um objeto com duas chaves fixas ('isa'/'luca') era
//    exatamente o que impedia o app de ter um terceiro usuário.
//
//  • `nutritionData` saiu no corte de escopo do V0 (13/09). Eram cards
//    de texto fixo, sem tabela e sem escrita — não eram um passo na
//    direção do interlock treino↔nutrição, eram só texto. Nutrição
//    volta quando houver registro de ingestão para interligar.
//
//  Sobrou o que é genuinamente estático e igual para todo mundo.
// ============================================================

// Tipos de medida corporal disponíveis no registro.
export const measurementTypes = [
  { key: "peito", label: "Peito", unit: "cm" },
  { key: "cintura", label: "Cintura", unit: "cm" },
  { key: "quadril", label: "Quadril", unit: "cm" },
  { key: "braco_d", label: "Braço D", unit: "cm" },
  { key: "braco_e", label: "Braço E", unit: "cm" },
  { key: "coxa_d", label: "Coxa D", unit: "cm" },
  { key: "coxa_e", label: "Coxa E", unit: "cm" },
  { key: "panturrilha", label: "Panturrilha", unit: "cm" },
];

// Ordem preferida dos dias quando existirem. Qualquer day_id fora desta
// lista aparece depois, em ordem alfabética — então criar um dia "D" ou
// "Push" funciona sem tocar em código.
export const ORDEM_DIAS = ["A", "B", "C"];

// O tema do dia ("Glúteos · Costas · Bíceps") era escrito à mão por perfil.
// Agora é DERIVADO dos exercícios que estão no dia: pega os rótulos de
// músculo mais frequentes e monta a legenda.
//
// Vantagem sobre o texto fixo: quando você troca metade dos exercícios do
// dia B, o tema acompanha sozinho em vez de mentir até alguém lembrar de
// editar. Desvantagem: perde a redação caprichada. Aceitável — a legenda
// é orientação, não conteúdo.
export function temaDoDia(exercicios, maxPartes = 3) {
  const contagem = new Map();
  for (const ex of exercicios || []) {
    for (const bruto of String(ex.muscles || "").split(/[,;·]/)) {
      const m = bruto.trim();
      if (!m) continue;
      // "Glúteo Máximo" e "Glúteos" contam como o mesmo grupo para a legenda.
      const chave = m.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/)[0];
      const atual = contagem.get(chave);
      contagem.set(chave, { rotulo: atual?.rotulo || m, n: (atual?.n || 0) + 1 });
    }
  }
  const partes = [...contagem.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, maxPartes)
    .map((x) => x.rotulo);
  return partes.join(" · ");
}
