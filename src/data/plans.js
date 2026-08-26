// Dados dos planos de treino e nutrição.
// Editar aqui altera o plano exibido no app para ambos os perfis.

export const profiles = {
  isa: {
    name: "Isa",
    weight: 57.5,
    height: 163,
    emoji: "🐈‍⬛",
    tagline: "FOCO: Glúteos · Bíceps · Ombros",
    color: "#c77dff",
    accent: "#e0aaff",
    dark: "#3c096c",
    protein: "104–127g",
    strong: ["Ombros", "Inferiores"],
    priority: ["Glúteos", "Bíceps", "Ombros", "Abdômen"],
    days: [
      {
        id: "A", theme: "Glúteos · Costas · Bíceps",
        exercises: [
          { name: "Hip Thrust com Barra", sets: "4", reps: "8–10", rest: "2 min", rir: "1 RIR", muscles: "Glúteo Máximo, Isquiotibiais", note: "Sessão pesada — pausa de 1s no topo", priority: true },
          { name: "Agachamento Livre", sets: "3", reps: "8–10", rest: "2–3 min", rir: "2 RIR", muscles: "Quadríceps, Glúteos", note: "Profundo — amplitude máxima, glúteo alongado" },
          { name: "Puxada Alta (pegada supinada)", sets: "3", reps: "10–12", rest: "2 min", rir: "2 RIR", muscles: "Dorsal, Bíceps", note: "Pegada supinada maximiza recrutamento de bíceps" },
          { name: "Remada Curvada (pegada aberta)", sets: "3", reps: "10–12", rest: "2 min", rir: "2 RIR", muscles: "Deltoide Post., Trapézio Méd., Dorsal", note: "Cotovelos abertos — deltoide posterior + trapézio médio" },
          { name: "Rosca Direta com Barra", sets: "4", reps: "8–10", rest: "90s", rir: "1 RIR", muscles: "Bíceps Braquial", note: "Ponto fraco — carga progressiva", priority: true },
          { name: "Rosca Inclinada com Halteres", sets: "3", reps: "10–12", rest: "90s", rir: "1 RIR", muscles: "Bíceps (cabeça longa — alongada)", note: "Banco 45–60° — bíceps na posição alongada (Pedrosa et al., 2023)", priority: true },
          { name: "Abdominal Inclinado", sets: "3", reps: "10–12", rest: "60s", rir: "1 RIR", muscles: "Reto Abdominal", note: "Carga progressiva" },
        ],
      },
      {
        id: "B", theme: "Posterior · Empurrar · Tríceps",
        exercises: [
          { name: "Levantamento Terra Romeno", sets: "4", reps: "8–10", rest: "2–3 min", rir: "2 RIR", muscles: "Isquiotibiais, Glúteos, Eretores", note: "Excêntrico lento (3s) — stretch hypertrophy", priority: true },
          { name: "Cadeira Flexora (Leg Curl)", sets: "3", reps: "12–15", rest: "90s", rir: "1 RIR", muscles: "Isquiotibiais", note: "Pausa de 1s na contração" },
          { name: "Supino Inclinado com Halteres", sets: "3", reps: "8–10", rest: "2 min", rir: "2 RIR", muscles: "Peitoral Superior, Deltoide Ant.", note: "Angulação 30°" },
          { name: "Desenvolvimento com Halteres", sets: "3", reps: "10–12", rest: "2 min", rir: "2 RIR", muscles: "Deltoide Médio e Ant., Tríceps", note: "Ombro é limitante no DXA — amplitude completa", priority: true },
          { name: "Elevação Lateral com Halteres", sets: "3", reps: "12–15", rest: "60s", rir: "1 RIR", muscles: "Deltoide Médio", note: "Deltoide médio responde bem a volume", priority: true },
          { name: "Rosca Martelo (Hammer Curl)", sets: "3", reps: "10–12", rest: "90s", rir: "1 RIR", muscles: "Braquial, Braquiorradial", note: "Braquial + braquiorradial", priority: true },
          { name: "Tríceps Overhead no Cabo", sets: "3", reps: "12–15", rest: "90s", rir: "1 RIR", muscles: "Tríceps (cabeça longa — alongada)", note: "Cabeça longa alongada — ~1,5× mais hipertrofia (Maeo et al., 2023)" },
          { name: "Elevação de Pernas Suspenso", sets: "3", reps: "12–15", rest: "60s", rir: "1 RIR", muscles: "Reto Abdominal, Iliopsoas", note: "Controle na descida" },
        ],
      },
      {
        id: "C", theme: "Unilateral · Glúteo Médio · Bíceps",
        exercises: [
          { name: "Agachamento Búlgaro", sets: "3", reps: "10–12", rest: "2 min", rir: "2 RIR", muscles: "Quadríceps, Glúteos", note: "Começar pela perna ESQUERDA (assimetria DXA)", priority: true },
          { name: "Hip Thrust com Barra", sets: "3", reps: "10–12", rest: "2 min", rir: "1 RIR", muscles: "Glúteo Máximo, Isquiotibiais", note: "2ª sessão — pausa de 2s no topo", priority: true },
          { name: "Abdução de Quadril (cabo ou máquina)", sets: "3", reps: "15–20", rest: "60s", rir: "1 RIR", muscles: "Glúteo Médio", note: "Glúteo médio — forma lateral do quadril", priority: true },
          { name: "Remada Cavalinho / Chest-Supported", sets: "3", reps: "10–12", rest: "90s", rir: "2 RIR", muscles: "Dorsal Médio, Romboides", note: "" },
          { name: "Rosca Scott Máquina", sets: "3", reps: "10–12", rest: "90s", rir: "1 RIR", muscles: "Bíceps (cabeça curta)", note: "Pode ir à falha", priority: true },
          { name: "Tríceps Francês (Skull Crusher)", sets: "3", reps: "10–12", rest: "90s", rir: "1 RIR", muscles: "Tríceps (cabeça longa)", note: "Cabeça longa — amplitude máxima" },
          { name: "Abdominal Inclinado", sets: "3", reps: "8–12", rest: "60s", rir: "1 RIR", muscles: "Core completo", note: "Carga progressiva" },
        ],
      },
    ],
  },
  luca: {
    name: "Luca",
    weight: 76,
    height: 180,
    emoji: "🐕",
    tagline: "FOCO: Peito · Ombros · Glúteos · Bíceps · Abdômen",
    color: "#f77f00",
    accent: "#ffd166",
    dark: "#5c2a00",
    protein: "122–167g",
    strong: ["Quadríceps", "Panturrilha", "Isobraquiais"],
    priority: ["Peito", "Ombros", "Glúteos", "Bíceps", "Abdômen"],
    days: [
      {
        id: "A", theme: "Peito · Ombros · Glúteos · Bíceps",
        exercises: [
          { name: "Supino Reto com Halteres", sets: "4", reps: "8-10", rest: "2-3 min", rir: "1 RIR", muscles: "Peitoral, Tríceps, Deltoide Ant.", note: "Prioridade #1 — composição máxima de carga", priority: true },
          { name: "Desenvolvimento com Halteres", sets: "4", reps: "10–12", rest: "2 min", rir: "2 RIR", muscles: "Deltoide Médio e Ant., Tríceps", note: "Amplitude completa — não tranque no topo", priority: true },
          { name: "Hip Thrust com Barra", sets: "4", reps: "10–12", rest: "2 min", rir: "1 RIR", muscles: "Glúteo Máximo, Isquiotibiais", note: "Pausa de 2s no topo — foco neurológico", priority: true },
          { name: "Remada Curvada com Barra", sets: "3", reps: "8–10", rest: "2 min", rir: "2 RIR", muscles: "Dorsal, Romboides, Bíceps", note: "" },
          { name: "Rosca Direta com Barra", sets: "4", reps: "8–10", rest: "90s", rir: "1 RIR", muscles: "Bíceps Braquial", note: "Ponto fraco — 4 séries direto", priority: true },
          { name: "Abdominal Inclinado", sets: "4", reps: "12 reps", rest: "60s", rir: "—", muscles: "Reto Abdominal", note: "Melhor que crunch no chão — carga progressiva", priority: true },
        ],
      },
      {
        id: "B", theme: "Peito Inclinado · Ombros · Posterior · Bíceps",
        exercises: [
          { name: "Supino Inclinado com Halteres", sets: "4", reps: "8–10", rest: "2–3 min", rir: "2 RIR", muscles: "Peitoral Superior, Deltoide Ant.", note: "Angulação 30–45° — peitoral superior é ponto fraco", priority: true },
          { name: "Elevação Lateral com Halteres", sets: "5", reps: "15–20", rest: "60s", rir: "1 RIR", muscles: "Deltoide Médio", note: "5 séries — deltoide médio responde bem a alto volume", priority: true },
          { name: "Levantamento Terra Romeno", sets: "3", reps: "8–10", rest: "3 min", rir: "2 RIR", muscles: "Isquiotibiais, Glúteos, Eretores", note: "Mantém posterior desenvolvido sem sobrecarregar quads" },
          { name: "Puxada Alta (pegada aberta)", sets: "3", reps: "10–12", rest: "2 min", rir: "2 RIR", muscles: "Dorsal, Infraespinhal, Bíceps", note: "" },
          { name: "Rosca Scott com Halteres", sets: "3", reps: "10–12", rest: "90s", rir: "1 RIR", muscles: "Bíceps (cabeça curta)", note: "Isola bíceps — sem trapaça", priority: true },
          { name: "Elevação de Pernas", sets: "3", reps: "10-12", rest: "60s", rir: "1 RIR", muscles: "Core", note: "Ativa parte inferior do core", priority: true },
        ],
      },
      {
        id: "C", theme: "Ombros (3D) · Glúteos · Peito Cabo · Bíceps",
        exercises: [
          { name: "Arnold Press", sets: "4", reps: "10–12", rest: "2 min", rir: "2 RIR", muscles: "Deltoides (3 porções)", note: "Ativa as 3 porções do deltoide — ideal para quem tem ombros fracos", priority: true },
          { name: "Face Pull com Corda", sets: "4", reps: "15–20", rest: "60s", rir: "1 RIR", muscles: "Deltoide Post., Infraespinhal, Trapézio Méd.", note: "Equilíbrio escapular — previne lesões", priority: true },
          { name: "Agachamento Búlgaro", sets: "4", reps: "10–12", rest: "2 min", rir: "2 RIR", muscles: "Glúteos, Quadríceps", note: "Quadríceps já é forte — foco no glúteo com pé à frente", priority: true },
          { name: "Crucifixo com Cabo (alto p/ baixo)", sets: "3", reps: "12–15", rest: "90s", rir: "1 RIR", muscles: "Peitoral (ênfase no alongamento)", note: "Stretch hypertrophy — Pedrosa et al. 2022", priority: true },
          { name: "Remada Cavalinho (Chest-Supported)", sets: "3", reps: "10–12", rest: "90s", rir: "2 RIR", muscles: "Dorsal Médio, Romboides", note: "" },
          { name: "Rosca Martelo no Cabo", sets: "3", reps: "10–12", rest: "90s", rir: "1 RIR", muscles: "Braquial, Bíceps (neutro)", note: "", priority: true },
          { name: "Abdominal Inclinado", sets: "3", reps: "12 reps", rest: "60s", rir: "—", muscles: "Reto Abdominal", note: "Melhor que crunch no chão — carga progressiva", priority: true },
        ],
      },
    ],
  },
};

// NOTA: `volumeData` foi removido daqui. O volume semanal por grupo muscular
// agora é COMPUTADO a partir dos logs e do plano (views v_weekly_volume_* no
// Supabase, migração 003_volume.sql) e lido via getVolumeAnalysis() no db.js.
// As metas por músculo vivem na tabela volume_targets, não neste arquivo.

// Cards de nutrição (aba Nutrição)
export const nutritionData = {
  isa: [
    { icon: "🥩", title: "Proteína diária", value: "104–127g/dia", sub: "1,8–2,2g × 57,5kg", note: "Priorize fontes como frango, ovo, peixe, iogurte grego. Distribua em 4–5 refeições para maximizar síntese proteica (Moore et al., 2009)." },
    { icon: "🔥", title: "Calorias (definição)", value: "Déficit de 300–400 kcal", sub: "Abaixo do seu TDEE estimado", note: "Déficit moderado preserva massa muscular melhor que déficits agressivos. Calcule seu TDEE e subtraia 300–400 kcal/dia." },
    { icon: "🍚", title: "Carboidratos", value: "3–4g/kg/dia", sub: "~176–234g/dia", note: "Concentre carboidratos no pré e pós-treino. Reduzir no jantar pode ajudar na definição sem prejudicar performance." },
    { icon: "💊", title: "Suplementação básica", value: "Creatina + Whey + Vit. D", sub: "Evidência A", note: "Creatina monohidratada: 3–5g/dia. Whey quando necessário para atingir meta proteica. Vitamina D3: 2000–4000 UI/dia." },
  ],
  luca: [
    { icon: "🥩", title: "Proteína diária", value: "122–167g/dia", sub: "1,6–2,2g × 76kg", note: "Distribua em 4–5 refeições. Meta mínima de 30g por refeição ativa a síntese proteica de forma ideal (leucina threshold)." },
    { icon: "🔥", title: "Calorias (hipertrofia + definição)", value: "Déficit de 300–500 kcal", sub: "Abaixo do TDEE", note: "Para homens, um leve déficit ainda permite ganhos musculares (recomposição corporal), especialmente em intermediários." },
    { icon: "🍚", title: "Carboidratos", value: "4–5g/kg/dia", sub: "~304–380g/dia", note: "Carboidratos sustentam a performance nos compostos pesados. Não corte demais — ombros e peito precisam de treinos intensos para crescer." },
    { icon: "💊", title: "Suplementação básica", value: "Creatina + Whey + ZMA", sub: "Evidência A/B", note: "Creatina: 5g/dia. Whey para fechar proteína. ZMA (zinco + magnésio) melhora qualidade do sono e recuperação." },
  ],
};

// Tipos de medida corporal disponíveis no registro
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
