<script lang="ts">
  import {
    ChevronRight,
    Folder,
    FolderOpen,
    ImagePlus,
    Loader2,
    Search,
    X,
  } from "@lucide/svelte";
  import type { MediaFolder, MediaItem, MediaKind, MediaRoot } from "../../lib/admin/media";

  interface Props {
    title?: string;
    defaultRoot?: MediaRoot;
    defaultFolder?: string;
    kind?: MediaKind;
    onSelect: (path: string) => void;
    onClose: () => void;
  }

  let {
    title = "Choose image",
    defaultRoot = "images",
    defaultFolder = "",
    kind = "image",
    onSelect,
    onClose,
  }: Props = $props();

  function initialPickerRoot() {
    return defaultRoot;
  }

  function initialPickerFolder() {
    return defaultFolder;
  }

  let items = $state<MediaItem[]>([]);
  let folders = $state<MediaFolder[]>([]);
  let query = $state("");
  let currentRoot = $state<MediaRoot | null>(initialPickerRoot());
  let currentFolder = $state(initialPickerFolder());
  let selected = $state<MediaItem | null>(null);
  let uploadRoot = $state<MediaRoot>(initialPickerRoot());
  let uploadFolder = $state(initialPickerFolder());
  let uploadFilename = $state("");
  let uploadFile = $state<File | null>(null);
  let newFolderName = $state("");
  let creatingFolder = $state(false);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const breadcrumbs = $derived(
    currentRoot
      ? [
          { label: currentRoot, root: currentRoot, folder: "" },
          ...currentFolder.split("/").filter(Boolean).map((segment, index, segments) => ({
            label: segment,
            root: currentRoot!,
            folder: segments.slice(0, index + 1).join("/"),
          })),
        ]
      : [],
  );
  const visibleFolders = $derived(getVisibleFolders());
  const visibleFiles = $derived(getVisibleFiles());

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/admin/media");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      items = data.items ?? [];
      folders = data.folders ?? [];
      if (selected) {
        selected = items.find((item) => item.repoPath === selected?.repoPath) ?? null;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load media.";
    } finally {
      loading = false;
    }
  }

  function getVisibleFolders() {
    const needle = query.trim().toLowerCase();
    if (needle) {
      return folders
        .filter((folder) => `${folder.root}/${folder.folder}`.toLowerCase().includes(needle))
        .sort((a, b) => `${a.root}/${a.folder}`.localeCompare(`${b.root}/${b.folder}`));
    }
    if (!currentRoot) return [];
    return folders
      .filter((folder) => folder.root === currentRoot && folder.parent === currentFolder)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getVisibleFiles() {
    const needle = query.trim().toLowerCase();
    if (needle) {
      return items
        .filter((item) =>
          item.kind === kind &&
          `${item.path} ${item.folder} ${item.name}`.toLowerCase().includes(needle),
        )
        .sort((a, b) => a.path.localeCompare(b.path));
    }
    if (!currentRoot) return [];
    return items
      .filter((item) => item.kind === kind && item.root === currentRoot && item.folder === currentFolder)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function syncUploadDestination() {
    uploadRoot = currentRoot ?? initialPickerRoot();
    uploadFolder = currentRoot ? currentFolder : initialPickerFolder();
  }

  function openRoot(root: MediaRoot) {
    currentRoot = root;
    currentFolder = "";
    selected = null;
    query = "";
    syncUploadDestination();
  }

  function openFolder(folder: MediaFolder) {
    currentRoot = folder.root;
    currentFolder = folder.folder;
    selected = null;
    query = "";
    syncUploadDestination();
  }

  function openPath(root: MediaRoot, folder: string) {
    currentRoot = root;
    currentFolder = folder;
    selected = null;
    syncUploadDestination();
  }

  function joinFolder(parent: string, name: string) {
    return [parent, name].filter(Boolean).join("/");
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    creatingFolder = true;
    error = null;
    try {
      const root = currentRoot ?? uploadRoot;
      const folder = joinFolder(currentRoot ? currentFolder : uploadFolder, name);
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "folder", root, folder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      newFolderName = "";
      currentRoot = root;
      currentFolder = folder;
      syncUploadDestination();
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : "Create folder failed.";
    } finally {
      creatingFolder = false;
    }
  }

  async function upload() {
    if (!uploadFile) return;
    saving = true;
    error = null;
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("root", uploadRoot);
    fd.append("folder", uploadFolder);
    if (uploadFilename.trim()) fd.append("filename", uploadFilename.trim());
    try {
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.item?.path) {
        onSelect(data.item.path);
        return;
      }
      uploadFile = null;
      uploadFilename = "";
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : "Upload failed.";
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    load();
  });
</script>

<div
  class="picker-backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}
  onkeydown={(event) => {
    if (event.key === "Escape") onClose();
  }}
>
  <div class="picker" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <div>
        <p class="eyebrow">Media picker</p>
        <h2>{title}</h2>
      </div>
      <button type="button" class="icon-btn" onclick={onClose} aria-label="Close">
        <X size={18} />
      </button>
    </header>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="picker-toolbar">
      <label class="search-box">
        <Search size={16} />
        <input bind:value={query} type="search" placeholder="Search media..." />
      </label>
      <div class="breadcrumbs">
        <button
          type="button"
          class:active={!currentRoot}
          onclick={() => {
            currentRoot = null;
            currentFolder = "";
            selected = null;
            syncUploadDestination();
          }}
        >
          My Drive
        </button>
        {#each breadcrumbs as crumb, index}
          <ChevronRight size={14} />
          <button
            type="button"
            class:active={index === breadcrumbs.length - 1}
            onclick={() => openPath(crumb.root, crumb.folder)}
          >
            {crumb.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="picker-body">
      <main class="drive-panel">
        {#if loading}
          <p class="muted">Loading media...</p>
        {:else}
          <div class="drive-grid">
            {#if !currentRoot && !query.trim()}
              <button type="button" class="folder-card" onclick={() => openRoot("images")}>
                <FolderOpen size={26} />
                <span>images</span>
              </button>
            {/if}

            {#each visibleFolders as folder (`${folder.root}/${folder.folder}`)}
              <button type="button" class="folder-card" onclick={() => openFolder(folder)}>
                <Folder size={26} />
                <span>{folder.name}</span>
                <small>{folder.itemCount} files</small>
              </button>
            {/each}

            {#each visibleFiles as item (item.repoPath)}
              <button
                type="button"
                class:selected={selected?.repoPath === item.repoPath}
                class="media-tile"
                onclick={() => (selected = item)}
                ondblclick={() => onSelect(item.path)}
              >
                <img src={item.path} alt={item.name} loading="lazy" />
                <span>{item.name}</span>
                <small>{item.folder ? `/${item.root}/${item.folder}` : `/${item.root}`}</small>
              </button>
            {/each}

            {#if visibleFolders.length === 0 && visibleFiles.length === 0 && (currentRoot || query.trim())}
              <p class="muted">No images found here.</p>
            {/if}
          </div>
        {/if}
      </main>

      <aside class="side-panel">
        {#if selected}
          <img class="preview" src={selected.path} alt={selected.name} />
          <p class="path">{selected.path}</p>
          <button type="button" class="primary" onclick={() => onSelect(selected!.path)}>
            Use image
          </button>
        {:else}
          <div class="empty-preview">
            <ImagePlus size={28} />
            <p>Select an image to preview it.</p>
          </div>
        {/if}

        <section class="upload-card">
          <p class="eyebrow">New folder</p>
          <label>
            <span>Name</span>
            <input bind:value={newFolderName} placeholder="project-gallery" />
          </label>
          <button type="button" class="primary" onclick={createFolder} disabled={!newFolderName.trim() || creatingFolder}>
            {#if creatingFolder}<span class="spin"><Loader2 size={15} /></span>{/if}
            Create folder
          </button>
        </section>

        <section class="upload-card">
          <p class="eyebrow">Upload here</p>
          <label>
            <span>Folder</span>
            <input bind:value={uploadFolder} placeholder="projects/voltalfa" />
          </label>
          <label>
            <span>Name</span>
            <input bind:value={uploadFilename} placeholder="1.png" />
          </label>
          <label class="file-btn">
            <ImagePlus size={15} />
            {uploadFile?.name ?? "Choose image"}
            <input
              type="file"
              accept="image/*"
              onchange={(event) => {
                uploadFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
              }}
            />
          </label>
          <button type="button" class="primary" onclick={upload} disabled={!uploadFile || saving}>
            {#if saving}<span class="spin"><Loader2 size={15} /></span>{/if}
            Upload
          </button>
        </section>
      </aside>
    </div>
  </div>
</div>

<style lang="scss">
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    background-color: rgba($color-text, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .picker {
    width: min(72rem, 100%);
    max-height: 92vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    padding: 0.9rem;
  }

  header,
  .picker-toolbar,
  .breadcrumbs,
  .file-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  header {
    justify-content: space-between;
  }

  h2 {
    font-size: $fs-xl;
    margin: 0;
  }

  .eyebrow,
  label span {
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0;
    text-transform: uppercase;
  }

  .icon-btn,
  .folder-card,
  .media-tile,
  button {
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
  }

  .icon-btn {
    background: $color-accent-1;
    color: $color-white;
    border: 1px solid $color-accent-1;
    border-radius: 4px;
    display: inline-flex;
    padding: 0.35rem;
  }

  .picker-toolbar {
    align-items: stretch;
    flex-direction: column;

    @include respond-to("tablet") {
      flex-direction: row;
    }
  }

  .search-box,
  .upload-card label,
  .file-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: var(--admin-paper);
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    padding: 0.45rem 0.6rem;
    text-transform: uppercase;
  }

  .search-box {
    flex: 1;
  }

  input,
  select {
    border: 0;
    outline: 0;
    background: transparent;
    color: $color-text;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    min-width: 0;
    width: 100%;
    text-transform: none;
  }

  .breadcrumbs {
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    flex-wrap: wrap;
    padding: 0.4rem 0.5rem;

    button {
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: $color-accent-1;
      font-size: $fs-sm;
      font-weight: 800;
      padding: 0.2rem 0.35rem;

      &.active,
      &:hover {
        background-color: rgba($color-accent-1, 0.12);
        color: $color-text;
      }
    }
  }

  .picker-body {
    min-height: 0;
    display: grid;
    gap: 0.75rem;

    @include respond-to("desktop") {
      grid-template-columns: minmax(0, 1fr) 19rem;
    }
  }

  .drive-panel,
  .side-panel {
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
  }

  .drive-panel {
    min-height: 28rem;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .drive-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.65rem;
  }

  .folder-card,
  .media-tile {
    display: grid;
    gap: 0.35rem;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: $color-primary;
    color: $color-text;
    padding: 0.55rem;
    text-align: left;
  }

  .folder-card:hover,
  .media-tile:hover,
  .media-tile.selected {
    outline: 3px solid $color-accent-2;
    outline-offset: 1px;
  }

  .folder-card {
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 4.75rem;

    :global(svg) {
      color: $color-accent-1;
      grid-row: span 2;
    }
  }

  .media-tile img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: contain;
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.5);
    border-radius: 4px;
  }

  .folder-card span,
  .media-tile span,
  .media-tile small,
  .folder-card small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .media-tile small,
  .folder-card small {
    color: $color-accent-1;
    font-size: $fs-xs;
  }

  .side-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .preview,
  .empty-preview {
    width: 100%;
    aspect-ratio: 4 / 3;
    background-color: $color-primary;
    border: 1px solid rgba($color-accent-1, 0.65);
    border-radius: 4px;
  }

  .preview {
    object-fit: contain;
  }

  .empty-preview {
    color: $color-accent-1;
    display: grid;
    place-items: center;
    padding: 1rem;
    text-align: center;
  }

  .path {
    color: $color-accent-1;
    font-size: $fs-sm;
    overflow-wrap: anywhere;
  }

  .primary {
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: $color-accent-1;
    color: $color-white;
    font-size: $fs-sm;
    font-weight: 800;
    padding: 0.55rem 0.8rem;

    &:disabled {
      opacity: 0.55;
    }
  }

  .upload-card {
    border-top: 1px solid rgba($color-accent-1, 0.5);
    display: grid;
    gap: 0.5rem;
    padding-top: 0.75rem;
  }

  .file-btn {
    cursor: pointer;

    input {
      display: none;
    }
  }

  .error {
    background-color: $color-error;
    color: $color-white;
    border-radius: 4px;
    padding: 0.55rem 0.75rem;
    font-size: $fs-sm;
  }

  .muted {
    color: $color-accent-1;
    font-size: $fs-sm;
  }

  .spin {
    display: inline-flex;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
