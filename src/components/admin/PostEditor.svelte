<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Link from "@tiptap/extension-link";
  import Image from "@tiptap/extension-image";
  import Placeholder from "@tiptap/extension-placeholder";
  import {
    customComponentExtensions,
    COMPONENT_SPECS,
  } from "../../lib/admin/editor/extensions";
  import type {
    Collection,
    Frontmatter,
    BlogFrontmatter,
    ProjectFrontmatter,
  } from "../../lib/admin/posts";
  import type { TiptapDoc } from "../../lib/admin/mdx/types";
  import ComponentBlockForm from "./ComponentBlockForm.svelte";

  interface Props {
    collection: Collection;
    slug: string;
    isNew: boolean;
    initialDoc: TiptapDoc;
    initialFrontmatter: Frontmatter;
    initialSha: string;
  }

  let {
    collection,
    slug: initialSlug,
    isNew,
    initialDoc,
    initialFrontmatter,
    initialSha,
  }: Props = $props();

  let slug = $state(initialSlug === "new" ? "" : initialSlug);
  let frontmatter = $state<Frontmatter>(
    JSON.parse(JSON.stringify(initialFrontmatter)),
  );
  let sha = $state(initialSha);
  let saving = $state(false);
  let saveStatus = $state<"idle" | "saved" | "error">("idle");
  let saveError = $state<string | null>(null);
  let confirmingDelete = $state(false);

  let editorEl: HTMLDivElement;
  let editor: Editor | null = null;
  let editingBlockPos = $state<number | null>(null);
  let editingBlockNodeName = $state<string | null>(null);
  let editingBlockAttrs = $state<Record<string, unknown> | null>(null);

  const blogFm = $derived(frontmatter as BlogFrontmatter);
  const projFm = $derived(frontmatter as ProjectFrontmatter);

  let tagsInput = $state(initialFrontmatter.tags.join(", "));
  $effect(() => {
    frontmatter.tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  });

  onMount(() => {
    editor = new Editor({
      element: editorEl,
      extensions: [
        StarterKit.configure({ codeBlock: { HTMLAttributes: {} } }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer" },
        }),
        Image,
        Placeholder.configure({
          placeholder: "Start writing your post…",
        }),
        ...customComponentExtensions,
      ],
      content: initialDoc,
      autofocus: false,
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });

  function isActive(name: string, attrs?: Record<string, unknown>): boolean {
    if (!editor) return false;
    return editor.isActive(name, attrs);
  }

  function exec(action: () => void) {
    if (!editor) return;
    action();
    editor.commands.focus();
  }

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Link URL", previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function insertCustomBlock(specName: string) {
    const spec = COMPONENT_SPECS.find((s) => s.name === specName);
    if (!editor || !spec) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: spec.tiptapName,
        attrs: { ...spec.defaultAttrs },
      })
      .run();
  }

  function openBlockEditor(pos: number) {
    if (!editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editingBlockPos = pos;
    editingBlockNodeName = node.type.name;
    editingBlockAttrs = { ...node.attrs };
  }

  function saveBlockAttrs(attrs: Record<string, unknown>) {
    if (!editor || editingBlockPos === null) return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeMarkup(editingBlockPos!, undefined, attrs);
        return true;
      })
      .run();
    editingBlockPos = null;
    editingBlockNodeName = null;
    editingBlockAttrs = null;
  }

  function deleteBlock() {
    if (!editor || editingBlockPos === null) return;
    const node = editor.state.doc.nodeAt(editingBlockPos);
    if (!node) return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.delete(editingBlockPos!, editingBlockPos! + node.nodeSize);
        return true;
      })
      .run();
    editingBlockPos = null;
    editingBlockNodeName = null;
    editingBlockAttrs = null;
  }

  async function save() {
    if (!editor) return;
    if (!slug.trim()) {
      saveError = "Slug is required.";
      saveStatus = "error";
      return;
    }
    saving = true;
    saveError = null;
    saveStatus = "idle";
    const doc = editor.getJSON() as TiptapDoc;
    try {
      const res = await fetch(`/api/admin/posts/${collection}/${slug}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          frontmatter,
          doc,
          sha,
          isNew,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      sha = data.sha ?? sha;
      saveStatus = "saved";
      if (isNew && data.path) {
        window.location.replace(`/admin/${collection}/${slug}`);
      }
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Save failed.";
      saveStatus = "error";
    } finally {
      saving = false;
    }
  }

  async function deletePost() {
    if (!confirmingDelete) {
      confirmingDelete = true;
      return;
    }
    saving = true;
    try {
      const res = await fetch(`/api/admin/posts/${collection}/${initialSlug}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sha }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      window.location.replace(`/admin/${collection}`);
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Delete failed.";
      saveStatus = "error";
      confirmingDelete = false;
    } finally {
      saving = false;
    }
  }

  function findBlockPosByElement(el: HTMLElement): number | null {
    if (!editor) return null;
    const view = editor.view;
    const rect = el.getBoundingClientRect();
    const result = view.posAtCoords({
      left: rect.left + 4,
      top: rect.top + 4,
    });
    if (!result) return null;
    const resolved = view.state.doc.resolve(
      result.inside >= 0 ? result.inside : result.pos,
    );
    return resolved.before(resolved.depth);
  }

  function handleEditorClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const block = target.closest<HTMLElement>(".mdx-block");
    if (!block) return;
    event.preventDefault();
    const pos = findBlockPosByElement(block);
    if (pos !== null) openBlockEditor(pos);
  }
</script>

<div class="editor-shell">
  <div class="editor-frontmatter">
    <div class="form-row">
      <label class="form-field grow">
        <span>Title</span>
        <input
          type="text"
          bind:value={frontmatter.title}
          placeholder="Post title"
        />
      </label>
      <label class="form-field">
        <span>Slug</span>
        <input
          type="text"
          bind:value={slug}
          placeholder="my-post"
          disabled={!isNew}
        />
      </label>
    </div>

    <label class="form-field">
      <span>Description</span>
      <textarea bind:value={frontmatter.description} rows="2"></textarea>
    </label>

    <div class="form-row">
      <label class="form-field grow">
        <span>Tags (comma-separated)</span>
        <input type="text" bind:value={tagsInput} />
      </label>
      {#if collection === "blog"}
        <label class="form-field">
          <span>Date</span>
          <input type="date" bind:value={blogFm.date} />
        </label>
      {/if}
    </div>

    {#if collection === "blog"}
      <label class="form-field">
        <span>Cover image (optional)</span>
        <input
          type="text"
          bind:value={blogFm.image}
          placeholder="/images/blog/..."
        />
      </label>
    {:else}
      <div class="form-row">
        <label class="form-field grow">
          <span>External URL (href)</span>
          <input
            type="text"
            bind:value={projFm.href}
            placeholder="https://..."
          />
        </label>
        <label class="form-field">
          <span>Order</span>
          <input
            type="number"
            value={projFm.order ?? ""}
            oninput={(e) => {
              const val = (e.currentTarget as HTMLInputElement).value;
              projFm.order = val === "" ? undefined : Number(val);
            }}
          />
        </label>
      </div>
      <label class="form-field inline">
        <input type="checkbox" bind:checked={projFm.featured} />
        <span>Featured</span>
      </label>
    {/if}

    <label class="form-field inline">
      <input type="checkbox" bind:checked={frontmatter.draft} />
      <span>Draft (won't be published)</span>
    </label>
  </div>

  <div class="toolbar" role="toolbar">
    <button
      type="button"
      class:active={isActive("bold")}
      onclick={() => exec(() => editor!.chain().focus().toggleBold().run())}
      aria-label="Bold"
    >B</button>
    <button
      type="button"
      class:active={isActive("italic")}
      onclick={() => exec(() => editor!.chain().focus().toggleItalic().run())}
      aria-label="Italic"
    ><i>I</i></button>
    <button
      type="button"
      class:active={isActive("strike")}
      onclick={() => exec(() => editor!.chain().focus().toggleStrike().run())}
      aria-label="Strikethrough"
    ><s>S</s></button>
    <button
      type="button"
      class:active={isActive("code")}
      onclick={() => exec(() => editor!.chain().focus().toggleCode().run())}
      aria-label="Code"
    >{`<>`}</button>
    <span class="sep"></span>
    <button
      type="button"
      class:active={isActive("heading", { level: 2 })}
      onclick={() =>
        exec(() => editor!.chain().focus().toggleHeading({ level: 2 }).run())
      }
    >H2</button>
    <button
      type="button"
      class:active={isActive("heading", { level: 3 })}
      onclick={() =>
        exec(() => editor!.chain().focus().toggleHeading({ level: 3 }).run())
      }
    >H3</button>
    <span class="sep"></span>
    <button
      type="button"
      class:active={isActive("bulletList")}
      onclick={() => exec(() => editor!.chain().focus().toggleBulletList().run())}
    >• List</button>
    <button
      type="button"
      class:active={isActive("orderedList")}
      onclick={() =>
        exec(() => editor!.chain().focus().toggleOrderedList().run())
      }
    >1. List</button>
    <button
      type="button"
      class:active={isActive("blockquote")}
      onclick={() => exec(() => editor!.chain().focus().toggleBlockquote().run())}
    >Quote</button>
    <button
      type="button"
      class:active={isActive("codeBlock")}
      onclick={() => exec(() => editor!.chain().focus().toggleCodeBlock().run())}
    >Code block</button>
    <span class="sep"></span>
    <button
      type="button"
      class:active={isActive("link")}
      onclick={setLink}
    >Link</button>
    <span class="sep"></span>
    {#each COMPONENT_SPECS as spec (spec.name)}
      <button type="button" onclick={() => insertCustomBlock(spec.name)}>
        + {spec.name}
      </button>
    {/each}
  </div>

  <div
    class="editor-area"
    bind:this={editorEl}
    role="textbox"
    tabindex="0"
    onclick={handleEditorClick}
  ></div>

  {#if editingBlockPos !== null && editingBlockNodeName && editingBlockAttrs}
    <ComponentBlockForm
      nodeName={editingBlockNodeName}
      attrs={editingBlockAttrs}
      onSave={saveBlockAttrs}
      onCancel={() => {
        editingBlockPos = null;
        editingBlockNodeName = null;
        editingBlockAttrs = null;
      }}
      onDelete={deleteBlock}
    />
  {/if}

  <div class="actions">
    <button
      type="button"
      class="primary"
      onclick={save}
      disabled={saving}
    >
      {saving ? "Saving…" : isNew ? "Create post" : "Save"}
    </button>
    {#if !isNew}
      <button
        type="button"
        class="danger"
        onclick={deletePost}
        disabled={saving}
      >
        {confirmingDelete ? "Click again to confirm" : "Delete"}
      </button>
    {/if}
    {#if saveStatus === "saved"}
      <span class="status saved">Saved.</span>
    {/if}
    {#if saveStatus === "error" && saveError}
      <span class="status error">{saveError}</span>
    {/if}
  </div>
</div>

<style lang="scss">
  .editor-shell {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .editor-frontmatter {
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: $fs-sm;
    min-width: 12rem;

    &.grow {
      flex: 1;
    }

    &.inline {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
    }
  }

  .form-field span {
    font-weight: 600;
  }

  .form-field input,
  .form-field textarea {
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    padding: 0.45rem 0.6rem;
    border-radius: 3px;
    border: 1px solid $color-accent-1;
    background-color: $color-white;
    color: $color-text;
    width: 100%;

    &:focus-visible {
      outline: 2px solid $color-accent-2;
      outline-offset: 1px;
    }

    &:disabled {
      background-color: $color-tertiary;
      color: $color-accent-1;
    }
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    background-color: $color-accent-1;
    padding: 0.45rem 0.5rem;
    border-radius: 5px 5px 0 0;
    align-items: center;
    border-bottom: 1px solid $color-text;
    position: sticky;
    top: 0;
    z-index: 5;
  }

  .toolbar button {
    background-color: transparent;
    color: $color-white;
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 0.25rem 0.6rem;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;

    &:hover {
      background-color: $color-accent-2;
      color: $color-text;
    }

    &.active {
      background-color: $color-secondary;
      color: $color-text;
    }
  }

  .toolbar .sep {
    width: 1px;
    align-self: stretch;
    background-color: $color-text;
    opacity: 0.4;
    margin: 0.15rem 0.25rem;
  }

  .editor-area {
    background-color: $color-white;
    border: 1px solid $color-accent-1;
    border-top: none;
    border-radius: 0 0 5px 5px;
    padding: 1.5rem 1.25rem;
    min-height: 50vh;
    color: $color-text;
    line-height: 1.6;
  }

  .editor-area :global(.ProseMirror) {
    outline: none;
    min-height: 40vh;
  }

  .editor-area :global(.ProseMirror p.is-editor-empty:first-child::before) {
    color: $color-accent-1;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }

  .editor-area :global(h2) {
    font-size: $fs-2xl;
    margin: 1.5rem 0 0.5rem;
  }

  .editor-area :global(h3) {
    font-size: $fs-xl;
    margin: 1.25rem 0 0.5rem;
  }

  .editor-area :global(p) {
    margin: 0.5rem 0;
  }

  .editor-area :global(ul),
  .editor-area :global(ol) {
    padding-left: 1.5rem;
  }

  .editor-area :global(blockquote) {
    border-left: 3px solid $color-accent-1;
    margin: 0.75rem 0;
    padding-left: 0.75rem;
    color: $color-accent-1;
  }

  .editor-area :global(pre) {
    background-color: $color-text;
    color: $color-white;
    padding: 0.75rem 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: $fs-sm;
  }

  .editor-area :global(code) {
    background-color: $color-tertiary;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.95em;
  }

  .editor-area :global(.mdx-block) {
    background-color: $color-tertiary;
    border: 2px dashed $color-accent-1;
    border-radius: 5px;
    padding: 0.85rem 1rem;
    margin: 1rem 0;
    cursor: pointer;
    transition: background-color 0.2s ease;

    &::before {
      content: attr(data-mdx);
      display: block;
      font-weight: 700;
      font-size: $fs-sm;
      color: $color-accent-1;
      margin-bottom: 0.25rem;
    }

    &.raw::before {
      content: "Raw MDX";
    }

    &:hover {
      background-color: $color-secondary;
    }

    &.ProseMirror-selectednode {
      outline: 2px solid $color-accent-2;
      outline-offset: 2px;
    }
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .actions button {
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    font-weight: 600;
    padding: 0.55rem 1.25rem;
    border-radius: 9999px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: background-color 0.2s ease;

    &.primary {
      background-color: $color-accent-1;
      color: $color-white;
      border-color: $color-accent-1;

      &:hover {
        background-color: $color-text;
        border-color: $color-text;
      }
    }

    &.danger {
      background-color: transparent;
      color: $color-error;
      border-color: $color-error;

      &:hover {
        background-color: $color-error;
        color: $color-white;
      }
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .status {
    font-size: $fs-sm;

    &.saved {
      color: $color-link;
    }

    &.error {
      color: $color-error;
    }
  }
</style>
