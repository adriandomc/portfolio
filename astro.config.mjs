// @ts-check
import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import svelte from "@astrojs/svelte";

// https://astro.build/config
export default defineConfig({
  site: "https://adriandomc.com",
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