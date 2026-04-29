import { CUSTOM_COMPONENTS } from "./types";
import type { CustomComponentName, TiptapDoc, TiptapNode } from "./types";

interface SerializeContext {
  usedComponents: Set<CustomComponentName>;
}

function escapeText(s: string): string {
  return s.replace(/([\\`*_\[\]])/g, "\\$1");
}

function serializeMarks(node: TiptapNode): string {
  const original = node.text ?? "";
  if (!node.marks || node.marks.length === 0) return escapeText(original);

  // Mark delimiters can't sit adjacent to whitespace in markdown — split off
  // leading/trailing whitespace so it stays outside the markers.
  const leadMatch = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead = leadMatch?.[1] ?? "";
  const core = leadMatch?.[2] ?? original;
  const trail = leadMatch?.[3] ?? "";
  if (core.length === 0) return escapeText(original);

  const order = ["code", "bold", "italic", "strike", "link"];
  const marks = [...node.marks].sort(
    (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
  );

  let text = escapeText(core);
  let raw = false;
  for (const mark of marks) {
    if (mark.type === "code") {
      text = "`" + (raw ? text : core) + "`";
      raw = true;
    } else if (mark.type === "bold") {
      text = `**${text}**`;
      raw = true;
    } else if (mark.type === "italic") {
      text = `*${text}*`;
      raw = true;
    } else if (mark.type === "strike") {
      text = `~~${text}~~`;
      raw = true;
    } else if (mark.type === "link") {
      const href = (mark.attrs?.href as string) ?? "";
      text = `[${text}](${href})`;
      raw = true;
    }
  }
  return `${lead}${text}${trail}`;
}

function serializeInline(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return "";
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      out += serializeMarks(node);
    } else if (node.type === "hardBreak") {
      out += "  \n";
    } else if (node.type === "image") {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      out += `![${alt}](${src})`;
    }
  }
  return out;
}

function indentBlock(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line, idx) => (idx === 0 ? prefix + line : prefix + line))
    .join("\n");
}

function serializeJsxAttr(name: string, value: unknown): string {
  if (value === true) return name;
  if (value === false) return "";
  if (typeof value === "string") {
    if (value.includes('"')) {
      return `${name}={${JSON.stringify(value)}}`;
    }
    return `${name}="${value}"`;
  }
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value !== null && "__raw" in value) {
    return `${name}={${(value as { __raw: string }).__raw}}`;
  }
  return `${name}={${JSON.stringify(value, null, 2)}}`;
}

function serializeCustomComponent(
  name: CustomComponentName,
  node: TiptapNode,
  ctx: SerializeContext,
): string {
  ctx.usedComponents.add(name);
  const attrs = { ...(node.attrs ?? {}) };
  const caption = (attrs.caption as string | undefined) ?? "";
  delete attrs.caption;
  const attrParts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const part = serializeJsxAttr(key, value);
    if (part) attrParts.push(part);
  }
  const attrLine = attrParts.length > 0 ? attrParts.join("\n  ") : "";
  if (!caption.trim()) {
    if (attrParts.length > 0) {
      return `<${name}\n  ${attrLine}\n/>`;
    }
    return `<${name} />`;
  }
  const opening =
    attrParts.length > 0 ? `<${name}\n  ${attrLine}\n>` : `<${name}>`;
  return `${opening}\n  ${caption}\n</${name}>`;
}

function serializeBlock(node: TiptapNode, ctx: SerializeContext): string {
  switch (node.type) {
    case "paragraph":
      return serializeInline(node.content);
    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      return `${"#".repeat(level)} ${serializeInline(node.content)}`;
    }
    case "blockquote": {
      const inner = (node.content ?? [])
        .map((c) => serializeBlock(c, ctx))
        .join("\n\n");
      return inner
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    }
    case "bulletList": {
      return (node.content ?? [])
        .map((item) => {
          const inner = (item.content ?? [])
            .map((c) => serializeBlock(c, ctx))
            .join("\n\n");
          return `- ${indentBlock(inner, "").replace(/\n/g, "\n  ")}`;
        })
        .join("\n");
    }
    case "orderedList": {
      const start = (node.attrs?.start as number) ?? 1;
      return (node.content ?? [])
        .map((item, idx) => {
          const inner = (item.content ?? [])
            .map((c) => serializeBlock(c, ctx))
            .join("\n\n");
          return `${start + idx}. ${indentBlock(inner, "").replace(/\n/g, "\n   ")}`;
        })
        .join("\n");
    }
    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return "```" + lang + "\n" + text + "\n```";
    }
    case "horizontalRule":
      return "---";
    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      return `![${alt}](${src})`;
    }
    case "rawMdxBlock":
      return String(node.attrs?.source ?? "");
    case "mdxImageCarousel":
      return serializeCustomComponent("ImageCarousel", node, ctx);
    case "mdxFigure":
      return serializeCustomComponent("Figure", node, ctx);
    case "mdxCard":
      return serializeCustomComponent("Card", node, ctx);
    case "mdxBadge":
      return serializeCustomComponent("Badge", node, ctx);
    case "mdxButton":
      return serializeCustomComponent("Button", node, ctx);
    case "mdxTable":
      return serializeCustomComponent("Table", node, ctx);
    default:
      return "";
  }
}

export function tiptapToMdx(doc: TiptapDoc): string {
  const ctx: SerializeContext = { usedComponents: new Set() };
  const blocks = doc.content
    .map((block) => serializeBlock(block, ctx))
    .filter((b) => b.length > 0 || b === "");
  const body = blocks.join("\n\n").trim();

  const imports = [...ctx.usedComponents]
    .sort()
    .map((name) => `import ${name} from '${CUSTOM_COMPONENTS[name]}';`)
    .join("\n");

  if (imports) return `${imports}\n\n${body}\n`;
  return body ? `${body}\n` : "";
}
