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

export type MdxMediaPickerRequest =
  | { kind: "blockFigure"; pos: number }
  | { kind: "blockCarousel"; pos: number; index: number };

export interface ComponentExtensionOptions {
  openMediaPicker?: (target: MdxMediaPickerRequest) => void;
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

function rowList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function cleanOptional(value: string): string | null {
  return value.trim() ? value : null;
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

  function shell(inner: string): string {
    return `
      <div class="mdx-block-head">
        <span class="mdx-block-label">${spec.name}</span>
        <button class="mdx-inline-control mdx-danger" type="button" data-action="delete">Delete</button>
      </div>
      ${inner}
    `;
  }

  function renderFigure(attrs: Record<string, unknown>) {
    const src = String(attrs.src ?? "");
    return shell(`
      <div class="mdx-figure-preview">
        ${
          src
            ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(attrs.alt)}" />`
            : `<button class="mdx-empty-media mdx-inline-control" type="button" data-action="pick-figure">
                <span>Add image</span>
              </button>`
        }
      </div>
      <div class="mdx-fields mdx-fields--media">
        <label><span>Path</span><input class="mdx-inline-control" data-field="src" value="${escapeHtml(src)}" placeholder="/images/..." /></label>
        <button class="mdx-inline-control" type="button" data-action="pick-figure">Pick</button>
        <label><span>Alt</span><input class="mdx-inline-control" data-field="alt" value="${escapeHtml(attrs.alt)}" /></label>
        <label><span>Caption</span><textarea class="mdx-inline-control" data-field="caption" rows="2">${escapeHtml(attrs.caption)}</textarea></label>
        <label><span>Width</span><input class="mdx-inline-control" data-field="width" value="${escapeHtml(attrs.width)}" /></label>
        <label><span>Height</span><input class="mdx-inline-control" data-field="height" value="${escapeHtml(attrs.height)}" /></label>
        <label><span>Max width</span><input class="mdx-inline-control" data-field="maxWidth" value="${escapeHtml(attrs.maxWidth)}" /></label>
      </div>
    `);
  }

  function renderCarousel(attrs: Record<string, unknown>) {
    const images = imageList(attrs.images);
    const tiles =
      images.length > 0
        ? images
            .map(
              (image, index) => `
                <article class="mdx-carousel-item">
                  ${
                    image.src
                      ? `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" />`
                      : `<button class="mdx-empty-media mdx-inline-control" type="button" data-action="pick-carousel" data-index="${index}">Add image</button>`
                  }
                  <input class="mdx-inline-control" data-image-field="src" data-index="${index}" value="${escapeHtml(image.src)}" placeholder="/images/..." />
                  <input class="mdx-inline-control" data-image-field="alt" data-index="${index}" value="${escapeHtml(image.alt)}" placeholder="Alt text" />
                  <div class="mdx-mini-actions">
                    <button class="mdx-inline-control" type="button" data-action="pick-carousel" data-index="${index}">Pick</button>
                    <button class="mdx-inline-control" type="button" data-action="move-image" data-index="${index}" data-direction="-1">Left</button>
                    <button class="mdx-inline-control" type="button" data-action="move-image" data-index="${index}" data-direction="1">Right</button>
                    <button class="mdx-inline-control mdx-danger" type="button" data-action="remove-image" data-index="${index}">Remove</button>
                  </div>
                </article>
              `,
            )
            .join("")
        : `<button class="mdx-empty-media mdx-inline-control" type="button" data-action="add-image">Add first image</button>`;
    return shell(`
      <div class="mdx-carousel-strip">${tiles}</div>
      <div class="mdx-fields mdx-fields--carousel">
        <button class="mdx-inline-control" type="button" data-action="add-image">Add image</button>
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
    `);
  }

  function renderCard(attrs: Record<string, unknown>) {
    return shell(`
      <div class="mdx-preview-card">
        <input class="mdx-inline-control mdx-card-title" data-field="title" value="${escapeHtml(attrs.title)}" placeholder="Card title" />
        <textarea class="mdx-inline-control" data-field="caption" rows="3" placeholder="Card body">${escapeHtml(attrs.caption)}</textarea>
      </div>
    `);
  }

  function renderBadge(attrs: Record<string, unknown>) {
    return shell(`
      <div class="mdx-badge-row">
        <span class="mdx-preview-badge">${escapeHtml(attrs.title || "Badge")}</span>
        <input class="mdx-inline-control" data-field="title" value="${escapeHtml(attrs.title)}" placeholder="Badge text" />
      </div>
    `);
  }

  function renderButton(attrs: Record<string, unknown>) {
    const variant = String(attrs.variant ?? "primary");
    return shell(`
      <div class="mdx-button-preview mdx-button-preview--${escapeHtml(variant)}">${escapeHtml(attrs.label || "Button")}</div>
      <div class="mdx-fields mdx-fields--button">
        <label><span>Label</span><input class="mdx-inline-control" data-field="label" value="${escapeHtml(attrs.label)}" /></label>
        <label><span>Href</span><input class="mdx-inline-control" data-field="href" value="${escapeHtml(attrs.href)}" /></label>
        <label><span>Variant</span>
          <select class="mdx-inline-control" data-field="variant">
            ${["primary", "secondary", "danger", "warning"]
              .map((value) => `<option value="${value}" ${variant === value ? "selected" : ""}>${value}</option>`)
              .join("")}
          </select>
        </label>
        <label><span>Target</span>
          <select class="mdx-inline-control" data-field="target">
            <option value="" ${!attrs.target ? "selected" : ""}>same tab</option>
            <option value="_blank" ${attrs.target === "_blank" ? "selected" : ""}>new tab</option>
          </select>
        </label>
      </div>
    `);
  }

  function renderTable(attrs: Record<string, unknown>) {
    const headers = headersList(attrs.headers);
    const rows = rowList(attrs.data);
    const table = headers.length
      ? `
        <table class="mdx-preview-table">
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (row, rowIndex) => `
                        <tr>
                          ${headers
                            .map(
                              (header) =>
                                `<td><input class="mdx-inline-control" data-table-cell="${escapeHtml(header)}" data-row="${rowIndex}" value="${escapeHtml(row[header])}" /></td>`,
                            )
                            .join("")}
                          <td><button class="mdx-inline-control mdx-danger" type="button" data-action="remove-row" data-index="${rowIndex}">Remove</button></td>
                        </tr>
                      `,
                    )
                    .join("")
                : `<tr><td colspan="${headers.length + 1}">No rows yet.</td></tr>`
            }
          </tbody>
        </table>
      `
      : `<p class="mdx-empty-copy">Add comma-separated headers to start the table.</p>`;
    return shell(`
      <div class="mdx-fields">
        <label><span>Headers</span><input class="mdx-inline-control" data-action-field="headers" value="${escapeHtml(headers.join(", "))}" placeholder="Name, Value, Link" /></label>
        <label><span>Caption</span><input class="mdx-inline-control" data-field="caption" value="${escapeHtml(attrs.caption)}" /></label>
      </div>
      ${table}
      <button class="mdx-inline-control" type="button" data-action="add-row">Add row</button>
    `);
  }

  function renderRaw(attrs: Record<string, unknown>) {
    return `
      <div class="mdx-block-head">
        <span class="mdx-block-label">Raw MDX</span>
        <button class="mdx-inline-control mdx-danger" type="button" data-action="delete">Delete</button>
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
    else dom.innerHTML = renderRaw(attrs);
  }

  dom.onclick = (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.action;
    if (action === "delete") {
      deleteNode();
      return;
    }
    if (action === "pick-figure") {
      openFigurePicker();
      return;
    }
    if (action === "add-image") {
      const images = imageList(currentNode.attrs.images);
      const next = [...images, { src: "", alt: "" }];
      setAttrs({ images: next }, true);
      openCarouselPicker(next.length - 1);
      return;
    }
    if (action === "pick-carousel") {
      const index = Number(button.dataset.index ?? 0);
      openCarouselPicker(index);
      return;
    }
    if (action === "remove-image") {
      const index = Number(button.dataset.index ?? 0);
      const images = imageList(currentNode.attrs.images);
      images.splice(index, 1);
      setAttrs({ images }, true);
      return;
    }
    if (action === "move-image") {
      const index = Number(button.dataset.index ?? 0);
      const direction = Number(button.dataset.direction ?? 0);
      const images = imageList(currentNode.attrs.images);
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= images.length) return;
      [images[index], images[targetIndex]] = [images[targetIndex], images[index]];
      setAttrs({ images }, true);
      return;
    }
    if (action === "add-row") {
      const headers = headersList(currentNode.attrs.headers);
      const row = Object.fromEntries(headers.map((header) => [header, ""]));
      setAttrs({ data: [...rowList(currentNode.attrs.data), row] }, true);
      return;
    }
    if (action === "remove-row") {
      const rows = rowList(currentNode.attrs.data);
      rows.splice(Number(button.dataset.index ?? 0), 1);
      setAttrs({ data: rows }, true);
    }
  };

  dom.oninput = (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;

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

    const headersField = target.dataset.actionField;
    if (headersField === "headers") {
      const headers = target.value
        .split(",")
        .map((header) => header.trim())
        .filter(Boolean);
      setAttrs({ headers });
      return;
    }

    const tableCell = target.dataset.tableCell;
    if (tableCell) {
      const rows = rowList(currentNode.attrs.data);
      const rowIndex = Number(target.dataset.row ?? 0);
      rows[rowIndex] = { ...(rows[rowIndex] ?? {}), [tableCell]: target.value };
      setAttrs({ data: rows });
    }
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
      return event.target instanceof HTMLElement && Boolean(event.target.closest(".mdx-inline-control"));
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
    RawMdxBlock,
  ];
}

export const customComponentExtensions = createCustomComponentExtensions();
