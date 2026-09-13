import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base: "./" faz o build funcionar em qualquer host (Vercel, Netlify,
// subpasta do GitHub Pages).
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      // 'prompt', NÃO 'autoUpdate'. Com autoUpdate o service worker troca a
      // versão por baixo de quem está no meio de uma série — num app usado
      // com o celular apoiado no banco da academia, isso é perda de dado.
      // Com prompt, a atualização espera o usuário aceitar.
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Treino Duo",
        short_name: "Treino Duo",
        description: "Plano de treino com volume por grupo muscular calculado a partir dos treinos registrados.",
        lang: "pt-BR",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#131211",
        theme_color: "#131211",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          // maskable é o que evita o ícone aparecer dentro de um quadrado
          // branco no Android.
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Supabase: rede primeiro, cache como rede de segurança. Dado de
            // treino errado é pior que tela de carregando — mas ficar sem
            // nada no subsolo da academia também não serve.
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Imagens do free-exercise-db são imutáveis: uma vez baixadas,
            // nunca mudam. Cache primeiro, sem pensar duas vezes.
            urlPattern: ({ url }) =>
              url.hostname.includes("githubusercontent.com") || url.hostname.includes("github.io"),
            handler: "CacheFirst",
            options: {
              cacheName: "exercicios-midia",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
