import { Node, mergeAttributes } from "@tiptap/core";

interface ComponentSpec {
  name: string;
  tiptapName: string;
  defaultAttrs: Record<string, unknown>;
}

export const COMPONENT_SPECS: ComponentSpec[] = [
  {
    name: "ImageCarousel",
    tiptapName: "mdxImageCarousel",
    defaultAttrs: {
      images: [],
      maxWidth: "48rem",
      aspectRatio: "16 / 10",
      objectFit: "contain",
      caption: "",
    },
  },
  {
    name: "Figure",
    tiptapName: "mdxFigure",
    defaultAttrs: {
      src: "",
      alt: "",
      width: null,
      height: null,
      maxWidth: null,
      caption: "",
    },
  },
  {
    name: "Card",
    tiptapName: "mdxCard",
    defaultAttrs: {
      title: "",
      caption: "",
    },
  },
  {
    name: "Badge",
    tiptapName: "mdxBadge",
    defaultAttrs: {
      title: "",
    },
  },
  {
    name: "Button",
    tiptapName: "mdxButton",
    defaultAttrs: {
      label: "",
      href: "",
      variant: "primary",
      target: null,
      type: "button",
    },
  },
  {
    name: "Table",
    tiptapName: "mdxTable",
    defaultAttrs: {
      headers: [],
      data: [],
      caption: null,
    },
  },
];

function buildNode(spec: ComponentSpec) {
  const attrShape = Object.fromEntries(
    Object.keys(spec.defaultAttrs).map((key) => [
      key,
      { default: spec.defaultAttrs[key] },
    ]),
  );

  return Node.create({
    name: spec.tiptapName,
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() {
      return attrShape;
    },
    parseHTML() {
      return [{ tag: `div[data-mdx="${spec.name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-mdx": spec.name,
          class: "mdx-block",
        }),
      ];
    },
  });
}

export const RawMdxBlock = Node.create({
  name: "rawMdxBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { source: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-mdx-raw]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-mdx-raw": "true",
        class: "mdx-block raw",
      }),
    ];
  },
});

export const customComponentExtensions = [
  ...COMPONENT_SPECS.map(buildNode),
  RawMdxBlock,
];
