<script lang="ts">
  import {
    ChevronRight,
    FileImage,
    Folder,
    FolderInput,
    FolderOpen,
    ImagePlus,
    Loader2,
    MoreVertical,
    Pencil,
    Search,
    Trash2,
    X,
  } from "@lucide/svelte";
  import type { MediaItem, MediaReference, MediaRoot } from "../../lib/admin/media";

  type ContextTarget =
    | { type: "root"; root: MediaRoot }
    | { type: "folder"; root: MediaRoot; folder: string }
    | { type: "file"; item: MediaItem };

  type RenameTarget =
    | { type: "folder"; root: MediaRoot; folder: string; parent: string; name: string }
    | { type: "file"; item: MediaItem; name: string };

  let items = $state<MediaItem[]>([]);
  let selected = $state<MediaItem | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let query = $state("");
  let currentRoot = $state<MediaRoot | null>(null);
  let currentFolder = $state("");
  let root = $state<MediaRoot>("images");
  let folder = $state("");
  let filename = $state("");
  let uploadFile = $state<File | null>(null);
  let editRoot = $state<MediaRoot>("images");
  let editFolder = $state("");
  let editFilename = $state("");
  let deleteRefs = $state<MediaReference[] | null>(null);
  let contextMenu = $state<{ x: number; y: number; target: ContextTarget } | null>(null);
  let renameTarget = $state<RenameTarget | null>(null);
  let renameValue = $state("");

  const paper = "#f4f9e1";
  const rootStats = $derived({
    images: items.filter((item) => item.root === "images").length,
    assets: items.filter((item) => item.root === "assets").length,
  });
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

  function getVisibleFolders() {
    if (!currentRoot || query.trim()) return [];
    const prefix = currentFolder ? `${currentFolder}/` : "";
    const map = new Map<string, { root: MediaRoot; folder: string; name: string; count: number }>();
    for (const item of items) {
      if (item.root !== currentRoot || !item.folder.startsWith(prefix)) continue;
      const rest = item.folder.slice(prefix.length);
      if (!rest) continue;
      const name = rest.split("/")[0];
      const folderPath = [currentFolder, name].filter(Boolean).join("/");
      const existing = map.get(folderPath);
      if (existing) existing.count += 1;
      else map.set(folderPath, { root: currentRoot, folder: folderPath, name, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function getVisibleFiles() {
    const needle = query.trim().toLowerCase();
    if (needle) {
      return items
        .filter((item) =>
          `${item.path} ${item.folder} ${item.name}`.toLowerCase().includes(needle),
        )
        .sort((a, b) => a.path.localeCompare(b.path));
    }
    if (!currentRoot) return [];
    return items
      .filter((item) => item.root === currentRoot && item.folder === currentFolder)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function openRoot(nextRoot: MediaRoot) {
    currentRoot = nextRoot;
    currentFolder = "";
    root = nextRoot;
    folder = "";
    contextMenu = null;
  }

  function openFolder(nextFolder: string) {
    if (!currentRoot) return;
    currentFolder = nextFolder;
    root = currentRoot;
    folder = nextFolder;
    contextMenu = null;
  }

  function selectItem(item: MediaItem) {
    selected = item;
    editRoot = item.root;
    editFolder = item.folder;
    editFilename = item.name;
    deleteRefs = null;
    error = null;
    contextMenu = null;
  }

  function showContext(event: MouseEvent, target: ContextTarget) {
    event.preventDefault();
    contextMenu = { x: event.clientX, y: event.clientY, target };
  }

  function startRename(target: RenameTarget) {
    renameTarget = target;
    renameValue = target.name;
    contextMenu = null;
  }

  function folderParent(folderPath: string) {
    return folderPath.split("/").slice(0, -1).join("/");
  }

  function folderName(folderPath: string) {
    return folderPath.split("/").filter(Boolean).at(-1) ?? "";
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
      if (data.item) {
        openRoot(data.item.root);
        openFolder(data.item.folder);
        selectItem(data.item);
      }
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
      if (data.item) {
        openRoot(data.item.root);
        openFolder(data.item.folder);
        selectItem(data.item);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Move failed.";
    } finally {
      saving = false;
    }
  }

  async function renameFromDialog() {
    if (!renameTarget || !renameValue.trim()) return;
    saving = true;
    error = null;
    try {
      const payload =
        renameTarget.type === "folder"
          ? {
              kind: "folder",
              root: renameTarget.root,
              folder: renameTarget.folder,
              nextRoot: renameTarget.root,
              nextFolder: [renameTarget.parent, renameValue.trim()].filter(Boolean).join("/"),
            }
          : {
              repoPath: renameTarget.item.repoPath,
              root: renameTarget.item.root,
              folder: renameTarget.item.folder,
              filename: renameValue.trim(),
            };
      const res = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const previous = renameTarget;
      renameTarget = null;
      await load();
      if (previous.type === "folder") {
        openRoot(previous.root);
        openFolder([previous.parent, renameValue.trim()].filter(Boolean).join("/"));
      } else if (data.item) {
        selectItem(data.item);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Rename failed.";
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

  async function deleteFolder(target: { root: MediaRoot; folder: string }, force = false) {
    saving = true;
    error = null;
    try {
      const res = await fetch("/api/admin/media", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "folder", root: target.root, folder: target.folder, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data.references)) {
          deleteRefs = data.references;
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      contextMenu = null;
      if (currentFolder === target.folder || currentFolder.startsWith(`${target.folder}/`)) {
        currentFolder = folderParent(target.folder);
      }
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : "Delete folder failed.";
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    load();
  });
</script>

<svelte:window onclick={() => (contextMenu = null)} onkeydown={(event) => event.key === "Escape" && (contextMenu = null)} />

<section class="media-page" style={`--admin-paper: ${paper};`}>
  <header class="media-header">
    <div>
      <p class="eyebrow">Media library</p>
      <h1>Repository images</h1>
    </div>
    <label class="search-box">
      <Search size={16} />
      <input bind:value={query} type="search" placeholder="Search Drive..." />
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

  <div class="drive-bar">
    <button type="button" class:active={!currentRoot} onclick={() => { currentRoot = null; currentFolder = ""; }}>
      My Drive
    </button>
    {#each breadcrumbs as crumb, index}
      <ChevronRight size={15} />
      <button
        type="button"
        class:active={index === breadcrumbs.length - 1}
        onclick={() => {
          currentRoot = crumb.root;
          currentFolder = crumb.folder;
          root = crumb.root;
          folder = crumb.folder;
        }}
      >
        {crumb.label}
      </button>
    {/each}
  </div>

  <div class="media-workspace">
    <div class="grid-shell">
      {#if loading}
        <p class="muted">Loading media...</p>
      {:else}
        <div class="drive-grid">
          {#if !currentRoot && !query.trim()}
            <button
              type="button"
              class="folder-card root-card"
              oncontextmenu={(event) => showContext(event, { type: "root", root: "assets" })}
              onclick={() => openRoot("assets")}
            >
              <FolderOpen size={30} />
              <span>assets</span>
              <small>{rootStats.assets} files</small>
              <MoreVertical size={16} />
            </button>
            <button
              type="button"
              class="folder-card root-card"
              oncontextmenu={(event) => showContext(event, { type: "root", root: "images" })}
              onclick={() => openRoot("images")}
            >
              <FolderOpen size={30} />
              <span>images</span>
              <small>{rootStats.images} files</small>
              <MoreVertical size={16} />
            </button>
          {/if}

          {#each visibleFolders as entry (entry.folder)}
            <button
              type="button"
              class="folder-card"
              oncontextmenu={(event) => showContext(event, { type: "folder", root: entry.root, folder: entry.folder })}
              onclick={() => openFolder(entry.folder)}
            >
              <Folder size={30} />
              <span>{entry.name}</span>
              <small>{entry.count} files</small>
              <MoreVertical size={16} />
            </button>
          {/each}

          {#each visibleFiles as item (item.repoPath)}
            <button
              type="button"
              class:selected={selected?.repoPath === item.repoPath}
              class="media-tile"
              oncontextmenu={(event) => showContext(event, { type: "file", item })}
              onclick={() => selectItem(item)}
            >
              <img src={item.path} alt="" loading="lazy" />
              <span>{item.name}</span>
              <small>{item.references.length} refs · {Math.round(item.size / 1024)}KB</small>
            </button>
          {:else}
            {#if currentRoot || query.trim()}
              <p class="muted">No images found here.</p>
            {/if}
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
            <strong>Referenced media</strong>
            <p>This action is blocked because the media is still used.</p>
            <button type="button" class="danger" onclick={() => deleteSelected(true)} disabled={saving}>
              Force delete selected file
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
        <p class="muted">Select an image to keep its preview available while you browse.</p>
      {/if}
    </aside>
  </div>

  {#if contextMenu}
    <div
      class="context-menu"
      style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
      role="menu"
    >
      {#if contextMenu.target.type === "root"}
        <button type="button" onclick={() => openRoot(contextMenu!.target.root)}>Open</button>
      {:else if contextMenu.target.type === "folder"}
        <button type="button" onclick={() => openFolder((contextMenu!.target as { type: "folder"; folder: string }).folder)}>Open</button>
        <button
          type="button"
          onclick={() => {
            const target = contextMenu!.target as { type: "folder"; root: MediaRoot; folder: string };
            startRename({
              type: "folder",
              root: target.root,
              folder: target.folder,
              parent: folderParent(target.folder),
              name: folderName(target.folder),
            });
          }}
        >Rename folder</button>
        <button
          type="button"
          class="danger"
          onclick={() => {
            const target = contextMenu!.target as { type: "folder"; root: MediaRoot; folder: string };
            deleteFolder(target);
          }}
        >Delete folder</button>
      {:else}
        <button type="button" onclick={() => selectItem((contextMenu!.target as { type: "file"; item: MediaItem }).item)}>Preview</button>
        <button
          type="button"
          onclick={() => {
            const item = (contextMenu!.target as { type: "file"; item: MediaItem }).item;
            startRename({ type: "file", item, name: item.name });
          }}
        >Rename file</button>
        <button
          type="button"
          class="danger"
          onclick={() => {
            selectItem((contextMenu!.target as { type: "file"; item: MediaItem }).item);
            deleteSelected(false);
          }}
        >Delete file</button>
      {/if}
    </div>
  {/if}

  {#if renameTarget}
    <div class="dialog-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && (renameTarget = null)}>
      <section class="rename-dialog" role="dialog" aria-modal="true" aria-label="Rename media">
        <header>
          <h2>Rename {renameTarget.type}</h2>
          <button type="button" aria-label="Close" onclick={() => (renameTarget = null)}>
            <X size={16} />
          </button>
        </header>
        <label>
          <span>Name</span>
          <input bind:value={renameValue} autofocus />
        </label>
        <div class="dialog-actions">
          <button type="button" onclick={() => (renameTarget = null)}>Cancel</button>
          <button type="button" onclick={renameFromDialog} disabled={saving}>Rename</button>
        </div>
      </section>
    </div>
  {/if}
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
  .grid-shell,
  .drive-bar {
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
  .file-input,
  .rename-dialog label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background-color: var(--admin-paper);
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

  .upload-title,
  .drive-bar {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .drive-bar {
    background-color: var(--admin-paper);
    flex-wrap: wrap;
    padding: 0.55rem 0.65rem;

    button {
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: $color-accent-1;
      cursor: pointer;
      font: inherit;
      font-size: $fs-sm;
      font-weight: 800;
      padding: 0.25rem 0.35rem;

      &.active,
      &:hover {
        background-color: rgba($color-accent-1, 0.12);
        color: $color-text;
      }
    }
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
    background-color: var(--admin-paper);
    min-height: 28rem;
    padding: 0.75rem;
  }

  .drive-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.75rem;
  }

  .folder-card,
  .media-tile {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.35rem 0.55rem;
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    color: $color-text;
    padding: 0.65rem;
    text-align: left;
  }

  .folder-card {
    min-height: 5.4rem;

    svg:first-child {
      grid-row: span 2;
      color: $color-accent-1;
    }
  }

  .folder-card span,
  .media-tile span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-card small,
  .media-tile small {
    color: $color-accent-1;
    grid-column: 2 / 3;
  }

  .media-tile {
    grid-template-columns: 1fr;

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
  }

  .inspector {
    background-color: $color-primary;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    @include respond-to("desktop") {
      position: sticky;
      top: 5.25rem;
      max-height: calc(100vh - 6rem);
      overflow-y: auto;
    }
  }

  .preview {
    background-color: var(--admin-paper);
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
    background-color: rgba(244, 249, 225, 0.7);
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

  .context-menu {
    position: fixed;
    z-index: 90;
    min-width: 12rem;
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    box-shadow: 0 12px 24px rgba($color-text, 0.16);
    display: grid;
    padding: 0.35rem;

    button {
      background: transparent;
      border: 0;
      color: $color-text;
      justify-content: flex-start;
      padding: 0.5rem 0.6rem;

      &:hover {
        background-color: rgba($color-accent-1, 0.14);
      }

      &.danger {
        color: $color-error;
      }
    }
  }

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background-color: rgba($color-text, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .rename-dialog {
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    width: min(28rem, 100%);

    header,
    .dialog-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    h2 {
      font-size: $fs-xl;
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
