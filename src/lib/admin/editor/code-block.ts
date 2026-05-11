import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import type { CodeBlockLowlightOptions } from "@tiptap/extension-code-block-lowlight";
import type { NodeViewRendererProps } from "@tiptap/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

export const CODE_LANGUAGE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "astro", label: "Astro" },
  { value: "svelte", label: "Svelte" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "js", label: "JavaScript" },
  { value: "ts", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "md", label: "Markdown" },
  { value: "bash", label: "Bash" },
  { value: "python", label: "Python" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "dockerfile", label: "Dockerfile" },
];

const lowlight = createLowlight({
  bash,
  css,
  dockerfile,
  javascript,
  json,
  markdown,
  php,
  plaintext,
  python,
  ruby,
  scss,
  sql,
  typescript,
  xml,
  yaml,
});
lowlight.registerAlias({
  plaintext: ["text"],
  xml: ["astro", "html", "svelte"],
  javascript: ["js", "jsx"],
  typescript: ["ts", "tsx"],
  markdown: ["md"],
  bash: ["sh", "shell"],
  python: ["py"],
  ruby: ["rb"],
  yaml: ["yml"],
});

function setLanguage(props: NodeViewRendererProps, language: string) {
  const pos = props.getPos();
  if (typeof pos !== "number") return;
  props.editor.view.dispatch(
    props.editor.state.tr.setNodeMarkup(pos, undefined, {
      ...props.node.attrs,
      language,
    }),
  );
}

export const AdminCodeBlock = CodeBlockLowlight.extend({
  addOptions(): CodeBlockLowlightOptions {
    const parent = this.parent?.();
    return {
      languageClassPrefix: parent?.languageClassPrefix ?? "language-",
      exitOnTripleEnter: parent?.exitOnTripleEnter ?? true,
      exitOnArrowDown: parent?.exitOnArrowDown ?? true,
      defaultLanguage: "text",
      enableTabIndentation: true,
      tabSize: 4,
      HTMLAttributes: parent?.HTMLAttributes ?? {},
      lowlight,
    };
  },

  addNodeView() {
    return (props) => {
      let currentNode = props.node;
      const dom = document.createElement("section");
      const rail = document.createElement("div");
      const select = document.createElement("select");
      const pre = document.createElement("pre");
      const code = document.createElement("code");

      dom.className = "admin-code-block";
      rail.className = "admin-code-block__rail";
      select.className = "admin-code-block__select";
      select.setAttribute("aria-label", "Syntax language");
      pre.className = "admin-code-block__pre";
      code.className = "admin-code-block__code";

      for (const option of CODE_LANGUAGE_OPTIONS) {
        const el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.label;
        select.append(el);
      }

      function syncLanguage() {
        const language = String(currentNode.attrs.language || "text").toLowerCase();
        select.value = language;
        code.className = `admin-code-block__code language-${language}`;
        dom.dataset.language = language;
      }

      select.addEventListener("change", () => {
        setLanguage(props, select.value);
      });

      rail.append(select);
      pre.append(code);
      dom.append(rail, pre);
      syncLanguage();

      return {
        dom,
        contentDOM: code,
        update(nextNode) {
          if (nextNode.type !== currentNode.type) return false;
          currentNode = nextNode;
          syncLanguage();
          return true;
        },
        stopEvent(event) {
          return event.target instanceof HTMLElement && rail.contains(event.target);
        },
        ignoreMutation(mutation) {
          return !code.contains(mutation.target);
        },
      };
    };
  },
});
