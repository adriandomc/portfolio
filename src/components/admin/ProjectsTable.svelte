<script lang="ts">
  import {
    ChevronRight,
    FilePlus2,
    GripVertical,
    Loader2,
    Save,
    Search,
    Star,
  } from "@lucide/svelte";
  import type { PostSummary } from "../../lib/admin/posts";

  interface Props {
    posts: PostSummary[];
  }

  let { posts }: Props = $props();

  interface Row {
    slug: string;
    title: string;
    description: string;
    draft: boolean;
    tags: string[];
    cover?: string;
    featured: boolean;
  }

  function toRow(post: PostSummary): Row {
    return {
      slug: post.slug,
      title: post.title,
      description: post.description,
      draft: post.draft,
      tags: post.tags,
      cover: post.cover,
      featured: Boolean(post.featured),
    };
  }

  function initialRows(): Row[] {
    return posts.map(toRow);
  }

  function snapshot(rows: Row[]): string {
    return JSON.stringify(rows.map((row) => [row.slug, row.featured]));
  }

  let rows = $state<Row[]>(initialRows());
  let initial = $state(snapshot(initialRows()));
  let query = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  const dirty = $derived(snapshot(rows) !== initial);
  const featuredCount = $derived(rows.filter((row) => row.featured).length);
  const filtered = $derived(
    query.trim()
      ? rows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => {
            const needle = query.trim().toLowerCase();
            return (
              row.title.toLowerCase().includes(needle) ||
              row.slug.toLowerCase().includes(needle) ||
              row.tags.some((tag) => tag.toLowerCase().includes(needle))
            );
          })
      : rows.map((row, index) => ({ row, index })),
  );

  function toggleFeatured(index: number) {
    const next = [...rows];
    next[index] = { ...next[index], featured: !next[index].featured };
    rows = next;
    saved = false;
  }

  function moveRow(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) {
      return;
    }
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    rows = next;
    saved = false;
  }

  function handleDragStart(event: DragEvent, index: number) {
    if (query.trim()) {
      event.preventDefault();
      return;
    }
    dragIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleDragOver(event: DragEvent, index: number) {
    if (dragIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dragOverIndex = index;
  }

  function handleDragLeave(index: number) {
    if (dragOverIndex === index) dragOverIndex = null;
  }

  function handleDrop(event: DragEvent, index: number) {
    event.preventDefault();
    if (dragIndex === null) return;
    moveRow(dragIndex, index);
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  function resetChanges() {
    rows = initialRows();
    saved = false;
    error = null;
  }

  async function save() {
    if (!dirty || saving) return;
    saving = true;
    error = null;
    saved = false;
    try {
      const updates = rows.map((row, index) => ({
        slug: row.slug,
        order: index + 1,
        featured: row.featured,
      }));
      const res = await fetch("/api/admin/projects/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      initial = snapshot(rows);
      saved = true;
    } catch (err) {
      error = err instanceof Error ? err.message : "Save failed.";
    } finally {
      saving = false;
    }
  }
</script>

<section class="content-crm">
  <header class="crm-header">
    <div>
      <p class="eyebrow">Content library</p>
      <h1>Projects</h1>
    </div>
    <a class="new-btn" href={`/admin/projects/new`}>
      <FilePlus2 size={16} />
      New project
    </a>
  </header>

  <div class="stats-row" aria-label="Projects stats">
    <div><span>{rows.length}</span>Total</div>
    <div><span>{featuredCount}</span>Featured</div>
    <div><span>{rows.length - featuredCount}</span>Not featured</div>
  </div>

  <div class="ordering-bar" class:dirty>
    <p class="hint">
      Drag rows to reorder. Tick <strong>Featured</strong> to show on the home Projects section.
      The numeric order is auto-assigned by position.
    </p>
    <div class="ordering-actions">
      {#if saved && !dirty}
        <span class="saved">Saved.</span>
      {/if}
      {#if error}
        <span class="error-text">{error}</span>
      {/if}
      <button type="button" class="secondary" onclick={resetChanges} disabled={!dirty || saving}>
        Reset
      </button>
      <button type="button" onclick={save} disabled={!dirty || saving}>
        {#if saving}<span class="spin"><Loader2 size={16} /></span>{:else}<Save size={16} />{/if}
        Save order
      </button>
    </div>
  </div>

  <label class="search-field">
    <Search size={16} />
    <input bind:value={query} type="search" placeholder="Search title, slug, tag..." />
  </label>

  {#if query.trim()}
    <p class="muted">Drag is disabled while searching. Clear the search to reorder.</p>
  {/if}

  <ol class="project-rows" aria-label="Projects in display order">
    {#each filtered as { row, index } (row.slug)}
      <li
        class:dragging={dragIndex === index}
        class:dragover={dragOverIndex === index && dragIndex !== index}
        class:featured={row.featured}
        class:draft={row.draft}
        draggable={!query.trim()}
        ondragstart={(event) => handleDragStart(event, index)}
        ondragover={(event) => handleDragOver(event, index)}
        ondragleave={() => handleDragLeave(index)}
        ondrop={(event) => handleDrop(event, index)}
        ondragend={handleDragEnd}
      >
        <span class="grip" aria-hidden="true">
          <GripVertical size={16} />
        </span>
        <span class="position">{index + 1}</span>
        <div class="thumb">
          {#if row.cover}
            <img src={row.cover} alt="" loading="lazy" />
          {:else}
            <span class="thumb-fallback">{row.title.charAt(0) || "?"}</span>
          {/if}
        </div>
        <div class="meta">
          <a class="title-link" href={`/admin/projects/${row.slug}`}>
            <strong>{row.title || "(untitled)"}</strong>
            <span>/projects/{row.slug}</span>
          </a>
          {#if row.tags.length > 0}
            <div class="chips">
              {#each row.tags as tag}<span>{tag}</span>{/each}
            </div>
          {/if}
        </div>
        <label class="feature-toggle">
          <input
            type="checkbox"
            checked={row.featured}
            onchange={() => toggleFeatured(index)}
          />
          <Star size={14} />
          Featured
        </label>
        <span class:draft={row.draft} class="status-dot">
          {row.draft ? "Draft" : "Published"}
        </span>
        <a class="open-link" href={`/admin/projects/${row.slug}`} aria-label={`Edit ${row.title}`}>
          <ChevronRight size={18} />
        </a>
      </li>
    {:else}
      <li class="empty">No projects match these filters.</li>
    {/each}
  </ol>
</section>

<style lang="scss">
  .content-crm {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .crm-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
  }

  .new-btn {
    align-items: center;
    background-color: $color-accent-1;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-white;
    display: inline-flex;
    font-size: $fs-sm;
    font-weight: 800;
    gap: 0.45rem;
    padding: 0.65rem 0.9rem;
    text-decoration: none;

    &:hover {
      background-color: $color-text;
      border-color: $color-text;
    }
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;

    div {
      background-color: $color-primary;
      border: 1px solid $color-accent-1;
      border-radius: 5px;
      color: $color-accent-1;
      font-size: $fs-xs;
      font-weight: 700;
      padding: 0.8rem 1rem;
      text-transform: uppercase;
    }

    span {
      color: $color-text;
      display: block;
      font-size: $fs-2xl;
      line-height: 1;
      margin-bottom: 0.25rem;
    }
  }

  .ordering-bar {
    align-items: center;
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: minmax(0, 1fr);
    padding: 0.75rem 1rem;

    @include respond-to("desktop") {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    &.dirty {
      border-color: $color-accent-2;
      box-shadow: 0 0 0 2px rgba($color-accent-2, 0.35);
    }
  }

  .hint {
    color: $color-accent-1;
    font-size: $fs-sm;
    margin: 0;

    strong {
      color: $color-text;
    }
  }

  .ordering-actions {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .ordering-actions button {
    align-items: center;
    background-color: $color-accent-1;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-white;
    cursor: pointer;
    display: inline-flex;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    font-weight: 800;
    gap: 0.4rem;
    padding: 0.5rem 0.8rem;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    &.secondary {
      background-color: var(--admin-paper);
      color: $color-text;
    }
  }

  .saved {
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
  }

  .error-text {
    color: $color-error;
    font-size: $fs-xs;
    font-weight: 800;
  }

  .search-field {
    align-items: center;
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-accent-1;
    display: flex;
    font-size: $fs-xs;
    font-weight: 800;
    gap: 0.45rem;
    padding: 0.45rem 0.65rem;
    text-transform: uppercase;
  }

  .search-field input {
    background: transparent;
    border: 0;
    color: $color-text;
    font: inherit;
    font-size: $fs-sm;
    outline: none;
    text-transform: none;
    width: 100%;
  }

  .muted {
    color: $color-accent-1;
    font-size: $fs-sm;
    margin: 0;
  }

  .project-rows {
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: var(--admin-paper);
    display: flex;
    flex-direction: column;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .project-rows li {
    align-items: center;
    background-color: var(--admin-paper);
    border-bottom: 1px solid rgba($color-accent-1, 0.25);
    display: grid;
    gap: 0.7rem;
    grid-template-columns: auto auto 3rem minmax(0, 1fr) auto auto auto;
    padding: 0.6rem 0.75rem;
    transition: background-color 0.15s ease, transform 0.15s ease;

    &:last-child {
      border-bottom: 0;
    }

    &.featured {
      background-color: rgba($color-accent-2, 0.18);
    }

    &.draft .title-link strong {
      color: $color-accent-1;
    }

    &[draggable="true"] {
      cursor: grab;
    }

    &.dragging {
      opacity: 0.4;
    }

    &.dragover {
      transform: translateY(2px);
      background-color: rgba($color-accent-1, 0.15);
    }
  }

  .grip {
    color: $color-accent-1;
    display: inline-flex;
  }

  .position {
    color: $color-text;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    font-weight: 800;
    text-align: right;
  }

  .thumb {
    align-items: center;
    background-color: $color-primary;
    border: 1px solid rgba($color-accent-1, 0.6);
    border-radius: 4px;
    display: flex;
    height: 2.6rem;
    justify-content: center;
    overflow: hidden;
    width: 2.6rem;
  }

  .thumb img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .thumb-fallback {
    color: $color-accent-1;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    font-weight: 800;
  }

  .title-link {
    color: $color-text;
    text-decoration: none;
  }

  .title-link strong,
  .title-link span {
    display: block;
  }

  .title-link span {
    color: $color-accent-1;
    font-size: $fs-xs;
    margin-top: 0.1rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.3rem;
  }

  .chips span {
    background-color: $color-accent-2;
    border-radius: 999px;
    color: $color-text;
    font-size: $fs-xs;
    font-weight: 800;
    padding: 0.1rem 0.5rem;
  }

  .feature-toggle {
    align-items: center;
    background: transparent;
    border: 0;
    color: $color-accent-1;
    display: inline-flex;
    font-size: $fs-xs;
    font-weight: 800;
    gap: 0.3rem;
    letter-spacing: 0.04em;
    padding: 0;
    text-transform: uppercase;

    input {
      accent-color: $color-accent-1;
      cursor: pointer;
    }
  }

  .status-dot {
    align-items: center;
    display: inline-flex;
    font-size: $fs-sm;
    font-weight: 800;
    gap: 0.4rem;

    &::before {
      background-color: $color-accent-1;
      border-radius: 50%;
      content: "";
      height: 0.6rem;
      width: 0.6rem;
    }

    &.draft::before {
      background-color: $color-warning;
    }
  }

  .open-link {
    color: $color-text;
    display: inline-flex;
    text-decoration: none;
  }

  .empty {
    color: $color-accent-1;
    font-size: $fs-sm;
    grid-template-columns: 1fr;
    justify-content: center;
    padding: 1.5rem;
    text-align: center;
  }

  .spin {
    animation: spin 0.8s linear infinite;
    display: inline-flex;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
