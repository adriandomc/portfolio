<script lang="ts">
  import {
    ChevronRight,
    FilePlus2,
    Search,
    SlidersHorizontal,
  } from "@lucide/svelte";
  import type { Collection, PostSummary } from "../../lib/admin/posts";

  interface Props {
    collection: Collection;
    label: string;
    posts: PostSummary[];
  }

  let { collection, label, posts }: Props = $props();

  let query = $state("");
  let status = $state<"all" | "published" | "draft">("all");
  let activeTag = $state("all");

  const tags = $derived(
    [...new Set(posts.flatMap((post) => post.tags))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  const filtered = $derived(
    posts.filter((post) => {
      const haystack = [
        post.title,
        post.description,
        post.slug,
        post.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = haystack.includes(query.trim().toLowerCase());
      const matchesStatus =
        status === "all" ||
        (status === "draft" ? post.draft : !post.draft);
      const matchesTag = activeTag === "all" || post.tags.includes(activeTag);
      return matchesQuery && matchesStatus && matchesTag;
    }),
  );

  const drafts = $derived(posts.filter((post) => post.draft).length);
  const published = $derived(posts.length - drafts);
</script>

<section class="content-crm">
  <header class="crm-header">
    <div>
      <p class="eyebrow">Content library</p>
      <h1>{label}</h1>
    </div>
    <a class="new-btn" href={`/admin/${collection}/new`}>
      <FilePlus2 size={16} />
      New {collection === "blog" ? "post" : "project"}
    </a>
  </header>

  <div class="stats-row" aria-label={`${label} stats`}>
    <div><span>{posts.length}</span>Total</div>
    <div><span>{published}</span>Published</div>
    <div><span>{drafts}</span>Drafts</div>
    <div><span>{tags.length}</span>Tags</div>
  </div>

  <div class="filters">
    <label class="search-field">
      <Search size={16} />
      <input bind:value={query} type="search" placeholder="Search title, slug, tag..." />
    </label>
    <label>
      <SlidersHorizontal size={15} />
      <select bind:value={status}>
        <option value="all">All status</option>
        <option value="published">Published</option>
        <option value="draft">Draft</option>
      </select>
    </label>
    <label>
      <span>Tag</span>
      <select bind:value={activeTag}>
        <option value="all">All tags</option>
        {#each tags as tag}
          <option value={tag}>{tag}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="table-shell">
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Tags</th>
          <th>Status</th>
          <th>{collection === "blog" ? "Date" : "Slug"}</th>
          <th aria-label="Open"></th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as post (post.path)}
          <tr>
            <td>
              <a class="title-link" href={`/admin/${collection}/${post.slug}`}>
                <strong>{post.title || "(untitled)"}</strong>
                <span>/{collection === "blog" ? "blog" : "projects"}/{post.slug}</span>
              </a>
            </td>
            <td>
              <div class="chips">
                {#each post.tags as tag}
                  <span>{tag}</span>
                {/each}
              </div>
            </td>
            <td>
              <span class:draft={post.draft} class="status-dot">
                {post.draft ? "Draft" : "Published"}
              </span>
            </td>
            <td class="date-cell">{post.date ?? post.slug}</td>
            <td>
              <a class="open-link" href={`/admin/${collection}/${post.slug}`} aria-label={`Edit ${post.title}`}>
                <ChevronRight size={18} />
              </a>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="empty">No content matches these filters.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="count">Showing {filtered.length} of {posts.length}</p>
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
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background-color: $color-accent-1;
    color: $color-white;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    padding: 0.65rem 0.9rem;
    text-decoration: none;
    font-size: $fs-sm;
    font-weight: 800;

    &:hover {
      background-color: $color-text;
      border-color: $color-text;
      color: $color-white;
    }
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;

    @include respond-to("tablet") {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    div {
      background-color: $color-primary;
      border: 1px solid $color-accent-1;
      border-radius: 5px;
      padding: 0.8rem 1rem;
      color: $color-accent-1;
      font-size: $fs-xs;
      font-weight: 700;
      text-transform: uppercase;
    }

    span {
      display: block;
      color: $color-text;
      font-size: $fs-2xl;
      line-height: 1;
      margin-bottom: 0.25rem;
    }
  }

  .filters {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.65rem;

    @include respond-to("tablet") {
      grid-template-columns: minmax(16rem, 1fr) 12rem 12rem;
    }
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    padding: 0.45rem 0.65rem;
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    text-transform: uppercase;
  }

  input,
  select {
    border: 0;
    background: transparent;
    color: $color-text;
    font: inherit;
    font-size: $fs-sm;
    text-transform: none;
    width: 100%;
    outline: none;
  }

  .table-shell {
    overflow-x: auto;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: var(--admin-paper);
  }

  table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
  }

  th {
    position: sticky;
    top: 0;
    background-color: $color-primary;
    color: $color-text;
    text-align: left;
    padding: 0.8rem 1rem;
    border-bottom: 1px solid $color-accent-1;
    font-size: $fs-xs;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba($color-accent-1, 0.25);
    vertical-align: middle;
  }

  tr:hover td {
    background-color: rgba($color-secondary, 0.45);
  }

  .title-link {
    color: $color-text;
    text-decoration: none;

    strong,
    span {
      display: block;
    }

    span {
      color: $color-accent-1;
      font-size: $fs-sm;
      margin-top: 0.15rem;
    }
  }

  .chips {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;

    span {
      background-color: $color-accent-2;
      border-radius: 999px;
      color: $color-text;
      padding: 0.2rem 0.55rem;
      font-size: $fs-xs;
      font-weight: 800;
    }
  }

  .status-dot {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: $fs-sm;
    font-weight: 800;

    &::before {
      content: "";
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 50%;
      background-color: $color-accent-1;
    }

    &.draft::before {
      background-color: $color-warning;
    }
  }

  .date-cell,
  .count,
  .empty {
    color: $color-accent-1;
    font-size: $fs-sm;
  }

  .open-link {
    color: $color-text;
    display: inline-flex;
    text-decoration: none;
  }
</style>
