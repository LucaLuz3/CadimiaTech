# 🎬 Imagens de execução dos exercícios

Substitui o plano anterior (que usava a ExerciseDB via RapidAPI — os termos
dela não permitem copiar as mídias para o nosso Storage).

## Como funciona

- A coluna `exercises.media_url` (já existia) guarda **uma URL** (GIF/imagem)
  **ou duas URLs separadas por `|`** (posição inicial | posição final).
- No app, todo exercício com mídia mostra um botão **▶** ao lado do nome.
  Tocar abre uma folha no rodapé com a animação (as duas fotos alternando a
  cada 0,9 s; toque na imagem para avançar manualmente), a prescrição, a nota,
  e — se preenchidos no catálogo — dicas e instruções.
- No modo **✎ Editar plano**, o editor do exercício tem o campo
  **"Imagem ou GIF de execução (URL)"** com prévia. Qualquer URL pública serve.
  O catálogo é compartilhado: vale para os dois perfis.
- `scripts/seed-exercise-media.mjs` preenche tudo de uma vez com as fotos da
  **free-exercise-db** (domínio público, servidas do GitHub — sem Storage, sem
  chave de API, custo zero). Só toca em exercícios **sem** mídia; o que vocês
  colarem à mão nunca é sobrescrito (a não ser com `--force`).

## Arquivos

- `src/components/WorkoutTab.jsx` — substituir (botão ▶, visualizador, campo no editor).
- `scripts/seed-exercise-media.mjs` — novo.
- Nenhuma migration: a coluna já existe e o `db.js` já a lê e salva.

## Rodar o seed (uma vez, no terminal, na raiz do projeto)

Pegue a chave **service_role** em *Project Settings → API* no painel do Supabase.
Ela dá acesso total ao banco: só no terminal, nunca no código nem no Git.

```bash
SUPABASE_URL="https://SEU-PROJETO.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key" \
node scripts/seed-exercise-media.mjs --dry-run   # mostra o que faria
```

Se a lista estiver certa, rode de novo sem `--dry-run`. Recarregue o app.

## Ajustar o que ficou torto

Três exercícios usam a foto mais próxima, não a exata (marcados com `≈` no
`MAP` do script): Agachamento Búlgaro (foto sem o pé elevado), Remada Curvada
pegada aberta (foto com pegada normal) e Prancha com Elevação de Braço (prancha
simples). Para trocar qualquer um: **✎ Editar plano → exercício → cola a URL**
de um GIF melhor. Exercícios criados pela UI que não estiverem no `MAP`
aparecem no resumo do script como "Sem correspondência" — mesma solução.
