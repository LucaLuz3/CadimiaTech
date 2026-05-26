# 💪 Treino Duo — Isa & Luca

App de treino e nutrição do casal, com **sincronização na nuvem** (grátis) para acompanhar a evolução de qualquer aparelho.

- **Treinos** A/B/C por perfil (Isa 🌸 / Luca ⚡)
- **Evolução**: log de carga × reps com PRs, peso corporal, medidas e fotos de progresso — tudo com gráficos
- **Análise** de volume semanal por grupo muscular
- **Nutrição** com metas de proteína, calorias, carbo e suplementação

Stack: **React + Vite** (frontend) · **Supabase** (banco + login + storage) · deploy na **Vercel**.

---

## 🚀 Passo a passo (do zero ao app online)

### 1. Criar o banco na nuvem (Supabase) — grátis, sem cartão

1. Crie uma conta em **https://supabase.com** e clique em **New Project**.
2. Dê um nome (ex: `treino-duo`), escolha uma região próxima (ex: *South America (São Paulo)*) e defina uma senha de banco (anote em algum lugar).
3. Espere ~2 min o projeto subir.
4. Vá em **SQL Editor → New query**, cole **todo** o conteúdo do arquivo [`supabase-schema.sql`](./supabase-schema.sql) e clique **RUN**. Isso cria as tabelas, a segurança (RLS) e o bucket de fotos.
5. Vá em **Authentication → Users → Add user** e crie **um único usuário** (e-mail + senha que vocês dois vão usar). Marque a opção de **auto-confirmar** o e-mail.
6. *(Recomendado)* Em **Authentication → Sign In / Providers**, **desative** "Allow new users to sign up" — assim só vocês entram.
7. Vá em **Project Settings → API** e copie:
   - **Project URL** → vai em `VITE_SUPABASE_URL`
   - **anon public key** → vai em `VITE_SUPABASE_ANON_KEY`

### 2. Configurar e rodar localmente (opcional, para testar)

Pré-requisito: **Node.js 18+** instalado (https://nodejs.org).

```bash
# dentro da pasta do projeto
cp .env.example .env        # depois edite o .env e cole suas chaves
npm install
npm run dev
```

Abra o endereço que aparecer (ex: `http://localhost:5173`), faça login com o usuário criado no passo 1.5 e teste. 🎉

### 3. Subir o código para o GitHub

1. Crie um repositório **vazio** em https://github.com/new (pode ser **privado**).
2. Na pasta do projeto, rode (trocando a URL pela do seu repo):

```bash
git init
git add .
git commit -m "Treino Duo - versão inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/treino-duo.git
git push -u origin main
```

> O arquivo `.env` **não** é enviado (está no `.gitignore`). As chaves vão direto na Vercel no próximo passo.

### 4. Publicar online (Vercel) — grátis e gera link compartilhável

1. Crie conta em **https://vercel.com** (pode entrar com o GitHub).
2. **Add New → Project → Import** o repositório `treino-duo`.
3. A Vercel detecta o Vite sozinho. Antes de finalizar, abra **Environment Variables** e adicione as duas:
   - `VITE_SUPABASE_URL` = (sua Project URL)
   - `VITE_SUPABASE_ANON_KEY` = (sua anon key)
4. Clique **Deploy**. Em ~1 min você recebe um link tipo `https://treino-duo.vercel.app`.
5. Mandem esse link um pro outro, salvem na tela inicial do celular (no navegador: *Adicionar à Tela de Início*) e pronto — funciona como um app, sincronizando entre os dois. 📱

> Toda vez que você der `git push`, a Vercel republica automaticamente.

---

## ✏️ Como editar o plano de treino

Tudo que aparece nas abas Treinos / Análise / Nutrição está em **`src/data/plans.js`**.
Edite os exercícios, séries, notas, metas de nutrição etc. — salve, dê `git push`, e a Vercel atualiza o app sozinho.

## 🗂 Estrutura

```
src/
├── App.jsx                 # shell: login, perfil, navegação
├── data/plans.js           # 👈 todo o conteúdo do plano (edite aqui)
├── lib/
│   ├── supabase.js         # conexão com o banco
│   └── db.js               # funções de salvar/ler dados + compressão de fotos
└── components/
    ├── Auth.jsx            # tela de login
    ├── WorkoutTab.jsx      # aba Treinos
    ├── ProgressTab.jsx     # aba Evolução (log, peso, medidas, fotos)
    ├── AnalysisTab.jsx     # aba Análise
    └── NutritionTab.jsx    # aba Nutrição
```

## 💸 Custo

Zero. O plano gratuito do Supabase (500 MB de banco + 1 GB de fotos) e o da Vercel cobrem com folga o uso de duas pessoas. O projeto Supabase grátis "dorme" após ~1 semana **sem nenhum acesso** — como vocês vão usar toda semana, isso não acontece; se acontecer, é só abrir o painel e clicar em *Restore*.

## 🔒 Privacidade

Os dados (incluindo fotos) só são acessíveis com o login de vocês. As fotos ficam num bucket **privado** e são servidas por URLs temporárias assinadas.
