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
  import type {
    MediaFolder,
    MediaItem,
    MediaReference,
    MediaRoot,
  } from "../../lib/admin/media";

  type SelectedNode =
    | { type: "root"; root: MediaRoot }
    | { type: "folder"; folder: MediaFolder }
    | { type: "file"; item: MediaItem };

  type DialogMode = "upload" | "new-folder" | "rename" | "move" | "delete";

  let items = $state<MediaItem[]>([]);
  let folders = $state<MediaFolder[]>([]);
  let selectedNode = $state<SelectedNode | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let query = $state("");
  let currentRoot = $state<MediaRoot | null>(null);
  let currentFolder = $state("");
  let contextMenu = $state<{ x: number; y: number; target: SelectedNode } | null>(null);
  let activeDialog = $state<DialogMode | null>(null);
  let blockingRefs = $state<MediaReference[] | null>(null);
  let deleteTarget = $state<SelectedNode | null>(null);

  let uploadRoot = $state<MediaRoot>("images");
  let uploadFolder = $state("");
  let uploadFilename = $state("");
  let uploadFile = $state<File | null>(null);

  let newFolderRoot = $state<MediaRoot>("images");
  let newFolderParent = $state("");
  let newFolderName = $state("");

  let renameValue = $state("");
  let moveRoot = $state<MediaRoot>("images");
  let moveFolder = $state("");

  const paper = "#f4f9e1";
  const rootStats = $derived({
    images: items.filter((item) => item.root === "images").length,
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
  const selectedRefs = $derived(selectedNode ? referencesForNode(selectedNode) : []);
  const selectedFileCount = $derived(selectedNode ? fileCountForNode(selectedNode) : 0);
  const moveDestinations = $derived(
    folders.filter((folder) => folder.root === moveRoot && !isBlockedMoveDestination(folder.folder)),
  );

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/admin/media");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      items = data.items ?? [];
      folders = data.folders ?? [];
      reconcileSelection();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load media.";
    } finally {
      loading = false;
    }
  }

  function reconcileSelection() {
    if (!selectedNode) return;
    if (selectedNode.type === "file") {
      const repoPath = selectedNode.item.repoPath;
      const item = items.find((entry) => entry.repoPath === repoPath);
      selectedNode = item ? { type: "file", item } : null;
      return;
    }
    if (selectedNode.type === "folder") {
      const { root, folder } = selectedNode.folder;
      const nextFolder = folders.find(
        (entry) => entry.root === root && entry.folder === folder,
      );
      selectedNode = nextFolder ? { type: "folder", folder: nextFolder } : null;
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
          `${item.path} ${item.folder} ${item.name}`.toLowerCase().includes(needle),
        )
        .sort((a, b) => a.path.localeCompare(b.path));
    }
    if (!currentRoot) return [];
    return items
      .filter((item) => item.root === currentRoot && item.folder === currentFolder)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function selectNode(node: SelectedNode) {
    selectedNode = node;
    blockingRefs = null;
    error = null;
    contextMenu = null;
  }

  function openRoot(root: MediaRoot) {
    currentRoot = root;
    currentFolder = "";
    selectNode({ type: "root", root });
  }

  function openFolder(folder: MediaFolder) {
    currentRoot = folder.root;
    currentFolder = folder.folder;
    selectNode({ type: "folder", folder });
  }

  function openFolderPath(root: MediaRoot, folder: string) {
    currentRoot = root;
    currentFolder = folder;
    const match = folders.find((entry) => entry.root === root && entry.folder === folder);
    selectedNode = match ? { type: "folder", folder: match } : { type: "root", root };
    contextMenu = null;
  }

  function showContext(event: MouseEvent, target: SelectedNode) {
    event.preventDefault();
    selectNode(target);
    contextMenu = { x: event.clientX, y: event.clientY, target };
  }

  function activeRoot(): MediaRoot {
    if (currentRoot) return currentRoot;
    if (selectedNode?.type === "root") return selectedNode.root;
    if (selectedNode?.type === "folder") return selectedNode.folder.root;
    if (selectedNode?.type === "file") return selectedNode.item.root;
    return "images";
  }

  function activeFolderPath(): string {
    if (currentRoot) return currentFolder;
    if (selectedNode?.type === "folder") return selectedNode.folder.folder;
    if (selectedNode?.type === "file") return selectedNode.item.folder;
    return "";
  }

  function joinFolder(parent: string, name: string) {
    return [parent, name].filter(Boolean).join("/");
  }

  function folderName(folderPath: string) {
    return folderPath.split("/").filter(Boolean).at(-1) ?? folderPath;
  }

  function referencesForNode(node: SelectedNode): MediaReference[] {
    if (node.type === "file") return node.item.references;
    const scopedItems =
      node.type === "root"
        ? items.filter((item) => item.root === node.root)
        : items.filter((item) => {
            const prefix = `${node.folder.folder}/`;
            return (
              item.root === node.folder.root &&
              (item.folder === node.folder.folder || item.folder.startsWith(prefix))
            );
          });
    return scopedItems.flatMap((item) => item.references);
  }

  function fileCountForNode(node: SelectedNode) {
    if (node.type === "file") return 1;
    if (node.type === "root") return items.filter((item) => item.root === node.root).length;
    return items.filter((item) => {
      const prefix = `${node.folder.folder}/`;
      return (
        item.root === node.folder.root &&
        (item.folder === node.folder.folder || item.folder.startsWith(prefix))
      );
    }).length;
  }

  function labelForNode(node: SelectedNode) {
    if (node.type === "root") return node.root;
    if (node.type === "folder") return node.folder.name;
    return node.item.name;
  }

  function pathForNode(node: SelectedNode) {
    if (node.type === "root") return `/${node.root}`;
    if (node.type === "folder") return node.folder.path;
    return node.item.path;
  }

  function canMutate(node: SelectedNode | null) {
    return Boolean(node && node.type !== "root");
  }

  function openUploadDialog() {
    uploadRoot = activeRoot();
    uploadFolder = activeFolderPath();
    uploadFilename = "";
    uploadFile = null;
    activeDialog = "upload";
    blockingRefs = null;
    error = null;
  }

  function openNewFolderDialog() {
    newFolderRoot = activeRoot();
    newFolderParent = activeFolderPath();
    newFolderName = "";
    activeDialog = "new-folder";
    blockingRefs = null;
    error = null;
  }

  function openRenameDialog(node = selectedNode) {
    if (!canMutate(node)) return;
    renameValue = node.type === "file" ? node.item.name : node.folder.name;
    activeDialog = "rename";
    blockingRefs = null;
    error = null;
  }

  function openMoveDialog(node = selectedNode) {
    if (!canMutate(node)) return;
    moveRoot = node.type === "file" ? node.item.root : node.folder.root;
    moveFolder = node.type === "file" ? node.item.folder : node.folder.parent;
    activeDialog = "move";
    blockingRefs = null;
    error = null;
  }

  function openDeleteDialog(node = selectedNode) {
    if (!canMutate(node)) return;
    deleteTarget = node;
    activeDialog = "delete";
    blockingRefs = null;
    error = null;
  }

  function closeDialog() {
    activeDialog = null;
    blockingRefs = null;
  }

  function isBlockedMoveDestination(folder: string) {
    if (selectedNode?.type !== "folder") return false;
    return folder === selectedNode.folder.folder || folder.startsWith(`${selectedNode.folder.folder}/`);
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
      const res = await fetch("/api/admin/media", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      closeDialog();
      await load();
      if (data.item) {
        currentRoot = data.item.root;
        currentFolder = data.item.folder;
        selectNode({ type: "file", item: data.item });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Upload failed.";
    } finally {
      saving = false;
    }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    saving = true;
    error = null;
    try {
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "folder",
          root: newFolderRoot,
          folder: joinFolder(newFolderParent, newFolderName.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      closeDialog();
      await load();
      if (data.folder) {
        currentRoot = data.folder.root;
        currentFolder = data.folder.parent;
        selectNode({ type: "folder", folder: data.folder });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Create folder failed.";
    } finally {
      saving = false;
    }
  }

  async function renameSelected() {
    if (!selectedNode || !canMutate(selectedNode) || !renameValue.trim()) return;
    saving = true;
    error = null;
    try {
      const payload =
        selectedNode.type === "folder"
          ? {
              kind: "folder",
              root: selectedNode.folder.root,
              folder: selectedNode.folder.folder,
              nextRoot: selectedNode.folder.root,
              nextFolder: joinFolder(selectedNode.folder.parent, renameValue.trim()),
            }
          : {
              repoPath: selectedNode.item.repoPath,
              root: selectedNode.item.root,
              folder: selectedNode.item.folder,
              filename: renameValue.trim(),
            };
      const res = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      closeDialog();
      await load();
      if (data.item) {
        currentRoot = data.item.root;
        currentFolder = data.item.folder;
        selectNode({ type: "file", item: data.item });
      } else if (data.folder) {
        currentRoot = data.folder.root;
        currentFolder = data.folder.parent;
        selectNode({ type: "folder", folder: data.folder });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Rename failed.";
    } finally {
      saving = false;
    }
  }

  async function moveSelected() {
    if (!selectedNode || !canMutate(selectedNode)) return;
    saving = true;
    error = null;
    try {
      const payload =
        selectedNode.type === "folder"
          ? {
              kind: "folder",
              root: selectedNode.folder.root,
              folder: selectedNode.folder.folder,
              nextRoot: moveRoot,
              nextFolder: joinFolder(moveFolder, selectedNode.folder.name),
            }
          : {
              repoPath: selectedNode.item.repoPath,
              root: moveRoot,
              folder: moveFolder,
              filename: selectedNode.item.name,
            };
      const res = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      closeDialog();
      await load();
      if (data.item) {
        currentRoot = data.item.root;
        currentFolder = data.item.folder;
        selectNode({ type: "file", item: data.item });
      } else if (data.folder) {
        currentRoot = data.folder.root;
        currentFolder = data.folder.parent;
        selectNode({ type: "folder", folder: data.folder });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Move failed.";
    } finally {
      saving = false;
    }
  }

  async function deleteSelected() {
    if (!deleteTarget) return;
    saving = true;
    error = null;
    try {
      const res = await fetch("/api/admin/media", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          deleteTarget.type === "folder"
            ? { kind: "folder", root: deleteTarget.folder.root, folder: deleteTarget.folder.folder }
            : { repoPath: deleteTarget.item.repoPath },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data.references)) {
          blockingRefs = data.references;
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const previous = deleteTarget;
      closeDialog();
      selectedNode = null;
      deleteTarget = null;
      if (
        previous.type === "folder" &&
        currentRoot === previous.folder.root &&
        (currentFolder === previous.folder.folder ||
          currentFolder.startsWith(`${previous.folder.folder}/`))
      ) {
        currentFolder = previous.folder.parent;
      }
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

<svelte:window
  onclick={() => (contextMenu = null)}
  onkeydown={(event) => {
    if (event.key === "Escape") {
      contextMenu = null;
      if (activeDialog) closeDialog();
    }
  }}
/>

<section class="media-page" style={`--admin-paper: ${paper};`}>
  <header class="media-header">
    <div>
      <p class="eyebrow">Media library</p>
      <h1>Repository Drive</h1>
    </div>
    <div class="header-actions">
      <label class="search-box">
        <Search size={16} />
        <input bind:value={query} type="search" placeholder="Search Drive..." />
      </label>
      <button type="button" class="secondary" onclick={openNewFolderDialog}>
        <Folder size={16} />
        New folder
      </button>
      <button type="button" onclick={openUploadDialog}>
        <ImagePlus size={16} />
        Upload
      </button>
    </div>
  </header>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <div class="drive-bar">
    <button
      type="button"
      class:active={!currentRoot}
      onclick={() => {
        currentRoot = null;
        currentFolder = "";
        selectedNode = null;
      }}
    >
      My Drive
    </button>
    {#each breadcrumbs as crumb, index}
      <ChevronRight size={15} />
      <button
        type="button"
        class:active={index === breadcrumbs.length - 1}
        onclick={() => openFolderPath(crumb.root, crumb.folder)}
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
              class:selected={selectedNode?.type === "root" && selectedNode.root === "images"}
              class="folder-card root-card"
              oncontextmenu={(event) => showContext(event, { type: "root", root: "images" })}
              onclick={() => selectNode({ type: "root", root: "images" })}
              ondblclick={() => openRoot("images")}
              onkeydown={(event) => event.key === "Enter" && openRoot("images")}
            >
              <FolderOpen size={30} />
              <span>images</span>
              <small>{rootStats.images} files</small>
              <MoreVertical size={16} />
            </button>
          {/if}

          {#each visibleFolders as entry (`${entry.root}/${entry.folder}`)}
            <button
              type="button"
              class:selected={selectedNode?.type === "folder" && selectedNode.folder.root === entry.root && selectedNode.folder.folder === entry.folder}
              class="folder-card"
              oncontextmenu={(event) => showContext(event, { type: "folder", folder: entry })}
              onclick={() => selectNode({ type: "folder", folder: entry })}
              ondblclick={() => openFolder(entry)}
              onkeydown={(event) => event.key === "Enter" && openFolder(entry)}
            >
              <Folder size={30} />
              <span>{entry.name}</span>
              <small>{entry.itemCount} files</small>
              <MoreVertical size={16} />
            </button>
          {/each}

          {#each visibleFiles as item (item.repoPath)}
            <button
              type="button"
              class:selected={selectedNode?.type === "file" && selectedNode.item.repoPath === item.repoPath}
              class="media-tile"
              oncontextmenu={(event) => showContext(event, { type: "file", item })}
              onclick={() => selectNode({ type: "file", item })}
            >
              <img src={item.path} alt="" loading="lazy" />
              <span>{item.name}</span>
              <small>{item.references.length} refs · {Math.round(item.size / 1024)}KB</small>
            </button>
          {/each}

          {#if visibleFolders.length === 0 && visibleFiles.length === 0 && (currentRoot || query.trim())}
            <p class="muted">No images found here.</p>
          {/if}
        </div>
      {/if}
    </div>

    <aside class="inspector">
      {#if selectedNode}
        <div class="inspector-heading">
          {#if selectedNode.type === "file"}
            <img class="preview" src={selectedNode.item.path} alt="" />
          {:else if selectedNode.type === "folder"}
            <div class="folder-preview"><FolderOpen size={42} /></div>
          {:else}
            <div class="folder-preview"><FolderOpen size={42} /></div>
          {/if}
          <div>
            <p class="eyebrow">{selectedNode.type}</p>
            <h2>{labelForNode(selectedNode)}</h2>
            <p class="path">{pathForNode(selectedNode)}</p>
          </div>
        </div>

        <div class="meta-grid">
          <span>Files</span>
          <strong>{selectedFileCount}</strong>
          <span>References</span>
          <strong>{selectedRefs.length}</strong>
        </div>

        <div class="inspector-actions">
          <button type="button" onclick={() => openRenameDialog()} disabled={!canMutate(selectedNode) || saving}>
            <Pencil size={16} />
            Rename
          </button>
          <button type="button" onclick={() => openMoveDialog()} disabled={!canMutate(selectedNode) || saving}>
            <FolderInput size={16} />
            Move
          </button>
          <button
            type="button"
            class="danger"
            onclick={() => openDeleteDialog()}
            disabled={!canMutate(selectedNode) || saving}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>

        <div class="refs">
          <strong>References</strong>
          {#if selectedRefs.length > 0}
            {#each selectedRefs as ref}
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
        <p class="muted">Select a file or folder to keep details and actions available while you browse.</p>
      {/if}
    </aside>
  </div>

  {#if contextMenu}
    {@const target = contextMenu.target}
    <div
      class="context-menu"
      style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
      role="menu"
      onclick={(event) => event.stopPropagation()}
    >
      {#if target.type === "root"}
        <button type="button" onclick={() => openRoot(target.root)}>Open</button>
      {:else if target.type === "folder"}
        <button type="button" onclick={() => openFolder(target.folder)}>Open</button>
        <button type="button" onclick={() => openRenameDialog(target)}>Rename</button>
        <button type="button" onclick={() => openMoveDialog(target)}>Move</button>
        <button type="button" class="danger" onclick={() => openDeleteDialog(target)}>Delete</button>
      {:else}
        <button type="button" onclick={() => selectNode(target)}>Preview</button>
        <button type="button" onclick={() => openRenameDialog(target)}>Rename</button>
        <button type="button" onclick={() => openMoveDialog(target)}>Move</button>
        <button type="button" class="danger" onclick={() => openDeleteDialog(target)}>Delete</button>
      {/if}
    </div>
  {/if}

  {#if activeDialog === "upload"}
    <div class="dialog-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeDialog()}>
      <section class="media-dialog" role="dialog" aria-modal="true" aria-label="Upload image">
        <header>
          <h2>Upload image</h2>
          <button type="button" aria-label="Close" onclick={closeDialog}><X size={16} /></button>
        </header>
        <div class="field-grid">
          <label>
            <span>Root</span>
            <select bind:value={uploadRoot}>
              <option value="images">/images</option>
            </select>
          </label>
          <label>
            <span>Folder</span>
            <input bind:value={uploadFolder} placeholder="projects/voltalfa" />
          </label>
          <label>
            <span>Filename</span>
            <input bind:value={uploadFilename} placeholder="1.png" />
          </label>
          <label class="file-input">
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
        </div>
        <div class="dialog-actions">
          <button type="button" class="secondary" onclick={closeDialog}>Cancel</button>
          <button type="button" onclick={upload} disabled={!uploadFile || saving}>
            {#if saving}<Loader2 class="spin" size={16} />{/if}
            Upload
          </button>
        </div>
      </section>
    </div>
  {/if}

  {#if activeDialog === "new-folder"}
    <div class="dialog-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeDialog()}>
      <section class="media-dialog" role="dialog" aria-modal="true" aria-label="New folder">
        <header>
          <h2>New folder</h2>
          <button type="button" aria-label="Close" onclick={closeDialog}><X size={16} /></button>
        </header>
        <div class="field-grid">
          <label>
            <span>Root</span>
            <select bind:value={newFolderRoot}>
              <option value="images">/images</option>
            </select>
          </label>
          <label>
            <span>Parent</span>
            <input bind:value={newFolderParent} placeholder="projects" />
          </label>
          <label>
            <span>Name</span>
            <input bind:value={newFolderName} autofocus placeholder="voltalfa" />
          </label>
        </div>
        <div class="dialog-actions">
          <button type="button" class="secondary" onclick={closeDialog}>Cancel</button>
          <button type="button" onclick={createFolder} disabled={!newFolderName.trim() || saving}>
            {#if saving}<Loader2 class="spin" size={16} />{/if}
            Create
          </button>
        </div>
      </section>
    </div>
  {/if}

  {#if activeDialog === "rename" && selectedNode}
    <div class="dialog-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeDialog()}>
      <section class="media-dialog" role="dialog" aria-modal="true" aria-label="Rename media">
        <header>
          <h2>Rename {selectedNode.type}</h2>
          <button type="button" aria-label="Close" onclick={closeDialog}><X size={16} /></button>
        </header>
        <label>
          <span>Name</span>
          <input bind:value={renameValue} autofocus />
        </label>
        <div class="dialog-actions">
          <button type="button" class="secondary" onclick={closeDialog}>Cancel</button>
          <button type="button" onclick={renameSelected} disabled={!renameValue.trim() || saving}>
            {#if saving}<Loader2 class="spin" size={16} />{/if}
            Rename
          </button>
        </div>
      </section>
    </div>
  {/if}

  {#if activeDialog === "move" && selectedNode}
    <div class="dialog-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeDialog()}>
      <section class="media-dialog wide" role="dialog" aria-modal="true" aria-label="Move media">
        <header>
          <h2>Move {labelForNode(selectedNode)}</h2>
          <button type="button" aria-label="Close" onclick={closeDialog}><X size={16} /></button>
        </header>
        <div class="field-grid">
          <label>
            <span>Root</span>
            <select bind:value={moveRoot}>
              <option value="images">/images</option>
            </select>
          </label>
          <label>
            <span>Destination</span>
            <input bind:value={moveFolder} placeholder="projects" />
          </label>
        </div>
        <div class="destination-list">
          <button type="button" class:active={moveFolder === ""} onclick={() => (moveFolder = "")}>
            <FolderOpen size={16} />
            /{moveRoot}
          </button>
          {#each moveDestinations as folder (`move-${folder.root}/${folder.folder}`)}
            <button
              type="button"
              class:active={moveFolder === folder.folder}
              onclick={() => (moveFolder = folder.folder)}
            >
              <Folder size={16} />
              /{folder.root}/{folder.folder}
            </button>
          {/each}
        </div>
        <div class="dialog-actions">
          <button type="button" class="secondary" onclick={closeDialog}>Cancel</button>
          <button type="button" onclick={moveSelected} disabled={saving}>
            {#if saving}<Loader2 class="spin" size={16} />{/if}
            Move
          </button>
        </div>
      </section>
    </div>
  {/if}

  {#if activeDialog === "delete" && deleteTarget}
    <div class="dialog-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeDialog()}>
      <section class="media-dialog" role="dialog" aria-modal="true" aria-label="Delete media">
        <header>
          <h2>Delete {labelForNode(deleteTarget)}</h2>
          <button type="button" aria-label="Close" onclick={closeDialog}><X size={16} /></button>
        </header>
        <p class="dialog-copy">
          This will delete {pathForNode(deleteTarget)} from the repository. Referenced media is blocked.
        </p>
        {#if blockingRefs}
          <div class="refs warning">
            <strong>Referenced media</strong>
            <p>This item cannot be deleted while it is used.</p>
            {#each blockingRefs as ref}
              <a href={`/admin/${ref.collection}/${ref.slug}`}>
                <Pencil size={14} />
                {ref.collection}/{ref.slug} · {ref.field} · {ref.count}
              </a>
            {/each}
          </div>
        {/if}
        <div class="dialog-actions">
          <button type="button" class="secondary" onclick={closeDialog}>Cancel</button>
          <button type="button" class="danger" onclick={deleteSelected} disabled={saving || Boolean(blockingRefs)}>
            {#if saving}<Loader2 class="spin" size={16} />{/if}
            Delete
          </button>
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

    @include respond-to("desktop") {
      grid-template-columns: 1fr minmax(35rem, auto);
      align-items: end;
    }
  }

  .header-actions {
    display: grid;
    gap: 0.6rem;

    @include respond-to("tablet") {
      grid-template-columns: minmax(14rem, 1fr) auto auto;
      align-items: center;
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
  .media-dialog label,
  .file-input {
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

    &.secondary {
      background-color: var(--admin-paper);
      color: $color-text;
    }

    &.danger {
      background-color: $color-error;
      border-color: $color-error;
    }
  }

  .drive-bar {
    background-color: var(--admin-paper);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.45rem;
    padding: 0.55rem 0.65rem;

    button {
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: $color-accent-1;
      font-size: $fs-sm;
      padding: 0.25rem 0.35rem;

      &.active,
      &:hover {
        background-color: rgba($color-accent-1, 0.12);
        color: $color-text;
      }
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
    min-height: 30rem;
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
    gap: 0.35rem 0.55rem;
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    color: $color-text;
    padding: 0.65rem;
    text-align: left;

    &.selected {
      outline: 3px solid $color-accent-2;
      outline-offset: 2px;
    }
  }

  .folder-card {
    grid-template-columns: auto minmax(0, 1fr) auto;
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

  .inspector-heading {
    display: grid;
    gap: 0.65rem;
  }

  .preview,
  .folder-preview {
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 4px;
    width: 100%;
  }

  .preview {
    max-height: 16rem;
    object-fit: contain;
  }

  .folder-preview {
    min-height: 8rem;
    display: grid;
    place-items: center;
    color: $color-accent-1;
  }

  .path {
    color: $color-accent-1;
    font-size: $fs-sm;
    overflow-wrap: anywhere;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.45rem;
    background-color: rgba(244, 249, 225, 0.7);
    border: 1px solid rgba($color-accent-1, 0.55);
    border-radius: 5px;
    padding: 0.75rem;
    font-size: $fs-sm;

    span {
      color: $color-accent-1;
    }
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

  .media-dialog {
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    width: min(30rem, 100%);

    &.wide {
      width: min(42rem, 100%);
    }

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

  .field-grid {
    display: grid;
    gap: 0.6rem;
  }

  .file-input {
    cursor: pointer;

    input {
      display: none;
    }
  }

  .destination-list {
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.6);
    border-radius: 5px;
    display: grid;
    gap: 0.35rem;
    max-height: 16rem;
    overflow-y: auto;
    padding: 0.45rem;

    button {
      background: transparent;
      border: 0;
      color: $color-text;
      justify-content: flex-start;

      &.active,
      &:hover {
        background-color: rgba($color-accent-1, 0.14);
      }
    }
  }

  .dialog-copy {
    margin: 0;
    color: $color-accent-1;
    font-size: $fs-sm;
    overflow-wrap: anywhere;
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
