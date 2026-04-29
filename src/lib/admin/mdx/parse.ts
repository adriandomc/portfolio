import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import JSON5 from "json5";
import type { Root, RootContent, PhrasingContent } from "mdast";
import type {
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxJsxAttribute,
  MdxJsxAttributeValueExpression,
} from "mdast-util-mdx-jsx";
import { isCustomComponent } from "./types";
import type { TiptapDoc, TiptapNode } from "./types";

function parseAttrValue(
  value: string | MdxJsxAttributeValueExpression | null | undefined,
): unknown {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value;
  if (value.type === "mdxJsxAttributeValueExpression") {
    try {
      return JSON5.parse(value.value);
    } catch {
      return { __raw: value.value };
    }
  }
  return null;
}

function attrsFromJsx(
  attrs: Array<MdxJsxAttribute | { type: string }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const attr of attrs) {
    if (attr.type !== "mdxJsxAttribute") continue;
    const a = attr as MdxJsxAttribute;
    out[a.name] = parseAttrValue(a.value);
  }
  return out;
}

function phrasingToNodes(content: PhrasingContent[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const node of content) {
    out.push(...convertPhrasing(node));
  }
  return out;
}

function convertPhrasing(node: PhrasingContent): TiptapNode[] {
  switch (node.type) {
    case "text":
      return [{ type: "text", text: node.value }];
    case "strong": {
      const inner = phrasingToNodes(node.children as PhrasingContent[]);
      return inner.map((c) => withMark(c, "bold"));
    }
    case "emphasis": {
      const inner = phrasingToNodes(node.children as PhrasingContent[]);
      return inner.map((c) => withMark(c, "italic"));
    }
    case "delete": {
      const inner = phrasingToNodes(node.children as PhrasingContent[]);
      return inner.map((c) => withMark(c, "strike"));
    }
    case "inlineCode":
      return [
        {
          type: "text",
          text: node.value,
          marks: [{ type: "code" }],
        },
      ];
    case "link": {
      const inner = phrasingToNodes(node.children as PhrasingContent[]);
      return inner.map((c) =>
        withMark(c, "link", { href: node.url, title: node.title ?? null }),
      );
    }
    case "image":
      return [
        {
          type: "image",
          attrs: {
            src: node.url,
            alt: node.alt ?? "",
            title: node.title ?? null,
          },
        },
      ];
    case "break":
      return [{ type: "hardBreak" }];
    case "html":
      return [{ type: "text", text: node.value }];
    case "mdxJsxTextElement": {
      const el = node as MdxJsxTextElement;
      const name = el.name ?? "";
      if (name === "a") {
        const inner = phrasingToNodes(el.children as PhrasingContent[]);
        const href = el.attributes.find(
          (a) => a.type === "mdxJsxAttribute" && a.name === "href",
        );
        const url =
          href && href.type === "mdxJsxAttribute"
            ? (parseAttrValue(href.value) as string)
            : "";
        return inner.map((c) => withMark(c, "link", { href: url }));
      }
      // unknown inline JSX — render as raw text
      return [
        {
          type: "text",
          text: stringifyInlineJsx(el),
        },
      ];
    }
    default:
      return [];
  }
}

function withMark(
  node: TiptapNode,
  markType: string,
  attrs?: Record<string, unknown>,
): TiptapNode {
  if (node.type !== "text") return node;
  const marks = [...(node.marks ?? [])];
  marks.push(attrs ? { type: markType, attrs } : { type: markType });
  return { ...node, marks };
}

function stringifyInlineJsx(el: MdxJsxTextElement): string {
  const attrs = el.attributes
    .map((a) => {
      if (a.type !== "mdxJsxAttribute") return "";
      if (a.value === null || a.value === undefined) return a.name;
      if (typeof a.value === "string") return `${a.name}="${a.value}"`;
      return `${a.name}={${a.value.value}}`;
    })
    .filter(Boolean)
    .join(" ");
  const inner = el.children
    .map((c) => ("value" in c && typeof c.value === "string" ? c.value : ""))
    .join("");
  return `<${el.name}${attrs ? " " + attrs : ""}>${inner}</${el.name}>`;
}

function convertBlock(node: RootContent): TiptapNode[] {
  switch (node.type) {
    case "heading":
      return [
        {
          type: "heading",
          attrs: { level: node.depth },
          content: phrasingToNodes(node.children as PhrasingContent[]),
        },
      ];
    case "paragraph": {
      const content = phrasingToNodes(node.children as PhrasingContent[]);
      return content.length === 0
        ? [{ type: "paragraph" }]
        : [{ type: "paragraph", content }];
    }
    case "blockquote":
      return [
        {
          type: "blockquote",
          content: node.children.flatMap(convertBlock),
        },
      ];
    case "list":
      return [
        {
          type: node.ordered ? "orderedList" : "bulletList",
          attrs: node.ordered ? { start: node.start ?? 1 } : undefined,
          content: node.children.map((item) => ({
            type: "listItem",
            content: item.children.flatMap(convertBlock),
          })),
        },
      ];
    case "code":
      return [
        {
          type: "codeBlock",
          attrs: { language: node.lang ?? null },
          content: [{ type: "text", text: node.value }],
        },
      ];
    case "thematicBreak":
      return [{ type: "horizontalRule" }];
    case "html":
      return [
        {
          type: "rawMdxBlock",
          attrs: { source: node.value },
        },
      ];
    case "mdxFlowExpression":
      return [
        {
          type: "rawMdxBlock",
          attrs: { source: `{${node.value}}` },
        },
      ];
    case "mdxjsEsm":
      // import statements — drop, we re-emit on serialize
      return [];
    case "mdxJsxFlowElement":
      return [convertJsxFlow(node)];
    default:
      return [];
  }
}

function convertJsxFlow(node: MdxJsxFlowElement): TiptapNode {
  const name = node.name ?? "";
  if (isCustomComponent(name)) {
    const attrs = attrsFromJsx(node.attributes);
    const caption = inlineCaptionText(node.children as RootContent[]);
    if (caption) attrs.caption = caption;
    return {
      type: `mdx${name}`,
      attrs,
    };
  }
  // unknown JSX → raw block
  return {
    type: "rawMdxBlock",
    attrs: { source: stringifyJsxFlow(node) },
  };
}

function inlineCaptionText(children: RootContent[]): string {
  if (children.length === 0) return "";
  const parts: string[] = [];
  for (const c of children) {
    if (c.type === "paragraph") {
      const txt = (c.children as PhrasingContent[])
        .map((cc) => ("value" in cc && typeof cc.value === "string" ? cc.value : ""))
        .join("");
      if (txt) parts.push(txt);
    } else if ((c as { type: string }).type === "text") {
      parts.push((c as { value: string }).value);
    }
  }
  return parts.join("\n").trim();
}

function stringifyJsxFlow(node: MdxJsxFlowElement): string {
  // Best-effort raw stringification for unknown JSX blocks.
  const attrs = node.attributes
    .map((a) => {
      if (a.type !== "mdxJsxAttribute") return "";
      if (a.value === null || a.value === undefined) return a.name;
      if (typeof a.value === "string") return `${a.name}="${a.value}"`;
      return `${a.name}={${a.value.value}}`;
    })
    .filter(Boolean)
    .join(" ");
  const inner = node.children
    .map((c) => {
      if ((c as { type: string }).type === "text")
        return (c as { value: string }).value;
      if (c.type === "paragraph") {
        return (c.children as PhrasingContent[])
          .map((cc) =>
            "value" in cc && typeof cc.value === "string" ? cc.value : "",
          )
          .join("");
      }
      return "";
    })
    .join("\n");
  if (node.children.length === 0) {
    return `<${node.name}${attrs ? " " + attrs : ""} />`;
  }
  return `<${node.name}${attrs ? " " + attrs : ""}>\n${inner}\n</${node.name}>`;
}

export function mdxToTiptap(source: string): TiptapDoc {
  const tree = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .parse(source) as Root;

  const content: TiptapNode[] = [];
  for (const child of tree.children) {
    content.push(...convertBlock(child as RootContent));
  }
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}
