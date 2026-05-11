// @ts-check
import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { visit } from "unist-util-visit";

import svelte from "@astrojs/svelte";
import node from "@astrojs/node";

/** @type {Record<string, string>} */
const CODE_LANGUAGE_LABELS = {
  text: "Text",
  astro: "Astro",
  svelte: "Svelte",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  jsx: "JSX",
  tsx: "TSX",
  json: "JSON",
  md: "Markdown",
  markdown: "Markdown",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  python: "Python",
  py: "Python",
  php: "PHP",
  ruby: "Ruby",
  rb: "Ruby",
  sql: "SQL",
  yaml: "YAML",
  yml: "YAML",
  dockerfile: "Dockerfile",
};

/** @param {unknown} value */
function classList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value).split(/\s+/).filter(Boolean);
}

/** @param {string[]} classes */
function languageFromClasses(classes) {
  return classes
    .find((className) => className.startsWith("language-"))
    ?.replace("language-", "");
}

/** @param {unknown} language */
function languageLabel(language) {
  if (!language) return "";
  const normalized = String(language).toLowerCase();
  return CODE_LANGUAGE_LABELS[normalized] ?? normalized.toUpperCase();
}

/** @param {any} node */
function isCodeElement(node) {
  return node.type === "element" && node.tagName === "code";
}

function rehypeCodeLanguageBadges() {
  /** @param {any} tree */
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "pre") return;
      const children = Array.isArray(node.children) ? node.children : [];
      const code = children.find(isCodeElement);
      if (!code) return;
      const language =
        code.properties?.dataLanguage ??
        node.properties?.dataLanguage ??
        languageFromClasses([
          ...classList(code.properties?.className),
          ...classList(node.properties?.className),
        ]);
      const label = languageLabel(language);
      if (!label) return;
      node.properties = { ...(node.properties ?? {}), dataLanguage: label };
      code.properties = { ...(code.properties ?? {}), dataLanguage: label };
    });
  };
}

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

  integrations: [mdx({ rehypePlugins: [rehypeCodeLanguageBadges] }), sitemap(), svelte()],
});
