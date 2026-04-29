// @ts-check
import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import svelte from "@astrojs/svelte";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  site: "https://adriandomc.com",
  output: "server",
  adapter: node({ mode: "standalone" }),
  // Origin-check disabled: behind a reverse proxy (Coolify) `url.origin` is the
  // internal URL, which never matches the browser-supplied Origin. CSRF defense
  // relies on SameSite=Strict session cookies + middleware session validation.
  security: { checkOrigin: false },
  image: {
    service: { entrypoint: "astro/assets/services/noop" },
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "sass:color"; @use "/src/styles/_variables.scss" as *;`,
        },
      },
    },
  },

  integrations: [mdx(), sitemap(), svelte()],
});