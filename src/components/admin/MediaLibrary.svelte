<script lang="ts">
  import {
    FolderInput,
    ImagePlus,
    Loader2,
    Pencil,
    Search,
    Trash2,
  } from "@lucide/svelte";
  import type { MediaItem, MediaReference, MediaRoot } from "../../lib/admin/media";

  let items = $state<MediaItem[]>([]);
  let selected = $state<MediaItem | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let query = $state("");
  let root = $state<MediaRoot>("images");
  let folder = $state("");
  let filename = $state("");
  let uploadFile = $state<File | null>(null);
  let editRoot = $state<MediaRoot>("images");
  let editFolder = $state("");
  let editFilename = $state("");
  let deleteRefs = $state<MediaReference[] | null>(null);

  const filtered = $derived(
    items.filter((item) => {
      const haystack = `${item.path} ${item.folder} ${item.name}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    }),
  );

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/admin/media");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      items = data.items;
      if (selected) {
        selected = items.find((item) => item.repoPath === selected?.repoPath) ?? null;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load media.";
    } finally {
      loading = false;
    }
  }

  function selectItem(item: MediaItem) {
    selected = item;
    editRoot = item.root;
    editFolder = item.folder;
    editFilename = item.name;
    deleteRefs = null;
    error = null;
  }

  async function upload() {
    if (!uploadFile) return;
    saving = true;
    error = null;
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("root", root);
    fd.append("folder", folder);
    if (filename.trim()) fd.append("filename", filename.trim());
    try {
      const res = await fetch("/api/admin/media", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      uploadFile = null;
      filename = "";
      await load();
      if (data.item) selectItem(data.item);
    } catch (err) {
      error = err instanceof Error ? err.message : "Upload failed.";
    } finally {
      saving = false;
    }
  }

  async function moveSelected() {
    if (!selected) return;
    saving = true;
    error = null;
    try {
      const res = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repoPath: selected.repoPath,
          root: editRoot,
          folder: editFolder,
          filename: editFilename,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
      if (data.item) selectItem(data.item);
    } catch (err) {
      error = err instanceof Error ? err.message : "Move failed.";
    } finally {
      saving = false;
    }
  }

  async function deleteSelected(force = false) {
    if (!selected) return;
    saving = true;
    error = null;
    try {
      const res = await fetch("/api/admin/media", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoPath: selected.repoPath, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data.references)) {
          deleteRefs = data.references;
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      selected = null;
      deleteRefs = null;
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : "Delete failed.";
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    load();
  });
</script>

<section class="media-page">
  <header class="media-header">
    <div>
      <p class="eyebrow">Media library</p>
      <h1>Repository images</h1>
    </div>
    <label class="search-box">
      <Search size={16} />
      <input bind:value={query} type="search" placeholder="Search path or filename..." />
    </label>
  </header>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <section class="upload-panel" aria-label="Upload image">
    <div class="upload-title">
      <ImagePlus size={20} />
      <strong>Upload image</strong>
    </div>
    <label>
      <span>Root</span>
      <select bind:value={root}>
        <option value="images">/images</option>
        <option value="assets">/assets</option>
      </select>
    </label>
    <label>
      <span>Folder</span>
      <input bind:value={folder} placeholder="projects/voltalfa" />
    </label>
    <label>
      <span>Filename</span>
      <input bind:value={filename} placeholder="1.png" />
    </label>
    <label class="file-input">
      <span>{uploadFile?.name ?? "Choose image"}</span>
      <input
        type="file"
        accept="image/*"
        onchange={(event) => {
          uploadFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
        }}
      />
    </label>
    <button type="button" onclick={upload} disabled={!uploadFile || saving}>
      {#if saving}<Loader2 class="spin" size={16} />{/if}
      Upload
    </button>
  </section>

  <div class="media-workspace">
    <div class="grid-shell">
      {#if loading}
        <p class="muted">Loading media...</p>
      {:else}
        <div class="media-grid">
          {#each filtered as item (item.repoPath)}
            <button
              type="button"
              class:selected={selected?.repoPath === item.repoPath}
              class="media-tile"
              onclick={() => selectItem(item)}
            >
              <img src={item.path} alt="" loading="lazy" />
              <span>{item.name}</span>
              <small>{item.references.length} refs · {Math.round(item.size / 1024)}KB</small>
            </button>
          {:else}
            <p class="muted">No images found.</p>
          {/each}
        </div>
      {/if}
    </div>

    <aside class="inspector">
      {#if selected}
        <img class="preview" src={selected.path} alt="" />
        <p class="path">{selected.path}</p>
        <div class="edit-grid">
          <label>
            <span>Root</span>
            <select bind:value={editRoot}>
              <option value="images">/images</option>
              <option value="assets">/assets</option>
            </select>
          </label>
          <label>
            <span>Folder</span>
            <input bind:value={editFolder} />
          </label>
          <label>
            <span>Filename</span>
            <input bind:value={editFilename} />
          </label>
        </div>
        <div class="inspector-actions">
          <button type="button" onclick={moveSelected} disabled={saving}>
            <FolderInput size={16} />
            Move / rename
          </button>
          <button type="button" class="danger" onclick={() => deleteSelected(false)} disabled={saving}>
            <Trash2 size={16} />
            Delete
          </button>
        </div>

        {#if deleteRefs}
          <div class="refs warning">
            <strong>Referenced image</strong>
            <p>Delete is blocked because this image is still used.</p>
            <button type="button" class="danger" onclick={() => deleteSelected(true)} disabled={saving}>
              Force delete anyway
            </button>
          </div>
        {/if}

        <div class="refs">
          <strong>References</strong>
          {#if selected.references.length > 0}
            {#each selected.references as ref}
              <a href={`/admin/${ref.collection}/${ref.slug}`}>
                <Pencil size={14} />
                {ref.collection}/{ref.slug} · {ref.field} · {ref.count}
              </a>
            {/each}
          {:else}
            <p>Not referenced.</p>
          {/if}
        </div>
      {:else}
        <p class="muted">Select an image to inspect, rename, move or delete it.</p>
      {/if}
    </aside>
  </div>
</section>

<style lang="scss">
  .media-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .media-header,
  .upload-panel,
  .inspector,
  .grid-shell {
    border: 1px solid $color-accent-1;
    border-radius: 5px;
  }

  .media-header {
    background-color: $color-primary;
    padding: 1rem;
    display: grid;
    gap: 1rem;

    @include respond-to("tablet") {
      grid-template-columns: 1fr minmax(18rem, 30rem);
      align-items: end;
    }
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .search-box,
  .upload-panel label,
  .edit-grid label,
  .file-input {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background-color: $color-white;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    padding: 0.5rem 0.65rem;
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    text-transform: uppercase;
  }

  input,
  select {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: $color-text;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    text-transform: none;
  }

  .upload-panel {
    background-color: $color-tertiary;
    padding: 0.75rem;
    display: grid;
    gap: 0.65rem;

    @include respond-to("desktop") {
      grid-template-columns: auto 9rem 1fr 12rem 14rem auto;
      align-items: center;
    }
  }

  .upload-title {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .file-input {
    cursor: pointer;

    input {
      display: none;
    }
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: $color-accent-1;
    color: $color-white;
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    font-weight: 800;
    padding: 0.55rem 0.8rem;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    &.danger {
      background-color: $color-error;
      border-color: $color-error;
    }
  }

  .media-workspace {
    display: grid;
    gap: 1rem;

    @include respond-to("desktop") {
      grid-template-columns: minmax(0, 1fr) 22rem;
      align-items: start;
    }
  }

  .grid-shell {
    background-color: $color-white;
    min-height: 28rem;
    padding: 0.75rem;
  }

  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.75rem;
  }

  .media-tile {
    display: grid;
    gap: 0.45rem;
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    color: $color-text;
    padding: 0.55rem;
    text-align: left;

    &.selected {
      outline: 3px solid $color-accent-2;
      outline-offset: 2px;
    }

    img {
      aspect-ratio: 4 / 3;
      background: repeating-linear-gradient(
        45deg,
        rgba($color-secondary, 0.65),
        rgba($color-secondary, 0.65) 0.65rem,
        rgba($color-tertiary, 0.65) 0.65rem,
        rgba($color-tertiary, 0.65) 1.3rem
      );
      border: 1px solid rgba($color-accent-1, 0.7);
      border-radius: 4px;
      object-fit: contain;
      width: 100%;
    }

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: $color-accent-1;
    }
  }

  .inspector {
    background-color: $color-primary;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .preview {
    background-color: $color-white;
    border: 1px solid $color-accent-1;
    border-radius: 4px;
    max-height: 16rem;
    object-fit: contain;
    width: 100%;
  }

  .path {
    color: $color-accent-1;
    font-size: $fs-sm;
    overflow-wrap: anywhere;
  }

  .edit-grid {
    display: grid;
    gap: 0.5rem;
  }

  .inspector-actions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .refs {
    background-color: rgba($color-white, 0.65);
    border: 1px solid rgba($color-accent-1, 0.55);
    border-radius: 5px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: $fs-sm;

    &.warning {
      border-color: $color-warning;
      background-color: rgba($color-warning, 0.22);
    }

    a {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: $color-text;
      text-decoration: none;
    }

    p {
      margin: 0;
      color: $color-accent-1;
    }
  }

  .error {
    background-color: $color-error;
    color: $color-white;
    border-radius: 5px;
    padding: 0.75rem 1rem;
    font-size: $fs-sm;
  }

  .muted {
    color: $color-accent-1;
    font-size: $fs-sm;
  }

  .spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
