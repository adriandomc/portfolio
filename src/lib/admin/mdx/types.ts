export type CustomComponentName =
  | "ImageCarousel"
  | "Figure"
  | "Card"
  | "Badge"
  | "Button"
  | "Table";

export const CUSTOM_COMPONENTS: Record<CustomComponentName, string> = {
  ImageCarousel: "/src/components/ImageCarousel.astro",
  Figure: "/src/components/Figure.astro",
  Card: "/src/components/Card.astro",
  Badge: "/src/components/Badge.astro",
  Button: "/src/components/Button.astro",
  Table: "/src/components/Table.astro",
};

export function isCustomComponent(name: string): name is CustomComponentName {
  return name in CUSTOM_COMPONENTS;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface TiptapDoc {
  type: "doc";
  content: TiptapNode[];
}
