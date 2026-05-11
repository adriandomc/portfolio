<script lang="ts">
  import { ImagePlus, Search, X } from "@lucide/svelte";
  import type { MediaItem, MediaRoot } from "../../lib/admin/media";

  interface Props {
    title?: string;
    defaultRoot?: MediaRoot;
    defaultFolder?: string;
    onSelect: (path: string) => void;
    onClose: () => void;
  }

  let {
    title = "Choose image",
    defaultRoot = "images",
    defaultFolder = "",
    onSelect,
    onClose,
  }: Props = $props();

  let items = $state<MediaItem[]>([]);
  let query = $state("");
  let root = $state<MediaRoot>(defaultRoot);
  let folder = $state(defaultFolder);
  let filename = $state("");
  let uploadFile = $state<File | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const filtered = $derived(
    items.filter((item) =>
      `${item.path} ${item.name}`.toLowerCase().includes(query.toLowerCase()),
    ),
  );

  async function load() {
    loading = true;
    try {
      const res = await fetch("/api/admin/media");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      items = data.items;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load media.";
    } finally {
      loading = false;
    }
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
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.item?.path) onSelect(data.item.path);
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
>
  <section class="picker" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <h2>{title}</h2>
      <button type="button" class="icon-btn" onclick={onClose} aria-label="Close">
        <X size={18} />
      </button>
    </header>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <label class="search-box">
      <Search size={16} />
      <input bind:value={query} type="search" placeholder="Search media..." />
    </label>

    <div class="upload-row">
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
        <span>Name</span>
        <input bind:value={filename} placeholder="1.png" />
      </label>
      <label class="file-btn">
        <ImagePlus size={15} />
        {uploadFile?.name ?? "File"}
        <input
          type="file"
          accept="image/*"
          onchange={(event) => {
            uploadFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
          }}
        />
      </label>
      <button type="button" onclick={upload} disabled={!uploadFile || saving}>Upload</button>
    </div>

    <div class="grid">
      {#if loading}
        <p class="muted">Loading media...</p>
      {:else}
        {#each filtered as item (item.repoPath)}
          <button type="button" class="tile" onclick={() => onSelect(item.path)}>
            <img src={item.path} alt="" loading="lazy" />
            <span>{item.path}</span>
          </button>
        {:else}
          <p class="muted">No images found.</p>
        {/each}
      {/if}
    </div>
  </section>
</div>

<style lang="scss">
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background-color: rgba($color-text, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .picker {
    width: min(64rem, 100%);
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    padding: 0.9rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    font-size: $fs-xl;
  }

  .icon-btn,
  .tile,
  .upload-row button {
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

  .search-box,
  .upload-row label {
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

  .upload-row {
    display: grid;
    gap: 0.5rem;

    @include respond-to("tablet") {
      grid-template-columns: 7rem 1fr 10rem 11rem auto;
    }

    button {
      border: 1px solid $color-accent-1;
      border-radius: 5px;
      background-color: $color-accent-1;
      color: $color-white;
      font-size: $fs-sm;
      font-weight: 800;
      padding: 0.5rem 0.8rem;

      &:disabled {
        opacity: 0.55;
      }
    }
  }

  .file-btn {
    cursor: pointer;

    input {
      display: none;
    }
  }

  .grid {
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.65rem;
    min-height: 16rem;
    padding-right: 0.2rem;
  }

  .tile {
    display: grid;
    gap: 0.35rem;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: $color-primary;
    color: $color-text;
    padding: 0.45rem;
    text-align: left;

    &:hover {
      outline: 2px solid $color-accent-2;
      outline-offset: 1px;
    }

    img {
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: contain;
      background-color: var(--admin-paper);
      border: 1px solid rgba($color-accent-1, 0.5);
      border-radius: 4px;
    }

    span {
      color: $color-accent-1;
      font-size: $fs-xs;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
</style>
