import { CodeBlock } from "@tiptap/extension-code-block";
import type { CodeBlockOptions } from "@tiptap/extension-code-block";
import type { NodeViewRendererProps } from "@tiptap/core";

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

function languageLabel(value: unknown): string {
  const language = String(value || "text").toLowerCase();
  return (
    CODE_LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ??
    language.toUpperCase()
  );
}

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

export const AdminCodeBlock = CodeBlock.extend({
  addOptions(): CodeBlockOptions {
    const parent = this.parent?.();
    return {
      languageClassPrefix: parent?.languageClassPrefix ?? "language-",
      exitOnTripleEnter: parent?.exitOnTripleEnter ?? true,
      exitOnArrowDown: parent?.exitOnArrowDown ?? true,
      defaultLanguage: "text",
      enableTabIndentation: true,
      tabSize: 4,
      HTMLAttributes: parent?.HTMLAttributes ?? {},
    };
  },

  addNodeView() {
    return (props) => {
      let currentNode = props.node;
      const dom = document.createElement("section");
      const rail = document.createElement("div");
      const label = document.createElement("span");
      const select = document.createElement("select");
      const pre = document.createElement("pre");
      const code = document.createElement("code");

      dom.className = "admin-code-block";
      rail.className = "admin-code-block__rail";
      label.className = "admin-code-block__badge";
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
        label.textContent = languageLabel(language);
        code.className = `admin-code-block__code language-${language}`;
        dom.dataset.language = languageLabel(language);
      }

      select.addEventListener("change", () => {
        setLanguage(props, select.value);
      });

      rail.append(label, select);
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
