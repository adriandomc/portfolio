<script lang="ts">
  import {
    ChevronDown,
    ChevronUp,
    Loader2,
    Send,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  interface PendingPath {
    path: string;
    delete: boolean;
    size: number;
  }

  interface PendingTransaction {
    id: string;
    message: string;
    createdAt: string;
    paths: PendingPath[];
  }

  interface StagingDiff {
    total: number;
    transactions: PendingTransaction[];
  }

  let diff = $state<StagingDiff>({ total: 0, transactions: [] });
  let loading = $state(false);
  let publishing = $state(false);
  let discarding = $state(false);
  let error = $state<string | null>(null);
  let expanded = $state(false);
  let confirmDiscardAll = $state(false);

  async function refresh() {
    loading = true;
    try {
      const res = await fetch("/api/admin/staging");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      diff = await res.json();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load staging.";
    } finally {
      loading = false;
    }
  }

  async function publish() {
    if (publishing || diff.total === 0) return;
    publishing = true;
    error = null;
    try {
      const res = await fetch("/api/admin/staging/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await refresh();
      window.dispatchEvent(new CustomEvent("admin-staging-published"));
    } catch (err) {
      error = err instanceof Error ? err.message : "Publish failed.";
    } finally {
      publishing = false;
    }
  }

  async function discardAll() {
    if (!confirmDiscardAll) {
      confirmDiscardAll = true;
      return;
    }
    discarding = true;
    error = null;
    try {
      const res = await fetch("/api/admin/staging/discard", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      confirmDiscardAll = false;
      await refresh();
      window.dispatchEvent(new CustomEvent("admin-staging-published"));
    } catch (err) {
      error = err instanceof Error ? err.message : "Discard failed.";
    } finally {
      discarding = false;
    }
  }

  async function discardTransaction(id: string) {
    discarding = true;
    error = null;
    try {
      const res = await fetch(`/api/admin/staging/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await refresh();
      window.dispatchEvent(new CustomEvent("admin-staging-published"));
    } catch (err) {
      error = err instanceof Error ? err.message : "Discard failed.";
    } finally {
      discarding = false;
    }
  }

  function formatRelativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const seconds = Math.round((now - then) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(iso).toLocaleString();
  }

  function shortPath(path: string): string {
    return path.replace(/^public\//, "/");
  }

  onMount(() => {
    refresh();
    const onChange = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener("admin-staging-changed", onChange);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("admin-staging-changed", onChange);
      window.removeEventListener("focus", onFocus);
    };
  });
</script>

{#if diff.total > 0 || error}
  <section class="staging-bar" class:expanded>
    <header>
      <div class="summary">
        <strong>{diff.total} pending change{diff.total === 1 ? "" : "s"}</strong>
        {#if loading}<span class="spin" aria-label="Refreshing"><Loader2 size={14} /></span>{/if}
        <button
          type="button"
          class="link"
          onclick={() => (expanded = !expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide" : "Show"}
          {#if expanded}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if}
        </button>
      </div>
      <div class="actions">
        {#if error}<span class="error-text">{error}</span>{/if}
        <button
          type="button"
          class="secondary"
          onclick={discardAll}
          disabled={discarding || publishing}
          title={confirmDiscardAll ? "Click again to confirm" : "Discard all pending changes"}
        >
          <Trash2 size={14} />
          {confirmDiscardAll ? "Confirm discard" : "Discard all"}
        </button>
        <button
          type="button"
          class="primary"
          onclick={publish}
          disabled={publishing || diff.total === 0}
        >
          {#if publishing}<span class="spin"><Loader2 size={14} /></span>{:else}<Send size={14} />{/if}
          Publish
        </button>
      </div>
    </header>
    {#if expanded}
      <ol class="tx-list">
        {#each diff.transactions as tx (tx.id)}
          <li>
            <div class="tx-head">
              <div>
                <strong>{tx.message}</strong>
                <span class="meta">{formatRelativeTime(tx.createdAt)} · {tx.paths.length} path{tx.paths.length === 1 ? "" : "s"}</span>
              </div>
              <button
                type="button"
                class="row-remove"
                aria-label="Discard this transaction"
                onclick={() => discardTransaction(tx.id)}
                disabled={discarding || publishing}
              >
                <X size={14} />
              </button>
            </div>
            <ul class="paths">
              {#each tx.paths as p}
                <li class:delete={p.delete}>
                  <span class="badge {p.delete ? 'delete' : 'write'}">{p.delete ? "delete" : "write"}</span>
                  <code>{shortPath(p.path)}</code>
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

<style lang="scss">
  .staging-bar {
    background-color: rgba($color-accent-2, 0.28);
    border-bottom: 1px solid $color-accent-1;
    padding: 0.55rem clamp(1rem, 3vw, 2rem);
    font-size: $fs-sm;
  }

  header {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: space-between;
  }

  .summary {
    align-items: center;
    display: flex;
    gap: 0.55rem;

    strong {
      color: $color-text;
    }
  }

  .link {
    background: transparent;
    border: 0;
    color: $color-accent-1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    font: inherit;
    font-weight: 800;
    gap: 0.2rem;
    padding: 0.15rem 0.35rem;
    text-decoration: underline;

    &:hover {
      color: $color-text;
    }
  }

  .actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .actions button {
    align-items: center;
    border: 1px solid $color-accent-1;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-xs;
    font-weight: 800;
    gap: 0.3rem;
    padding: 0.35rem 0.6rem;
  }

  .actions button.primary {
    background-color: $color-accent-1;
    color: $color-white;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }

  .actions button.secondary {
    background-color: var(--admin-paper, $color-tertiary);
    color: $color-text;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }

  .error-text {
    color: $color-error;
    font-weight: 800;
  }

  .spin {
    align-items: center;
    animation: spin 0.8s linear infinite;
    display: inline-flex;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .tx-list {
    list-style: none;
    margin: 0.65rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
    max-height: 22rem;
    overflow-y: auto;
  }

  .tx-list li {
    background-color: var(--admin-paper, $color-tertiary);
    border: 1px solid rgba($color-accent-1, 0.6);
    border-radius: 4px;
    padding: 0.5rem 0.6rem;
  }

  .tx-head {
    align-items: flex-start;
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;

    strong {
      color: $color-text;
      display: block;
      font-size: $fs-xs;
    }

    .meta {
      color: $color-accent-1;
      display: block;
      font-size: $fs-xs;
    }
  }

  .row-remove {
    background: transparent;
    border: 0;
    color: $color-accent-1;
    cursor: pointer;
    padding: 0.2rem 0.3rem;
    border-radius: 3px;

    &:hover {
      background-color: rgba($color-accent-1, 0.18);
      color: $color-text;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  .paths {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }

  .paths li {
    align-items: center;
    background: transparent;
    border: 0;
    display: grid;
    gap: 0.45rem;
    grid-template-columns: auto 1fr;
    padding: 0;

    code {
      color: $color-text;
      font-family: "JetBrains Mono", monospace;
      font-size: $fs-xs;
      overflow-wrap: anywhere;
    }

    &.delete code {
      color: $color-error;
      text-decoration: line-through;
    }
  }

  .badge {
    background-color: $color-accent-1;
    border-radius: 3px;
    color: $color-white;
    font-size: $fs-xs;
    font-weight: 800;
    letter-spacing: 0.04em;
    padding: 0.05rem 0.35rem;
    text-transform: uppercase;

    &.delete {
      background-color: $color-error;
    }
  }
</style>
