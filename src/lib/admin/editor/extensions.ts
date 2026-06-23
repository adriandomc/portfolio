import { Node, mergeAttributes, type NodeViewRendererProps } from "@tiptap/core";

interface ComponentSpec {
  name: string;
  tiptapName: string;
  defaultAttrs: Record<string, unknown>;
}

interface ImageAttr {
  src: string;
  alt: string;
}

type RowItem =
  | { type: "Badge"; title: string }
  | {
      type: "Button";
      label: string;
      href: string;
      variant: "primary" | "secondary" | "danger" | "warning";
      target: string | null;
      buttonType: "button" | "submit" | "reset";
    };

export type MdxMediaPickerRequest =
  | { kind: "blockFigure"; pos: number }
  | { kind: "blockCarousel"; pos: number; index: number };

export interface ComponentExtensionOptions {
  openMediaPicker?: (target: MdxMediaPickerRequest) => void;
  onMediaError?: (message: string) => void;
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
      headers: ["Header 1"],
      data: [{ "Header 1": "" }],
      caption: null,
    },
  },
];

const COMPONENT_ROW_SPEC: ComponentSpec = {
  name: "ComponentRow",
  tiptapName: "mdxComponentRow",
  defaultAttrs: {
    items: [],
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function imageList(value: unknown): ImageAttr[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const image = item as Record<string, unknown>;
        return {
          src: String(image.src ?? ""),
          alt: String(image.alt ?? ""),
        };
      })
    : [];
}

function headersList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function effectiveHeaders(value: unknown): string[] {
  const headers = headersList(value);
  return headers.length > 0 ? headers : ["Header 1"];
}

function rowList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function effectiveRows(value: unknown, headers: string[]): Array<Record<string, unknown>> {
  const rows = rowList(value);
  return rows.length > 0
    ? rows
    : [Object.fromEntries(headers.map((header) => [header, ""]))];
}

function rowItems(value: unknown): RowItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Record<string, unknown>;
      if (raw.type === "Badge") {
        return { type: "Badge" as const, title: String(raw.title ?? "") };
      }
      if (raw.type === "Button") {
        return {
          type: "Button" as const,
          label: String(raw.label ?? ""),
          href: String(raw.href ?? ""),
          variant: ["primary", "secondary", "danger", "warning"].includes(String(raw.variant))
            ? (String(raw.variant) as "primary" | "secondary" | "danger" | "warning")
            : "primary",
          target: raw.target ? String(raw.target) : null,
          buttonType: ["button", "submit", "reset"].includes(String(raw.buttonType ?? raw.type))
            ? (String(raw.buttonType ?? raw.type) as "button" | "submit" | "reset")
            : "button",
        };
      }
      return null;
    })
    .filter((item): item is RowItem => Boolean(item));
}

function cleanOptional(value: string): string | null {
  return value.trim() ? value : null;
}

function badgeWidth(value: unknown): number {
  return Math.max(5, Math.min(34, String(value ?? "").length + 2));
}

function buttonVariant(value: unknown): "primary" | "secondary" | "danger" | "warning" {
  const variant = String(value ?? "primary");
  return ["primary", "secondary", "danger", "warning"].includes(variant)
    ? (variant as "primary" | "secondary" | "danger" | "warning")
    : "primary";
}

function uniqueHeader(headers: string[]): string {
  let index = headers.length + 1;
  let candidate = `Header ${index}`;
  while (headers.includes(candidate)) {
    index += 1;
    candidate = `Header ${index}`;
  }
  return candidate;
}

export function defaultRowItem(type: "Badge" | "Button"): RowItem {
  return type === "Badge"
    ? { type: "Badge", title: "Badge" }
    : {
        type: "Button",
        label: "Button",
        href: "",
        variant: "primary",
        target: null,
        buttonType: "button",
      };
}

function buildNode(spec: ComponentSpec, options: ComponentExtensionOptions) {
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
    addNodeView() {
      return (props) => componentNodeView(props, spec, options);
    },
  });
}

function componentNodeView(
  props: NodeViewRendererProps,
  spec: ComponentSpec,
  options: ComponentExtensionOptions,
) {
  let currentNode = props.node;
  let activeCarouselIndex = 0;
  let sortOpen = false;
  let sortDraft: ImageAttr[] = [];
  let draggingSortIndex: number | null = null;
  let openButtonPopoverIndex: number | null = null;
  let standaloneButtonPopover = false;
  let collapsed = false;

  const dom = document.createElement("section");
  dom.className = `mdx-block mdx-block--${spec.tiptapName}`;
  dom.dataset.mdx = spec.name;
  dom.contentEditable = "false";

  function pos(): number | null {
    const value = props.getPos();
    return typeof value === "number" ? value : null;
  }

  function setAttrs(partial: Record<string, unknown>, rerender = false) {
    const currentPos = pos();
    if (currentPos === null) return;
    const nextAttrs = { ...currentNode.attrs, ...partial };
    currentNode = currentNode.type.create(nextAttrs);
    props.editor.view.dispatch(
      props.editor.state.tr.setNodeMarkup(currentPos, undefined, nextAttrs),
    );
    if (rerender || !dom.contains(document.activeElement)) {
      queueMicrotask(render);
    }
  }

  function deleteNode() {
    const currentPos = pos();
    if (currentPos === null) return;
    props.editor.view.dispatch(
      props.editor.state.tr.delete(currentPos, currentPos + currentNode.nodeSize),
    );
  }

  function openFigurePicker() {
    const currentPos = pos();
    if (currentPos === null) return;
    options.openMediaPicker?.({ kind: "blockFigure", pos: currentPos });
  }

  function openCarouselPicker(index: number) {
    const currentPos = pos();
    if (currentPos === null) return;
    options.openMediaPicker?.({ kind: "blockCarousel", pos: currentPos, index });
  }

  function shell(inner: string, compact = false): string {
    if (compact) {
      return inner;
    }
    return `
      <div class="mdx-block-head">
        <div class="mdx-block-title">
          <button class="mdx-inline-control mdx-collapse-toggle" type="button" data-action="toggle-collapse" aria-label="${collapsed ? "Expand" : "Collapse"} ${spec.name}">
            ${collapsed ? "+" : "-"}
          </button>
          <span class="mdx-block-label">${spec.name}</span>
        </div>
        <button class="mdx-inline-control mdx-icon-danger" type="button" data-action="delete" aria-label="Delete ${spec.name}">X</button>
      </div>
      <div class="mdx-block-body ${collapsed ? "is-collapsed" : ""}">
        ${collapsed ? "" : inner}
      </div>
    `;
  }

  function renderFigure(attrs: Record<string, unknown>) {
    const src = String(attrs.src ?? "");
    return shell(`
      <button class="mdx-media-stage mdx-inline-control" type="button" data-action="pick-figure">
        ${
          src
            ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(attrs.alt)}" />`
            : `<span>Pick/Upload image</span>`
        }
      </button>
      <div class="mdx-fields mdx-fields--figure">
        <label><span>Alt</span><input class="mdx-inline-control" data-field="alt" value="${escapeHtml(attrs.alt)}" /></label>
        <label><span>Caption</span><textarea class="mdx-inline-control" data-field="caption" rows="2">${escapeHtml(attrs.caption)}</textarea></label>
        <label><span>Width</span><input class="mdx-inline-control" data-field="width" value="${escapeHtml(attrs.width)}" /></label>
        <label><span>Height</span><input class="mdx-inline-control" data-field="height" value="${escapeHtml(attrs.height)}" /></label>
        <label><span>Max width</span><input class="mdx-inline-control" data-field="maxWidth" value="${escapeHtml(attrs.maxWidth)}" /></label>
      </div>
    `);
  }

  function renderSortModal() {
    if (!sortOpen) return "";
    const tiles = sortDraft
      .map(
        (image, index) => `
          <article class="mdx-sort-item ${draggingSortIndex === index ? "is-dragging" : ""}" draggable="true" data-sort-index="${index}">
            ${
              image.src
                ? `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" />`
                : `<div class="mdx-sort-empty">No image</div>`
            }
            <span>${index + 1}</span>
          </article>
        `,
      )
      .join("");
    return `
      <div class="mdx-sort-backdrop">
        <section class="mdx-sort-modal" role="dialog" aria-modal="true" aria-label="Sort carousel images">
          <header>
            <h3>Sort images</h3>
            <button class="mdx-inline-control mdx-icon-danger" type="button" data-action="cancel-sort" aria-label="Close sort modal">X</button>
          </header>
          <div class="mdx-sort-grid">${tiles || `<p class="mdx-empty-copy">No images to sort.</p>`}</div>
          <footer>
            <button class="mdx-inline-control" type="button" data-action="cancel-sort">Cancel</button>
            <button class="mdx-inline-control mdx-primary" type="button" data-action="save-sort">Save</button>
          </footer>
        </section>
      </div>
    `;
  }

  function renderCarousel(attrs: Record<string, unknown>) {
    const images = imageList(attrs.images);
    if (activeCarouselIndex >= images.length) activeCarouselIndex = Math.max(0, images.length - 1);
    const active = images[activeCarouselIndex];
    const hasImages = images.length > 0;
    return shell(`
      <div class="mdx-carousel-viewer">
        <button class="mdx-inline-control mdx-carousel-nav" type="button" data-action="prev-image" ${images.length < 2 ? "disabled" : ""} aria-label="Previous image">&lt;</button>
        <button class="mdx-media-stage mdx-carousel-stage mdx-inline-control" type="button" data-action="pick-carousel-active">
          ${
            active?.src
              ? `<img src="${escapeHtml(active.src)}" alt="${escapeHtml(active.alt)}" />`
              : `<span>Pick/Upload image</span>`
          }
        </button>
        <button class="mdx-inline-control mdx-carousel-nav" type="button" data-action="next-image" ${images.length < 2 ? "disabled" : ""} aria-label="Next image">&gt;</button>
      </div>
      <div class="mdx-carousel-controls">
        <span>${hasImages ? `${activeCarouselIndex + 1} / ${images.length}` : "0 / 0"}</span>
        <button class="mdx-inline-control" type="button" data-action="add-image">Add image</button>
        <button class="mdx-inline-control" type="button" data-action="open-sort" ${images.length < 2 ? "disabled" : ""}>Sort</button>
        <button class="mdx-inline-control mdx-danger" type="button" data-action="remove-active" ${!hasImages ? "disabled" : ""}>Remove image</button>
      </div>
      <div class="mdx-fields mdx-fields--carousel">
        <label><span>Alt</span><input class="mdx-inline-control" data-image-field="alt" data-index="${activeCarouselIndex}" value="${escapeHtml(active?.alt)}" ${!hasImages ? "disabled" : ""} /></label>
        <label><span>Caption</span><textarea class="mdx-inline-control" data-field="caption" rows="2">${escapeHtml(attrs.caption)}</textarea></label>
        <label><span>Aspect ratio</span><input class="mdx-inline-control" data-field="aspectRatio" value="${escapeHtml(attrs.aspectRatio)}" /></label>
        <label><span>Object fit</span>
          <select class="mdx-inline-control" data-field="objectFit">
            ${["contain", "cover", "fill"]
              .map(
                (value) =>
                  `<option value="${value}" ${String(attrs.objectFit ?? "contain") === value ? "selected" : ""}>${value}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label><span>Max width</span><input class="mdx-inline-control" data-field="maxWidth" value="${escapeHtml(attrs.maxWidth)}" /></label>
      </div>
      ${renderSortModal()}
    `);
  }

  function renderCard(attrs: Record<string, unknown>) {
    return shell(`
      <div class="mdx-preview-card">
        <input class="mdx-inline-control mdx-card-title" data-field="title" value="${escapeHtml(attrs.title)}" placeholder="Card title" />
        <textarea class="mdx-inline-control mdx-card-body" data-field="caption" rows="3" placeholder="Card body">${escapeHtml(attrs.caption)}</textarea>
      </div>
    `);
  }

  function renderBadge(attrs: Record<string, unknown>) {
    const title = String(attrs.title ?? "");
    return shell(
      `<span class="mdx-editable-pill mdx-editable-badge">
        <input class="mdx-inline-control mdx-preview-badge" data-field="title" value="${escapeHtml(title)}" placeholder="Badge" style="width: ${badgeWidth(title)}ch;" />
        <button class="mdx-inline-control mdx-pill-delete" type="button" data-action="delete" aria-label="Delete badge">X</button>
      </span>`,
      true,
    );
  }

  function renderButtonFields(index: number | null, attrs: Record<string, unknown>) {
    const prefix = index === null ? "" : `data-row-index="${index}"`;
    const field = index === null ? "data-field" : "data-row-field";
    const typeValue = index === null ? attrs.type : attrs.buttonType;
    return `
      <div class="mdx-button-popover">
        <label><span>Label</span><input class="mdx-inline-control" ${field}="label" ${prefix} value="${escapeHtml(attrs.label)}" /></label>
        <label><span>Href</span><input class="mdx-inline-control" ${field}="href" ${prefix} value="${escapeHtml(attrs.href)}" /></label>
        <label><span>Variant</span>
          <select class="mdx-inline-control" ${field}="variant" ${prefix}>
            ${["primary", "secondary", "danger", "warning"]
              .map((value) => `<option value="${value}" ${buttonVariant(attrs.variant) === value ? "selected" : ""}>${value}</option>`)
              .join("")}
          </select>
        </label>
        <label><span>Target</span>
          <select class="mdx-inline-control" ${field}="target" ${prefix}>
            <option value="" ${!attrs.target ? "selected" : ""}>same tab</option>
            <option value="_blank" ${attrs.target === "_blank" ? "selected" : ""}>new tab</option>
          </select>
        </label>
        <label><span>Type</span>
          <select class="mdx-inline-control" ${field}="${index === null ? "type" : "buttonType"}" ${prefix}>
            ${["button", "submit", "reset"]
              .map((value) => `<option value="${value}" ${String(typeValue ?? "button") === value ? "selected" : ""}>${value}</option>`)
              .join("")}
          </select>
        </label>
      </div>
    `;
  }

  function renderButton(attrs: Record<string, unknown>) {
    const variant = buttonVariant(attrs.variant);
    return shell(
      `
        <div class="mdx-button-inline-wrap">
          <span class="mdx-editable-button mdx-button-preview mdx-button-preview--${escapeHtml(variant)}">
            <button class="mdx-inline-control mdx-button-label" type="button" data-action="toggle-button-popover">
              ${escapeHtml(attrs.label || "Button")}
            </button>
            <button class="mdx-inline-control mdx-pill-delete" type="button" data-action="delete" aria-label="Delete button">X</button>
          </span>
          ${standaloneButtonPopover ? renderButtonFields(null, attrs) : ""}
        </div>
      `,
      true,
    );
  }

  function renderTable(attrs: Record<string, unknown>) {
    const headers = effectiveHeaders(attrs.headers);
    const rows = effectiveRows(attrs.data, headers);
    return shell(`
      <div class="mdx-table-preview">
        <div class="mdx-table-canvas">
          <div class="mdx-table-scroll">
            <table class="mdx-preview-table">
              <thead>
                <tr>
                  <th class="mdx-table-handle-cell">
                    <span class="mdx-table-grip" aria-hidden="true">::</span>
                  </th>
                  ${headers
                    .map(
                      (header, index) => `
                        <th>
                          <div class="mdx-table-header-cell">
                            <input class="mdx-inline-control" data-header-index="${index}" value="${escapeHtml(header)}" />
                            <button class="mdx-inline-control mdx-table-mini-action" type="button" data-action="remove-column" data-index="${index}" ${headers.length < 2 ? "disabled" : ""} aria-label="Remove column">X</button>
                          </div>
                        </th>
                      `,
                    )
                    .join("")}
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row, rowIndex) => `
                      <tr>
                        <th class="mdx-table-handle-cell">
                          <button class="mdx-inline-control mdx-table-mini-action" type="button" data-action="remove-row" data-index="${rowIndex}" ${rows.length < 2 ? "disabled" : ""} aria-label="Remove row">X</button>
                        </th>
                        ${headers
                          .map(
                            (header, colIndex) =>
                              `<td><input class="mdx-inline-control" data-table-row="${rowIndex}" data-table-col="${colIndex}" value="${escapeHtml(row[header])}" /></td>`,
                          )
                          .join("")}
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <button class="mdx-inline-control mdx-table-add-column" type="button" data-action="add-column" aria-label="Add column">+</button>
          <button class="mdx-inline-control mdx-table-add-row" type="button" data-action="add-row" aria-label="Add row">+</button>
        </div>
        <label class="mdx-table-caption"><span>Caption</span><input class="mdx-inline-control" data-field="caption" value="${escapeHtml(attrs.caption)}" /></label>
      </div>
    `);
  }

  function renderComponentRow(attrs: Record<string, unknown>) {
    const items = rowItems(attrs.items);
    const rendered = items
      .map((item, index) => {
        if (item.type === "Badge") {
          return `
            <span class="mdx-row-item mdx-editable-pill mdx-editable-badge">
              <input class="mdx-inline-control mdx-preview-badge" data-row-index="${index}" data-row-field="title" value="${escapeHtml(item.title)}" placeholder="Badge" style="width: ${badgeWidth(item.title)}ch;" />
              <button class="mdx-inline-control mdx-pill-delete" type="button" data-action="remove-row-item" data-index="${index}" aria-label="Remove badge">X</button>
            </span>
          `;
        }
        return `
          <span class="mdx-row-item mdx-row-button">
            <span class="mdx-editable-button mdx-button-preview mdx-button-preview--${escapeHtml(item.variant)}">
              <button class="mdx-inline-control mdx-button-label" type="button" data-action="toggle-row-button-popover" data-index="${index}">
                ${escapeHtml(item.label || "Button")}
              </button>
              <button class="mdx-inline-control mdx-pill-delete" type="button" data-action="remove-row-item" data-index="${index}" aria-label="Remove button">X</button>
            </span>
            ${openButtonPopoverIndex === index ? renderButtonFields(index, item) : ""}
          </span>
        `;
      })
      .join("");
    return shell(`
      <div class="mdx-component-row">
        <div class="mdx-component-row-items">
          ${rendered || `<p class="mdx-empty-copy">Add a badge or button.</p>`}
        </div>
        <div class="mdx-component-row-actions">
          <button class="mdx-inline-control" type="button" data-action="add-row-badge">Add badge</button>
          <button class="mdx-inline-control" type="button" data-action="add-row-button">Add button</button>
        </div>
      </div>
    `);
  }

  function renderRaw(attrs: Record<string, unknown>) {
    return `
      <div class="mdx-block-head">
        <span class="mdx-block-label">Raw MDX</span>
        <button class="mdx-inline-control mdx-icon-danger" type="button" data-action="delete" aria-label="Delete Raw MDX">X</button>
      </div>
      <textarea class="mdx-inline-control mdx-raw-source" data-field="source" rows="5">${escapeHtml(attrs.source)}</textarea>
    `;
  }

  function render() {
    const attrs = currentNode.attrs;
    if (spec.name === "Figure") dom.innerHTML = renderFigure(attrs);
    else if (spec.name === "ImageCarousel") dom.innerHTML = renderCarousel(attrs);
    else if (spec.name === "Card") dom.innerHTML = renderCard(attrs);
    else if (spec.name === "Badge") dom.innerHTML = renderBadge(attrs);
    else if (spec.name === "Button") dom.innerHTML = renderButton(attrs);
    else if (spec.name === "Table") dom.innerHTML = renderTable(attrs);
    else if (spec.name === "ComponentRow") dom.innerHTML = renderComponentRow(attrs);
    else dom.innerHTML = renderRaw(attrs);
  }

  dom.onclick = (event) => {
    const target = event.target as HTMLElement | null;
    const actionTarget = target?.closest<HTMLElement>("[data-action]");
    if (!actionTarget) return;
    event.preventDefault();
    const action = actionTarget.dataset.action;

    if (action === "delete") {
      deleteNode();
      return;
    }
    if (action === "toggle-collapse") {
      collapsed = !collapsed;
      render();
      return;
    }
    if (action === "pick-figure") {
      openFigurePicker();
      return;
    }
    if (action === "pick-carousel-active") {
      const images = imageList(currentNode.attrs.images);
      if (images.length === 0) {
        activeCarouselIndex = 0;
        setAttrs({ images: [{ src: "", alt: "" }] }, true);
      }
      openCarouselPicker(activeCarouselIndex);
      return;
    }
    if (action === "add-image") {
      const images = imageList(currentNode.attrs.images);
      activeCarouselIndex = images.length;
      setAttrs({ images: [...images, { src: "", alt: "" }] }, true);
      openCarouselPicker(activeCarouselIndex);
      return;
    }
    if (action === "remove-active") {
      const images = imageList(currentNode.attrs.images);
      if (images.length === 0) return;
      images.splice(activeCarouselIndex, 1);
      activeCarouselIndex = Math.max(0, Math.min(activeCarouselIndex, images.length - 1));
      setAttrs({ images }, true);
      return;
    }
    if (action === "prev-image" || action === "next-image") {
      const images = imageList(currentNode.attrs.images);
      if (images.length < 2) return;
      activeCarouselIndex =
        action === "prev-image"
          ? (activeCarouselIndex - 1 + images.length) % images.length
          : (activeCarouselIndex + 1) % images.length;
      render();
      return;
    }
    if (action === "open-sort") {
      sortDraft = imageList(currentNode.attrs.images);
      sortOpen = true;
      render();
      return;
    }
    if (action === "cancel-sort") {
      sortOpen = false;
      sortDraft = [];
      draggingSortIndex = null;
      render();
      return;
    }
    if (action === "save-sort") {
      sortOpen = false;
      draggingSortIndex = null;
      activeCarouselIndex = Math.min(activeCarouselIndex, Math.max(0, sortDraft.length - 1));
      setAttrs({ images: sortDraft }, true);
      sortDraft = [];
      return;
    }
    if (action === "toggle-button-popover") {
      standaloneButtonPopover = !standaloneButtonPopover;
      render();
      return;
    }
    if (action === "add-column") {
      const headers = effectiveHeaders(currentNode.attrs.headers);
      const rows = effectiveRows(currentNode.attrs.data, headers);
      const nextHeader = uniqueHeader(headers);
      setAttrs({
        headers: [...headers, nextHeader],
        data: rows.map((row) => ({ ...row, [nextHeader]: "" })),
      }, true);
      return;
    }
    if (action === "remove-column") {
      const index = Number(actionTarget.dataset.index ?? 0);
      const headers = effectiveHeaders(currentNode.attrs.headers);
      if (headers.length < 2) return;
      const removed = headers[index];
      const nextHeaders = headers.filter((_, itemIndex) => itemIndex !== index);
      const rows = effectiveRows(currentNode.attrs.data, headers).map((row) => {
        const next = { ...row };
        delete next[removed];
        return next;
      });
      setAttrs({ headers: nextHeaders, data: rows }, true);
      return;
    }
    if (action === "add-row") {
      const headers = effectiveHeaders(currentNode.attrs.headers);
      const row = Object.fromEntries(headers.map((header) => [header, ""]));
      setAttrs({ headers, data: [...effectiveRows(currentNode.attrs.data, headers), row] }, true);
      return;
    }
    if (action === "remove-row") {
      const headers = effectiveHeaders(currentNode.attrs.headers);
      const rows = effectiveRows(currentNode.attrs.data, headers);
      rows.splice(Number(actionTarget.dataset.index ?? 0), 1);
      setAttrs({ headers, data: rows.length ? rows : [Object.fromEntries(headers.map((header) => [header, ""]))] }, true);
      return;
    }
    if (action === "add-row-badge" || action === "add-row-button") {
      const items = rowItems(currentNode.attrs.items);
      items.push(defaultRowItem(action === "add-row-badge" ? "Badge" : "Button"));
      setAttrs({ items }, true);
      return;
    }
    if (action === "remove-row-item") {
      const items = rowItems(currentNode.attrs.items);
      items.splice(Number(actionTarget.dataset.index ?? 0), 1);
      openButtonPopoverIndex = null;
      setAttrs({ items }, true);
      return;
    }
    if (action === "toggle-row-button-popover") {
      const index = Number(actionTarget.dataset.index ?? 0);
      openButtonPopoverIndex = openButtonPopoverIndex === index ? null : index;
      render();
    }
  };

  dom.oninput = (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;

    const rowField = target.dataset.rowField;
    if (rowField) {
      const index = Number(target.dataset.rowIndex ?? 0);
      const items = rowItems(currentNode.attrs.items);
      const item = items[index];
      if (!item) return;
      items[index] = { ...item, [rowField]: rowField === "target" ? cleanOptional(target.value) : target.value } as RowItem;
      if (target.classList.contains("mdx-preview-badge")) {
        target.style.width = `${badgeWidth(target.value)}ch`;
      }
      setAttrs({ items });
      return;
    }

    const field = target.dataset.field;
    if (field) {
      const value =
        field === "width" ||
        field === "height" ||
        field === "maxWidth" ||
        field === "target" ||
        field === "caption"
          ? cleanOptional(target.value)
          : target.value;
      if (target.classList.contains("mdx-preview-badge")) {
        target.style.width = `${badgeWidth(target.value)}ch`;
      }
      setAttrs({ [field]: value });
      return;
    }

    const imageField = target.dataset.imageField as "src" | "alt" | undefined;
    if (imageField) {
      const images = imageList(currentNode.attrs.images);
      const index = Number(target.dataset.index ?? 0);
      images[index] = { ...(images[index] ?? { src: "", alt: "" }), [imageField]: target.value };
      setAttrs({ images });
      return;
    }

    const headerIndex = target.dataset.headerIndex;
    if (headerIndex !== undefined) {
      const index = Number(headerIndex);
      const headers = effectiveHeaders(currentNode.attrs.headers);
      const oldHeader = headers[index];
      const typed = target.value || oldHeader;
      // Row data is keyed by header label, so a duplicate name would merge two
      // columns and silently drop a column's data. Keep the typed text but
      // suffix it until it is unique among the other columns.
      let nextHeader = typed;
      const others = headers.filter((_, itemIndex) => itemIndex !== index);
      if (others.includes(nextHeader)) {
        let suffix = 2;
        while (others.includes(`${typed} ${suffix}`)) suffix += 1;
        nextHeader = `${typed} ${suffix}`;
      }
      headers[index] = nextHeader;
      const rows = effectiveRows(currentNode.attrs.data, headers).map((row) => {
        if (oldHeader === nextHeader) return row;
        const next = { ...row, [nextHeader]: row[oldHeader] ?? "" };
        delete next[oldHeader];
        return next;
      });
      setAttrs({ headers, data: rows });
      return;
    }

    const tableRow = target.dataset.tableRow;
    const tableCol = target.dataset.tableCol;
    if (tableRow !== undefined && tableCol !== undefined) {
      const headers = effectiveHeaders(currentNode.attrs.headers);
      const rows = effectiveRows(currentNode.attrs.data, headers);
      const rowIndex = Number(tableRow);
      const header = headers[Number(tableCol)];
      rows[rowIndex] = { ...(rows[rowIndex] ?? {}), [header]: target.value };
      setAttrs({ headers, data: rows });
    }
  };

  dom.ondragstart = (event) => {
    if (!sortOpen) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const item = target?.closest<HTMLElement>(".mdx-sort-item");
    if (!item) return;
    draggingSortIndex = Number(item.dataset.sortIndex ?? 0);
    event.dataTransfer?.setData("text/plain", String(draggingSortIndex));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  dom.ondragover = (event) => {
    if (!sortOpen || draggingSortIndex === null) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const item = target?.closest<HTMLElement>(".mdx-sort-item");
    if (!item) return;
    event.preventDefault();
    const targetIndex = Number(item.dataset.sortIndex ?? -1);
    if (targetIndex < 0 || targetIndex === draggingSortIndex) return;
    const [moving] = sortDraft.splice(draggingSortIndex, 1);
    sortDraft.splice(targetIndex, 0, moving);
    draggingSortIndex = targetIndex;
    render();
  };

  dom.ondrop = (event) => {
    if (!sortOpen) return;
    event.preventDefault();
    draggingSortIndex = null;
    render();
  };

  dom.ondragend = () => {
    if (!sortOpen) return;
    draggingSortIndex = null;
    render();
  };

  render();

  return {
    dom,
    update(nextNode: typeof currentNode) {
      if (nextNode.type !== currentNode.type) return false;
      currentNode = nextNode;
      if (!dom.contains(document.activeElement)) render();
      return true;
    },
    stopEvent(event: Event) {
      return (
        event.target instanceof HTMLElement &&
        Boolean(event.target.closest(".mdx-inline-control, .mdx-sort-modal"))
      );
    },
    ignoreMutation() {
      return true;
    },
  };
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
  addNodeView() {
    return (props) =>
      componentNodeView(
        props,
        { name: "Raw MDX", tiptapName: "rawMdxBlock", defaultAttrs: { source: "" } },
        {},
      );
  },
});

export function createCustomComponentExtensions(options: ComponentExtensionOptions = {}) {
  return [
    ...COMPONENT_SPECS.map((spec) => buildNode(spec, options)),
    buildNode(COMPONENT_ROW_SPEC, options),
    RawMdxBlock,
  ];
}

export const customComponentExtensions = createCustomComponentExtensions();
