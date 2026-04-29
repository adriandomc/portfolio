<script lang="ts">
  interface Props {
    nodeName: string;
    attrs: Record<string, unknown>;
    onSave: (attrs: Record<string, unknown>) => void;
    onCancel: () => void;
    onDelete: () => void;
  }

  let { nodeName, attrs, onSave, onCancel, onDelete }: Props = $props();

  let local = $state<Record<string, unknown>>(JSON.parse(JSON.stringify(attrs)));

  const componentName = $derived(
    nodeName === "rawMdxBlock"
      ? "Raw MDX"
      : nodeName.replace(/^mdx/, ""),
  );

  function setField(key: string, value: unknown) {
    local = { ...local, [key]: value };
  }

  function addImage() {
    const images = Array.isArray(local.images)
      ? [...(local.images as Array<{ src: string; alt: string }>)]
      : [];
    images.push({ src: "", alt: "" });
    setField("images", images);
  }

  function removeImage(index: number) {
    const images = [
      ...(local.images as Array<{ src: string; alt: string }>),
    ];
    images.splice(index, 1);
    setField("images", images);
  }

  function updateImage(
    index: number,
    field: "src" | "alt",
    value: string,
  ) {
    const images = [
      ...(local.images as Array<{ src: string; alt: string }>),
    ];
    images[index] = { ...images[index], [field]: value };
    setField("images", images);
  }

  async function uploadImage(index: number, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/images", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Upload failed (${res.status})`);
      return;
    }
    const data = await res.json();
    updateImage(index, "src", data.path);
  }

  function addRow() {
    const data = Array.isArray(local.data)
      ? [...(local.data as Array<Record<string, unknown>>)]
      : [];
    const headers = Array.isArray(local.headers)
      ? (local.headers as string[])
      : [];
    const newRow: Record<string, unknown> = {};
    headers.forEach((h) => (newRow[h] = ""));
    data.push(newRow);
    setField("data", data);
  }

  function removeRow(index: number) {
    const data = [...(local.data as Array<Record<string, unknown>>)];
    data.splice(index, 1);
    setField("data", data);
  }

  function updateCell(index: number, key: string, value: string) {
    const data = [...(local.data as Array<Record<string, unknown>>)];
    data[index] = { ...data[index], [key]: value };
    setField("data", data);
  }

  function updateHeaders(value: string) {
    setField(
      "headers",
      value
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean),
    );
  }

  function save() {
    onSave(local);
  }
</script>

<div
  class="modal-backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onCancel();
  }}
  onkeydown={(e) => {
    if (e.key === "Escape") onCancel();
  }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label={`Edit ${componentName}`}>
    <header>
      <h2>Edit {componentName}</h2>
      <button type="button" class="close" onclick={onCancel} aria-label="Close">
        ×
      </button>
    </header>

    <div class="body">
      {#if nodeName === "rawMdxBlock"}
        <label class="field">
          <span>MDX source</span>
          <textarea
            rows="10"
            value={String(local.source ?? "")}
            oninput={(e) =>
              setField("source", (e.currentTarget as HTMLTextAreaElement).value)}
          ></textarea>
        </label>
      {:else if nodeName === "mdxImageCarousel"}
        <div class="images">
          <div class="images-header">
            <span class="label">Images</span>
            <button type="button" class="link-btn" onclick={addImage}>
              + Add image
            </button>
          </div>
          {#if Array.isArray(local.images) && local.images.length > 0}
            {#each local.images as img, i (i)}
              <div class="image-row">
                <div class="image-fields">
                  <label class="field">
                    <span>Path</span>
                    <input
                      type="text"
                      value={img.src}
                      oninput={(e) =>
                        updateImage(
                          i,
                          "src",
                          (e.currentTarget as HTMLInputElement).value,
                        )}
                      placeholder="/images/..."
                    />
                  </label>
                  <label class="field">
                    <span>Alt</span>
                    <input
                      type="text"
                      value={img.alt}
                      oninput={(e) =>
                        updateImage(
                          i,
                          "alt",
                          (e.currentTarget as HTMLInputElement).value,
                        )}
                    />
                  </label>
                </div>
                <div class="image-actions">
                  <label class="upload-btn">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      onchange={(e) => {
                        const file = (e.currentTarget as HTMLInputElement).files?.[0];
                        if (file) uploadImage(i, file);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    class="link-btn danger"
                    onclick={() => removeImage(i)}
                    aria-label="Remove image"
                  >
                    Remove
                  </button>
                </div>
              </div>
            {/each}
          {:else}
            <p class="muted">No images yet.</p>
          {/if}
        </div>

        <label class="field">
          <span>Caption</span>
          <textarea
            rows="2"
            value={String(local.caption ?? "")}
            oninput={(e) =>
              setField(
                "caption",
                (e.currentTarget as HTMLTextAreaElement).value,
              )}
          ></textarea>
        </label>

        <div class="row">
          <label class="field">
            <span>Aspect ratio</span>
            <input
              type="text"
              value={String(local.aspectRatio ?? "")}
              oninput={(e) =>
                setField(
                  "aspectRatio",
                  (e.currentTarget as HTMLInputElement).value,
                )}
            />
          </label>
          <label class="field">
            <span>Max width</span>
            <input
              type="text"
              value={String(local.maxWidth ?? "")}
              oninput={(e) =>
                setField(
                  "maxWidth",
                  (e.currentTarget as HTMLInputElement).value,
                )}
            />
          </label>
          <label class="field">
            <span>Object fit</span>
            <select
              value={String(local.objectFit ?? "contain")}
              onchange={(e) =>
                setField(
                  "objectFit",
                  (e.currentTarget as HTMLSelectElement).value,
                )}
            >
              <option value="contain">contain</option>
              <option value="cover">cover</option>
            </select>
          </label>
        </div>
      {:else if nodeName === "mdxFigure"}
        <label class="field">
          <span>Image path</span>
          <div class="row align-end">
            <input
              type="text"
              value={String(local.src ?? "")}
              oninput={(e) =>
                setField("src", (e.currentTarget as HTMLInputElement).value)}
              placeholder="/images/..."
            />
            <label class="upload-btn">
              Upload
              <input
                type="file"
                accept="image/*"
                onchange={async (e) => {
                  const file = (e.currentTarget as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append("file", file);
                  const res = await fetch("/api/admin/images", {
                    method: "POST",
                    body: fd,
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setField("src", data.path);
                  } else {
                    const data = await res.json().catch(() => ({}));
                    alert(data.error ?? `Upload failed (${res.status})`);
                  }
                }}
              />
            </label>
          </div>
        </label>

        <label class="field">
          <span>Alt</span>
          <input
            type="text"
            value={String(local.alt ?? "")}
            oninput={(e) =>
              setField("alt", (e.currentTarget as HTMLInputElement).value)}
          />
        </label>

        <label class="field">
          <span>Caption</span>
          <textarea
            rows="2"
            value={String(local.caption ?? "")}
            oninput={(e) =>
              setField(
                "caption",
                (e.currentTarget as HTMLTextAreaElement).value,
              )}
          ></textarea>
        </label>

        <div class="row">
          <label class="field">
            <span>Width</span>
            <input
              type="text"
              value={String(local.width ?? "")}
              oninput={(e) =>
                setField("width", (e.currentTarget as HTMLInputElement).value || null)}
            />
          </label>
          <label class="field">
            <span>Height</span>
            <input
              type="text"
              value={String(local.height ?? "")}
              oninput={(e) =>
                setField("height", (e.currentTarget as HTMLInputElement).value || null)}
            />
          </label>
          <label class="field">
            <span>Max width</span>
            <input
              type="text"
              value={String(local.maxWidth ?? "")}
              oninput={(e) =>
                setField("maxWidth", (e.currentTarget as HTMLInputElement).value || null)}
            />
          </label>
        </div>
      {:else if nodeName === "mdxCard"}
        <label class="field">
          <span>Title (optional)</span>
          <input
            type="text"
            value={String(local.title ?? "")}
            oninput={(e) =>
              setField("title", (e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Body</span>
          <textarea
            rows="4"
            value={String(local.caption ?? "")}
            oninput={(e) =>
              setField(
                "caption",
                (e.currentTarget as HTMLTextAreaElement).value,
              )}
          ></textarea>
        </label>
      {:else if nodeName === "mdxBadge"}
        <label class="field">
          <span>Text</span>
          <input
            type="text"
            value={String(local.title ?? "")}
            oninput={(e) =>
              setField("title", (e.currentTarget as HTMLInputElement).value)}
          />
        </label>
      {:else if nodeName === "mdxButton"}
        <label class="field">
          <span>Label</span>
          <input
            type="text"
            value={String(local.label ?? "")}
            oninput={(e) =>
              setField("label", (e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Link (href)</span>
          <input
            type="text"
            value={String(local.href ?? "")}
            oninput={(e) =>
              setField("href", (e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div class="row">
          <label class="field">
            <span>Variant</span>
            <select
              value={String(local.variant ?? "primary")}
              onchange={(e) =>
                setField(
                  "variant",
                  (e.currentTarget as HTMLSelectElement).value,
                )}
            >
              <option value="primary">primary</option>
              <option value="secondary">secondary</option>
              <option value="danger">danger</option>
              <option value="warning">warning</option>
            </select>
          </label>
          <label class="field">
            <span>Target</span>
            <select
              value={String(local.target ?? "")}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                setField("target", v === "" ? null : v);
              }}
            >
              <option value="">(same tab)</option>
              <option value="_blank">_blank (new tab)</option>
            </select>
          </label>
        </div>
      {:else if nodeName === "mdxTable"}
        <label class="field">
          <span>Headers (comma-separated)</span>
          <input
            type="text"
            value={Array.isArray(local.headers)
              ? (local.headers as string[]).join(", ")
              : ""}
            oninput={(e) =>
              updateHeaders((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Caption (optional)</span>
          <input
            type="text"
            value={String(local.caption ?? "")}
            oninput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              setField("caption", v || null);
            }}
          />
        </label>

        <div class="rows-section">
          <div class="images-header">
            <span class="label">Rows</span>
            <button type="button" class="link-btn" onclick={addRow}>
              + Add row
            </button>
          </div>
          {#if Array.isArray(local.data) && local.data.length > 0}
            {#each local.data as row, i (i)}
              <div class="table-row">
                {#each (local.headers as string[]) ?? [] as header (header)}
                  <label class="field">
                    <span>{header}</span>
                    <input
                      type="text"
                      value={String((row as Record<string, unknown>)[header] ?? "")}
                      oninput={(e) =>
                        updateCell(
                          i,
                          header,
                          (e.currentTarget as HTMLInputElement).value,
                        )}
                    />
                  </label>
                {/each}
                <button
                  type="button"
                  class="link-btn danger"
                  onclick={() => removeRow(i)}
                >
                  Remove row
                </button>
              </div>
            {/each}
          {:else}
            <p class="muted">No rows yet.</p>
          {/if}
        </div>
      {/if}
    </div>

    <footer>
      <button type="button" class="link-btn danger" onclick={onDelete}>
        Delete block
      </button>
      <div class="footer-actions">
        <button type="button" class="cancel" onclick={onCancel}>Cancel</button>
        <button type="button" class="primary" onclick={save}>Save</button>
      </div>
    </footer>
  </div>
</div>

<style lang="scss">
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal {
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    width: 100%;
    max-width: 40rem;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    background-color: $color-accent-1;
    color: $color-white;
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;

    h2 {
      margin: 0;
      font-size: $fs-lg;
    }
  }

  .close {
    background: transparent;
    color: $color-white;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;

    &:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }
  }

  .body {
    padding: 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: $fs-sm;
  }

  .field span {
    font-weight: 600;
  }

  .field input,
  .field textarea,
  .field select {
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    padding: 0.45rem 0.6rem;
    border-radius: 3px;
    border: 1px solid $color-accent-1;
    background-color: $color-white;
    color: $color-text;
    width: 100%;
  }

  .row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;

    .field {
      flex: 1;
      min-width: 8rem;
    }

    &.align-end {
      align-items: flex-end;
    }
  }

  .label {
    font-weight: 600;
    font-size: $fs-sm;
  }

  .muted {
    color: $color-accent-1;
    font-size: $fs-sm;
    margin: 0.25rem 0;
  }

  .images,
  .rows-section {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .images-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .image-row {
    background-color: $color-white;
    border: 1px solid $color-accent-1;
    border-radius: 4px;
    padding: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .image-fields {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .image-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .table-row {
    background-color: $color-white;
    border: 1px solid $color-accent-1;
    border-radius: 4px;
    padding: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .upload-btn {
    background-color: $color-accent-2;
    color: $color-text;
    border-radius: 9999px;
    padding: 0.35rem 0.85rem;
    font-size: $fs-sm;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;

    input {
      display: none;
    }

    &:hover {
      background-color: $color-secondary;
    }
  }

  .link-btn {
    background: transparent;
    border: none;
    color: $color-link;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    text-decoration: underline;

    &:hover {
      color: $color-text;
    }

    &.danger {
      color: $color-error;
    }
  }

  footer {
    background-color: $color-primary;
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid $color-accent-1;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .footer-actions {
    display: flex;
    gap: 0.5rem;
  }

  .cancel,
  .primary {
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    font-weight: 600;
    padding: 0.45rem 1rem;
    border-radius: 9999px;
    border: 2px solid transparent;
    cursor: pointer;
  }

  .cancel {
    background-color: transparent;
    color: $color-text;
    border-color: $color-accent-1;

    &:hover {
      background-color: $color-accent-1;
      color: $color-white;
    }
  }

  .primary {
    background-color: $color-accent-1;
    color: $color-white;
    border-color: $color-accent-1;

    &:hover {
      background-color: $color-text;
      border-color: $color-text;
    }
  }
</style>
