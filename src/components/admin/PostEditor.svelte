<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Link from "@tiptap/extension-link";
  import Image from "@tiptap/extension-image";
  import Placeholder from "@tiptap/extension-placeholder";
  import {
    Bold,
    Code,
    ImagePlus,
    Italic,
    Link2,
    List,
    ListOrdered,
    Quote,
    Save,
    SquareCode,
    Strikethrough,
    X,
  } from "@lucide/svelte";
  import {
    COMPONENT_SPECS,
    createCustomComponentExtensions,
    defaultRowItem,
    type MdxMediaPickerRequest,
  } from "../../lib/admin/editor/extensions";
  import type {
    BlogFrontmatter,
    Collection,
    Frontmatter,
    ProjectFrontmatter,
  } from "../../lib/admin/posts";
  import type { TiptapDoc } from "../../lib/admin/mdx/types";
  import MediaPicker from "./MediaPicker.svelte";

  interface Props {
    collection: Collection;
    slug: string;
    isNew: boolean;
    initialDoc: TiptapDoc;
    initialFrontmatter: Frontmatter;
    initialSha: string;
  }

  type PickerTarget =
    | { kind: "bodyImage" }
    | { kind: "blogCover" }
    | MdxMediaPickerRequest;

  let {
    collection,
    slug: initialSlug,
    isNew,
    initialDoc,
    initialFrontmatter,
    initialSha,
  }: Props = $props();

  function initialEditorSlug() {
    return initialSlug === "new" ? "" : initialSlug;
  }

  function initialEditorFrontmatter() {
    return JSON.parse(JSON.stringify(initialFrontmatter)) as Frontmatter;
  }

  function initialEditorMeta() {
    return JSON.stringify({
      slug: initialEditorSlug(),
      frontmatter: initialEditorFrontmatter(),
    });
  }

  function initialEditorSha() {
    return initialSha;
  }

  let slug = $state(initialEditorSlug());
  let frontmatter = $state<Frontmatter>(initialEditorFrontmatter());
  let sha = $state(initialEditorSha());
  let saving = $state(false);
  let dirty = $state(false);
  let saveStatus = $state<"idle" | "saved" | "error">("idle");
  let saveError = $state<string | null>(null);
  let confirmingDelete = $state(false);
  let wordCount = $state(0);
  let mounted = $state(false);
  let lastSavedMeta = $state(initialEditorMeta());
  let selectionVersion = $state(0);

  let editorEl: HTMLDivElement;
  let editor: Editor | null = null;
  let pickerTarget = $state<PickerTarget | null>(null);
  let linkOpen = $state(false);
  let linkUrl = $state("");
  let tagDraft = $state("");

  const blogFm = $derived(frontmatter as BlogFrontmatter);
  const projFm = $derived(frontmatter as ProjectFrontmatter);
  const suggestedSlug = $derived(slug || slugify(frontmatter.title));
  const defaultMediaFolder = $derived(
    collection === "projects"
      ? `projects/${suggestedSlug || "new-project"}`
      : `blog/${suggestedSlug || "new-post"}`,
  );
  $effect(() => {
    const next = JSON.stringify({ slug, frontmatter });
    if (mounted && next !== lastSavedMeta) dirty = true;
  });

  onMount(() => {
    let cancelled = false;
    void setupEditor();
    window.addEventListener("keydown", handleShortcuts);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleShortcuts);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };

    async function setupEditor() {
      const { AdminCodeBlock } = await import("../../lib/admin/editor/code-block");
      if (cancelled) return;

      editor = new Editor({
        element: editorEl,
        extensions: [
          StarterKit.configure({ codeBlock: false }),
          AdminCodeBlock,
          Link.configure({
            openOnClick: false,
            HTMLAttributes: { rel: "noopener noreferrer" },
          }),
          Image,
          Placeholder.configure({
            placeholder: "Start writing your post...",
          }),
          ...createCustomComponentExtensions({
            openMediaPicker: (target) => {
              pickerTarget = target;
            },
            onMediaError: (message) => {
              saveError = message;
              saveStatus = "error";
            },
          }),
        ],
        content: initialDoc,
        autofocus: false,
        onUpdate: ({ editor }) => {
          dirty = true;
          saveStatus = "idle";
          updateWordCount(editor);
        },
        onSelectionUpdate: () => {
          selectionVersion += 1;
        },
      });
      updateWordCount(editor);
      mounted = true;
    }
  });

  let confirmDeleteTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    editor?.destroy();
    if (confirmDeleteTimer) clearTimeout(confirmDeleteTimer);
  });

  function handleShortcuts(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!saving) void save();
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (dirty) event.preventDefault();
  }

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function updateWordCount(instance: Editor | null) {
    const text = instance?.getText().trim() ?? "";
    wordCount = text ? text.split(/\s+/).length : 0;
  }

  function markDirty() {
    dirty = true;
    saveStatus = "idle";
  }

  function isActive(name: string, attrs?: Record<string, unknown>): boolean {
    selectionVersion;
    if (!editor) return false;
    return editor.isActive(name, attrs);
  }

  function exec(action: () => void) {
    if (!editor) return;
    action();
    editor.commands.focus();
    selectionVersion += 1;
  }

  function setBlockType(value: string) {
    if (!editor) return;
    if (value === "paragraph") {
      exec(() => editor!.chain().focus().setParagraph().run());
    } else if (value === "h2") {
      exec(() => editor!.chain().focus().toggleHeading({ level: 2 }).run());
    } else if (value === "h3") {
      exec(() => editor!.chain().focus().toggleHeading({ level: 3 }).run());
    }
  }

  function currentBlockType(): string {
    selectionVersion;
    if (isActive("heading", { level: 2 })) return "h2";
    if (isActive("heading", { level: 3 })) return "h3";
    return "paragraph";
  }

  function openLinkDialog() {
    if (!editor) return;
    linkUrl = String(editor.getAttributes("link").href ?? "");
    linkOpen = true;
  }

  function applyLink() {
    if (!editor) return;
    if (!linkUrl.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl.trim() })
        .run();
    }
    closeLinkDialog();
    markDirty();
  }

  function closeLinkDialog() {
    linkOpen = false;
    linkUrl = "";
  }

  function autofocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function insertCustomBlock(specName: string) {
    const spec = COMPONENT_SPECS.find((item) => item.name === specName);
    if (!editor || !spec) return;
    if (specName === "Badge" || specName === "Button") {
      const selection = editor.state.selection as {
        from: number;
        node?: { type: { name: string }; attrs: Record<string, unknown> };
      };
      if (selection.node?.type.name === "mdxComponentRow") {
        updateBlockAttrsAt(selection.from, (attrs) => ({
          ...attrs,
          items: [
            ...(Array.isArray(attrs.items) ? attrs.items : []),
            defaultRowItem(specName),
          ],
        }));
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({
          type: "mdxComponentRow",
          attrs: { items: [defaultRowItem(specName)] },
        })
        .run();
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({
        type: spec.tiptapName,
        attrs: { ...spec.defaultAttrs },
      })
      .run();
  }

  function addTag() {
    const next = tagDraft.trim();
    if (!next) return;
    if (!frontmatter.tags.includes(next)) {
      frontmatter.tags = [...frontmatter.tags, next];
    }
    tagDraft = "";
    markDirty();
  }

  function removeTag(tag: string) {
    frontmatter.tags = frontmatter.tags.filter((item) => item !== tag);
    markDirty();
  }

  function deriveProjectImagesFromDoc(doc: TiptapDoc): Array<{ src: string; alt: string }> {
    const stack: Array<TiptapDoc["content"][number]> = [...doc.content];
    while (stack.length > 0) {
      const node = stack.shift()!;
      if (node.type === "mdxImageCarousel") {
        const images = node.attrs?.images;
        if (!Array.isArray(images)) return [];
        return images
          .filter(
            (entry): entry is { src?: unknown; alt?: unknown } =>
              Boolean(entry) && typeof entry === "object",
          )
          .map((entry) => ({
            src: typeof entry.src === "string" ? entry.src : "",
            alt: typeof entry.alt === "string" ? entry.alt : "",
          }))
          .filter((entry) => entry.src);
      }
      if (Array.isArray(node.content)) stack.unshift(...node.content);
    }
    return [];
  }

  function updateBlockAttrsAt(
    pos: number,
    updater: (attrs: Record<string, unknown>) => Record<string, unknown>,
  ) {
    if (!editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, updater({ ...node.attrs }));
        return true;
      })
      .run();
    markDirty();
  }

  function chooseMedia(path: string) {
    const target = pickerTarget;
    if (!target) return;
    if (target.kind === "bodyImage") {
      editor?.chain().focus().setImage({ src: path, alt: "" }).run();
    } else if (target.kind === "blogCover") {
      blogFm.image = path;
      markDirty();
    } else if (target.kind === "blockFigure") {
      updateBlockAttrsAt(target.pos, (attrs) => ({ ...attrs, src: path }));
    } else if (target.kind === "blockCarousel") {
      const targetIndex = target.index;
      updateBlockAttrsAt(target.pos, (attrs) => {
        const images = Array.isArray(attrs.images)
          ? ([...(attrs.images as Array<{ src: string; alt: string }>)] as Array<{
              src: string;
              alt: string;
            }>)
          : [];
        images[targetIndex] = {
          ...(images[targetIndex] ?? { src: "", alt: "" }),
          src: path,
        };
        return { ...attrs, images };
      });
    }
    pickerTarget = null;
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
    if (collection === "projects") {
      projFm.images = deriveProjectImagesFromDoc(doc);
    }
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
      dirty = false;
      lastSavedMeta = JSON.stringify({ slug, frontmatter });
      window.dispatchEvent(new CustomEvent("admin-staging-changed"));
      if (isNew && data.slug) {
        window.location.replace(`/admin/${collection}/${data.slug}`);
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
      // Auto-disarm so a stale confirmation can't delete on a later stray click.
      if (confirmDeleteTimer) clearTimeout(confirmDeleteTimer);
      confirmDeleteTimer = setTimeout(() => {
        confirmingDelete = false;
        confirmDeleteTimer = null;
      }, 4000);
      return;
    }
    if (confirmDeleteTimer) {
      clearTimeout(confirmDeleteTimer);
      confirmDeleteTimer = null;
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
      window.dispatchEvent(new CustomEvent("admin-staging-changed"));
      window.location.replace(`/admin/${collection}`);
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Delete failed.";
      saveStatus = "error";
      confirmingDelete = false;
    } finally {
      saving = false;
    }
  }
</script>

<section class="editor-workspace">
  <header class="editor-topbar">
    <a href={`/admin/${collection}`}>/{collection}</a>
    <div class="toolbar" role="toolbar" aria-label="Formatting">
      <select
        aria-label="Block type"
        value={currentBlockType()}
        onchange={(event) => setBlockType((event.currentTarget as HTMLSelectElement).value)}
      >
        <option value="paragraph">Paragraph</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <button type="button" class:active={isActive("bold")} onclick={() => exec(() => editor!.chain().focus().toggleBold().run())} aria-label="Bold">
        <Bold size={16} />
      </button>
      <button type="button" class:active={isActive("italic")} onclick={() => exec(() => editor!.chain().focus().toggleItalic().run())} aria-label="Italic">
        <Italic size={16} />
      </button>
      <button type="button" class:active={isActive("strike")} onclick={() => exec(() => editor!.chain().focus().toggleStrike().run())} aria-label="Strike">
        <Strikethrough size={16} />
      </button>
      <button type="button" class:active={isActive("code")} onclick={() => exec(() => editor!.chain().focus().toggleCode().run())} aria-label="Code">
        <Code size={16} />
      </button>
      <span class="sep"></span>
      <button type="button" class:active={isActive("bulletList")} onclick={() => exec(() => editor!.chain().focus().toggleBulletList().run())} aria-label="Bullet list">
        <List size={16} />
      </button>
      <button type="button" class:active={isActive("orderedList")} onclick={() => exec(() => editor!.chain().focus().toggleOrderedList().run())} aria-label="Ordered list">
        <ListOrdered size={16} />
      </button>
      <button type="button" class:active={isActive("blockquote")} onclick={() => exec(() => editor!.chain().focus().toggleBlockquote().run())} aria-label="Quote">
        <Quote size={16} />
      </button>
      <button type="button" class:active={isActive("codeBlock")} onclick={() => exec(() => editor!.chain().focus().toggleCodeBlock({ language: "text" }).run())} aria-label="Code block">
        <SquareCode size={16} />
      </button>
      <span class="sep"></span>
      <button type="button" class:active={isActive("link")} onclick={openLinkDialog} aria-label="Link">
        <Link2 size={16} />
      </button>
      <button type="button" onclick={() => (pickerTarget = { kind: "bodyImage" })} aria-label="Insert image">
        <ImagePlus size={16} />
      </button>
      <span class="sep"></span>
      {#each COMPONENT_SPECS as spec (spec.name)}
        <button type="button" class="text-btn" onclick={() => insertCustomBlock(spec.name)}>
          {spec.name}
        </button>
      {/each}
    </div>
    <div class="save-strip">
      <span class:dirty class="save-state">{dirty ? "Unsaved" : saveStatus === "saved" ? "Saved" : "Ready"} · {wordCount} words</span>
      <button type="button" class="save-btn" onclick={save} disabled={saving}>
        <Save size={16} />
        {saving ? "Saving..." : isNew ? "Create" : "Save"}
      </button>
    </div>
  </header>

  <div class="editor-grid">
    <main class="canvas-shell">
      <!-- Tiptap mounts its own focusable contenteditable inside this wrapper,
           so the wrapper must not also claim a textbox role / tab stop. -->
      <div class="editor-area" bind:this={editorEl}></div>
    </main>

    <aside class="inspector">
      <section class="panel">
        <p class="eyebrow">Frontmatter</p>
        <label>
          <span>Title</span>
          <input type="text" bind:value={frontmatter.title} oninput={markDirty} placeholder="Post title" />
        </label>
        <label>
          <span>Slug</span>
          <input type="text" bind:value={slug} oninput={markDirty} placeholder="my-post" disabled={!isNew} />
        </label>
        <label>
          <span>Description</span>
          <textarea bind:value={frontmatter.description} oninput={markDirty} rows="3"></textarea>
        </label>

        <div class="tags">
          <span>Tags</span>
          <div class="chips">
            {#each frontmatter.tags as tag}
              <button type="button" onclick={() => removeTag(tag)}>
                {tag}
                <X size={12} />
              </button>
            {/each}
          </div>
          <input
            type="text"
            bind:value={tagDraft}
            placeholder="add tag..."
            onkeydown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag();
              }
            }}
          />
        </div>

        {#if collection === "blog"}
          <label>
            <span>Date</span>
            <input type="date" bind:value={blogFm.date} oninput={markDirty} />
          </label>
          <label>
            <span>Cover image</span>
            <div class="input-action">
              <input type="text" bind:value={blogFm.image} oninput={markDirty} placeholder="/images/blog/..." />
              <button type="button" onclick={() => (pickerTarget = { kind: "blogCover" })}>Pick</button>
            </div>
          </label>
        {:else}
          <label>
            <span>External URL</span>
            <input type="text" bind:value={projFm.href} oninput={markDirty} placeholder="https://..." />
          </label>
          <div class="hint-card">
            <strong>Project images</strong>
            <p>
              Edit the first <code>ImageCarousel</code> block in the body — the project's
              images and listing thumbnail are derived from it on save.
            </p>
          </div>
          <div class="hint-card">
            <strong>Order &amp; Featured</strong>
            <p>
              Manage from <a href="/admin/projects">/admin/projects</a>: drag rows to reorder
              and tick the Featured checkbox.
            </p>
          </div>
        {/if}

        <label class="check">
          <input type="checkbox" bind:checked={frontmatter.draft} onchange={markDirty} />
          <span>Draft (excluded from build)</span>
        </label>
      </section>
    </aside>
  </div>

  <div class="bottom-actions">
    <button type="button" class="save-btn" onclick={save} disabled={saving}>
      <Save size={16} />
      {saving ? "Saving..." : isNew ? "Create" : "Save"}
    </button>
    {#if !isNew}
      <button type="button" class="danger" onclick={deletePost} disabled={saving}>
        {confirmingDelete ? "Click again to confirm" : "Delete"}
      </button>
    {/if}
    {#if saveStatus === "saved"}
      <span class="saved">Saved.</span>
    {/if}
    {#if saveStatus === "error" && saveError}
      <span class="error-text">{saveError}</span>
    {/if}
  </div>
</section>

{#if pickerTarget}
  <div class="media-picker-portal">
    <MediaPicker
      title="Select image"
      defaultRoot="images"
      defaultFolder={defaultMediaFolder}
      kind="image"
      onSelect={chooseMedia}
      onClose={() => (pickerTarget = null)}
    />
  </div>
{/if}

{#if linkOpen}
  <div class="dialog-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeLinkDialog()}>
    <div class="link-dialog" role="dialog" aria-modal="true" aria-label="Edit link">
      <h2>Link</h2>
      <input
        use:autofocus
        bind:value={linkUrl}
        placeholder="https://..."
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyLink();
          } else if (event.key === "Escape") {
            event.preventDefault();
            closeLinkDialog();
          }
        }}
      />
      <div>
        <button type="button" onclick={closeLinkDialog}>Cancel</button>
        <button type="button" onclick={applyLink}>Apply</button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .editor-workspace {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .editor-topbar {
    position: sticky;
    top: 3.3rem;
    z-index: 20;
    display: grid;
    gap: 0.65rem;
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    padding: 0.6rem;

    @include respond-to("desktop") {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
    }

    > a {
      color: $color-accent-1;
      font-size: $fs-sm;
      font-weight: 800;
      text-decoration: none;
    }
  }

  .toolbar,
  .save-strip,
  .bottom-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .toolbar {
    min-width: 0;
  }

  .toolbar button,
  .toolbar select,
  .save-btn,
  .bottom-actions button,
  .input-action button,
  .link-dialog button {
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: rgba(244, 249, 225, 0.4);
    color: $color-text;
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    font-weight: 800;
    min-height: 2.25rem;
    padding: 0.45rem 0.6rem;

    &:hover {
      background-color: $color-accent-1;
      color: $color-white;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }

  .toolbar button.active {
    background-color: $color-accent-1;
    color: $color-white;
  }

  .toolbar button:not(.text-btn) {
    width: 2.25rem;
    padding-inline: 0;
  }

  .sep {
    width: 1px;
    align-self: stretch;
    background-color: rgba($color-accent-1, 0.45);
    margin: 0.15rem 0.25rem;
  }

  .save-strip {
    justify-content: flex-end;
  }

  .save-state {
    color: $color-accent-1;
    font-size: $fs-xs;

    &.dirty {
      color: $color-text;
      font-weight: 800;
    }
  }

  .save-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background-color: $color-accent-1;
    color: $color-white;
  }

  .editor-grid {
    display: grid;
    gap: 1rem;

    @include respond-to("desktop") {
      grid-template-columns: minmax(0, 1fr) minmax(20rem, 27rem);
      align-items: start;
    }
  }

  .canvas-shell {
    min-width: 0;
  }

  .editor-area {
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-text;
    min-height: 72vh;
    padding: clamp(1rem, 2.5vw, 2rem);
    line-height: 1.7;
  }

  .editor-area :global(.ProseMirror) {
    outline: none;
    min-height: 66vh;
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
    margin: 1.2rem 0 0.5rem;
  }

  .editor-area :global(p) {
    margin: 0.55rem 0;
  }

  .editor-area :global(img) {
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    margin: 1rem 0;
    max-height: 26rem;
    object-fit: contain;
  }

  .editor-area :global(blockquote) {
    border-left: 4px solid $color-accent-1;
    color: $color-accent-1;
    margin: 0.8rem 0;
    padding-left: 0.9rem;
  }

  .editor-area :global(pre) {
    background-color: $color-text;
    border-radius: 5px;
    color: $color-white;
    font-size: $fs-sm;
    overflow-x: auto;
    padding: 0.85rem 1rem;
  }

  .editor-area :global(code) {
    background-color: $color-tertiary;
    border-radius: 3px;
    padding: 0.08rem 0.25rem;
  }

  .editor-area :global(.admin-code-block) {
    background-color: $color-accent-1;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: grid;
    gap: 0;
    grid-template-columns: 8.5rem minmax(0, 1fr);
    margin: 1rem 0;
    overflow: hidden;

    @media (max-width: #{$breakpoint-tablet - 1px}) {
      grid-template-columns: 1fr;
    }
  }

  .editor-area :global(.admin-code-block__rail) {
    align-content: center;
    background-color: rgba($color-primary, 0.88);
    border-right: 1px solid rgba($color-white, 0.24);
    display: grid;
    padding: 0.65rem;

    @media (max-width: #{$breakpoint-tablet - 1px}) {
      border-bottom: 1px solid rgba($color-white, 0.24);
      border-right: 0;
      align-items: center;
    }
  }

  .editor-area :global(.admin-code-block__select) {
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-text;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-xs;
    font-weight: 800;
    min-width: 0;
    padding: 0.45rem 0.5rem;
    width: 100%;
  }

  .editor-area :global(.admin-code-block__pre) {
    background-color: $color-text;
    border-radius: 0;
    margin: 0;
    min-height: 8rem;
    overflow-x: auto;
    padding: 0.9rem 1rem;
  }

  .editor-area :global(.admin-code-block__code) {
    background: transparent;
    color: #f4f9e1;
    display: block;
    font-size: $fs-sm;
    line-height: 1.7;
    min-height: 6rem;
    padding: 0;
    white-space: pre;
  }

  .editor-area :global(.admin-code-block .hljs-comment),
  .editor-area :global(.admin-code-block .hljs-quote) {
    color: #9cc69b;
    font-style: italic;
  }

  .editor-area :global(.admin-code-block .hljs-keyword),
  .editor-area :global(.admin-code-block .hljs-selector-tag),
  .editor-area :global(.admin-code-block .hljs-meta),
  .editor-area :global(.admin-code-block .hljs-doctag) {
    color: #dbc665;
  }

  .editor-area :global(.admin-code-block .hljs-string),
  .editor-area :global(.admin-code-block .hljs-regexp),
  .editor-area :global(.admin-code-block .hljs-template-variable) {
    color: #bde4a8;
  }

  .editor-area :global(.admin-code-block .hljs-title),
  .editor-area :global(.admin-code-block .hljs-name),
  .editor-area :global(.admin-code-block .hljs-section),
  .editor-area :global(.admin-code-block .hljs-selector-id),
  .editor-area :global(.admin-code-block .hljs-selector-class) {
    color: #79b4a9;
  }

  .editor-area :global(.admin-code-block .hljs-attr),
  .editor-area :global(.admin-code-block .hljs-attribute),
  .editor-area :global(.admin-code-block .hljs-variable),
  .editor-area :global(.admin-code-block .hljs-property) {
    color: #d7f2ba;
  }

  .editor-area :global(.admin-code-block .hljs-number),
  .editor-area :global(.admin-code-block .hljs-literal),
  .editor-area :global(.admin-code-block .hljs-symbol),
  .editor-area :global(.admin-code-block .hljs-bullet) {
    color: #f2d36b;
  }

  .editor-area :global(.admin-code-block .hljs-built_in),
  .editor-area :global(.admin-code-block .hljs-type),
  .editor-area :global(.admin-code-block .hljs-class .hljs-title) {
    color: #f4f9e1;
  }

  .editor-area :global(.mdx-block) {
    background-color: rgba($color-primary, 0.78);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    margin: 1rem 0;
    padding: 0.8rem;
    position: relative;
  }

  .editor-area :global(.mdx-block-head) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }

  .editor-area :global(.mdx-block-title) {
    align-items: center;
    display: inline-flex;
    gap: 0.45rem;
  }

  .editor-area :global(.mdx-block-label) {
    display: inline-flex;
    background-color: $color-accent-1;
    border-radius: 4px;
    color: $color-white;
    font-size: $fs-xs;
    font-weight: 800;
    padding: 0.2rem 0.45rem;
    text-transform: uppercase;
  }

  .editor-area :global(.mdx-collapse-toggle) {
    border-radius: 999px;
    min-height: 1.8rem;
    min-width: 1.8rem;
    padding: 0;
  }

  .editor-area :global(.mdx-block-body.is-collapsed) {
    display: none;
  }

  .editor-area :global(.mdx-block button),
  .editor-area :global(.mdx-block input),
  .editor-area :global(.mdx-block textarea),
  .editor-area :global(.mdx-block select) {
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
  }

  .editor-area :global(.mdx-block button) {
    background-color: rgba(244, 249, 225, 0.72);
    color: $color-text;
    cursor: pointer;
    font-weight: 800;
    padding: 0.45rem 0.6rem;

    &:hover {
      background-color: $color-accent-1;
      color: $color-white;
    }
  }

  .editor-area :global(.mdx-block .mdx-danger) {
    color: $color-error;

    &:hover {
      background-color: $color-error;
      border-color: $color-error;
      color: $color-white;
    }
  }

  .editor-area :global(.mdx-icon-danger),
  .editor-area :global(.mdx-icon-button) {
    align-items: center;
    display: inline-flex;
    justify-content: center;
    min-height: 2rem;
    min-width: 2rem;
    padding: 0.25rem;
    width: auto;
  }

  .editor-area :global(.mdx-block .mdx-icon-danger) {
    color: $color-error;
  }

  .editor-area :global(.mdx-primary) {
    background-color: $color-accent-1;
    color: $color-white;
  }

  .editor-area :global(.mdx-block input),
  .editor-area :global(.mdx-block textarea),
  .editor-area :global(.mdx-block select) {
    background-color: var(--admin-paper);
    color: $color-text;
    min-width: 0;
    padding: 0.45rem 0.55rem;
    width: 100%;
  }

  .editor-area :global(.mdx-fields) {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.65rem;
  }

  .editor-area :global(.mdx-fields--figure),
  .editor-area :global(.mdx-fields--carousel) {
    @include respond-to("tablet") {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .editor-area :global(.mdx-block label) {
    display: grid;
    gap: 0.25rem;
  }

  .editor-area :global(.mdx-block label span) {
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .editor-area :global(.mdx-media-stage) {
    align-items: center;
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.65);
    border-radius: 5px;
    color: $color-text;
    display: flex;
    font-size: $fs-lg;
    font-weight: 800;
    justify-content: center;
    min-height: 18rem;
    overflow: hidden;
    padding: 0;
    width: 100%;
  }

  .editor-area :global(.mdx-media-stage img) {
    border: 0;
    margin: 0;
    max-height: 28rem;
    max-width: 100%;
    object-fit: contain;
  }

  .editor-area :global(.mdx-carousel-viewer) {
    align-items: center;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: 3rem minmax(0, 1fr) 3rem;
  }

  .editor-area :global(.mdx-carousel-stage) {
    min-height: 20rem;
  }

  .editor-area :global(.mdx-carousel-nav) {
    font-size: $fs-xl;
    min-height: 100%;
  }

  .editor-area :global(.mdx-carousel-controls),
  .editor-area :global(.mdx-component-row-actions) {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.65rem;
  }

  .editor-area :global(.mdx-carousel-controls span) {
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
  }

  .editor-area :global(.mdx-sort-backdrop) {
    align-items: center;
    background-color: rgba($color-text, 0.55);
    display: flex;
    inset: 0;
    justify-content: space-between;
    padding: 1rem;
    position: fixed;
    z-index: 150;
  }

  .editor-area :global(.mdx-sort-modal) {
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: grid;
    gap: 0.75rem;
    margin: auto;
    max-height: min(42rem, calc(100dvh - 2rem));
    overflow: auto;
    padding: 1rem;
    width: min(46rem, calc(100vw - 2rem));
  }

  .editor-area :global(.mdx-sort-modal header),
  .editor-area :global(.mdx-sort-modal footer) {
    align-items: center;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .editor-area :global(.mdx-sort-modal h3) {
    margin: 0;
  }

  .editor-area :global(.mdx-sort-grid) {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  }

  .editor-area :global(.mdx-sort-item) {
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    cursor: grab;
    display: grid;
    gap: 0.35rem;
    padding: 0.45rem;
  }

  .editor-area :global(.mdx-sort-item.is-dragging) {
    opacity: 0.72;
    outline: 3px solid $color-accent-2;
  }

  .editor-area :global(.mdx-sort-item img),
  .editor-area :global(.mdx-sort-empty) {
    aspect-ratio: 4 / 3;
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.5);
    object-fit: contain;
    width: 100%;
  }

  .editor-area :global(.mdx-sort-empty) {
    align-items: center;
    color: $color-accent-1;
    display: flex;
    font-size: $fs-xs;
    justify-content: center;
  }

  .editor-area :global(.mdx-component-row-items) {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .editor-area :global(.mdx-row-item),
  .editor-area :global(.mdx-button-inline-wrap) {
    align-items: center;
    display: inline-flex;
    position: relative;
  }

  .editor-area :global(.mdx-editable-pill) {
    align-items: center;
    background-color: $color-accent-1;
    border: 1px solid transparent;
    border-radius: 999px;
    display: inline-flex;
    gap: 0.1rem;
    max-width: 100%;
    padding: 0.28rem 0.35rem 0.28rem 0.7rem;
    width: fit-content;
  }

  .editor-area :global(.mdx-preview-badge) {
    background-color: transparent;
    border: 0;
    color: $color-white;
    font-size: $fs-sm;
    font-weight: 800;
    max-width: 100%;
    min-width: 5ch;
    padding: 0;
    text-align: left;
    width: auto;
  }

  .editor-area :global(.mdx-block .mdx-editable-badge .mdx-preview-badge) {
    background-color: transparent;
    border: 0;
    box-shadow: none;
    color: $color-white;
    padding: 0;
  }

  .editor-area :global(.mdx-block .mdx-pill-delete) {
    background-color: transparent;
    border: 0;
    border-radius: 999px;
    color: $color-error;
    flex: 0 0 auto;
    font-size: $fs-sm;
    line-height: 1;
    min-height: 1.45rem;
    min-width: 1.45rem;
    padding: 0;

    &:hover {
      background-color: rgba($color-error, 0.14);
      color: $color-error;
    }
  }

  .editor-area :global(.mdx-preview-card) {
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: grid;
    gap: 0.55rem;
    padding: 1.25rem;
  }

  .editor-area :global(.mdx-card-title) {
    background-color: transparent;
    border-color: transparent;
    font-size: $fs-lg;
    font-weight: 800;
    padding-inline: 0;
  }

  .editor-area :global(.mdx-card-body) {
    background-color: transparent;
    border-color: transparent;
    line-height: 1.6;
    padding-inline: 0;
  }

  .editor-area :global(.mdx-button-preview) {
    align-items: center;
    background-color: $color-primary;
    border: 2px solid $color-accent-1;
    border-radius: 999px;
    display: inline-flex;
    font-size: $fs-sm;
    font-weight: 800;
    gap: 0.2rem;
    padding: 0.2rem 0.35rem 0.2rem 0.85rem;
    width: fit-content;
  }

  .editor-area :global(.mdx-block .mdx-button-label) {
    background-color: transparent;
    border: 0;
    color: inherit;
    min-height: 1.8rem;
    padding: 0 0.2rem;

    &:hover {
      background-color: transparent;
      color: inherit;
    }
  }

  .editor-area :global(.mdx-button-preview--secondary) {
    background-color: $color-accent-1;
    color: $color-white;
  }

  .editor-area :global(.mdx-button-preview--danger) {
    background-color: $color-error;
    border-color: $color-error;
    color: $color-white;
  }

  .editor-area :global(.mdx-button-preview--warning) {
    border-color: $color-warning;
  }

  .editor-area :global(.mdx-button-popover) {
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    box-shadow: 0 0.75rem 1.6rem rgba($color-text, 0.18);
    display: grid;
    gap: 0.45rem;
    left: 0;
    min-width: min(22rem, calc(100vw - 3rem));
    padding: 0.75rem;
    position: absolute;
    top: calc(100% + 0.35rem);
    z-index: 30;
  }

  .editor-area :global(.mdx-table-preview) {
    display: grid;
    gap: 0.65rem;
  }

  .editor-area :global(.mdx-table-canvas) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.25rem;
    grid-template-rows: minmax(0, auto) 2.25rem;
    position: relative;
  }

  .editor-area :global(.mdx-table-scroll) {
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.65);
    border-radius: 5px 0 0 0;
    overflow-x: auto;
  }

  .editor-area :global(.mdx-preview-table) {
    border-collapse: collapse;
    min-width: 100%;
    width: 100%;
  }

  .editor-area :global(.mdx-preview-table th),
  .editor-area :global(.mdx-preview-table td) {
    border: 1px solid rgba($color-accent-1, 0.28);
    padding: 0.35rem;
  }

  .editor-area :global(.mdx-preview-table th) {
    background-color: rgba($color-accent-1, 0.08);
    color: $color-text;
  }

  .editor-area :global(.mdx-preview-table th) {
    min-width: 12rem;
    vertical-align: top;
  }

  .editor-area :global(.mdx-preview-table th input) {
    background-color: transparent;
    border-color: transparent;
    color: $color-text;
    font-weight: 800;
    padding: 0.35rem;
  }

  .editor-area :global(.mdx-preview-table td input) {
    background-color: transparent;
    border-color: transparent;
    min-height: 2.35rem;
  }

  .editor-area :global(.mdx-table-header-cell) {
    align-items: center;
    display: flex;
    gap: 0.25rem;
  }

  .editor-area :global(.mdx-table-handle-cell) {
    min-width: 2.4rem;
    width: 2.4rem;
  }

  .editor-area :global(.mdx-table-grip) {
    color: rgba($color-accent-1, 0.65);
    display: inline-flex;
    font-weight: 800;
    justify-content: center;
    width: 100%;
  }

  .editor-area :global(.mdx-block .mdx-table-mini-action) {
    background-color: transparent;
    border: 0;
    color: rgba($color-text, 0.55);
    min-height: 1.6rem;
    min-width: 1.6rem;
    padding: 0;

    &:hover {
      background-color: rgba($color-error, 0.12);
      color: $color-error;
    }
  }

  .editor-area :global(.mdx-table-add-column),
  .editor-area :global(.mdx-table-add-row) {
    background-color: rgba($color-text, 0.04);
    border: 1px solid rgba($color-accent-1, 0.18);
    color: rgba($color-text, 0.55);
    font-size: $fs-lg;
    min-height: 100%;
    min-width: 100%;
    padding: 0;

    &:hover {
      background-color: rgba($color-accent-2, 0.45);
      color: $color-text;
    }
  }

  .editor-area :global(.mdx-table-add-column) {
    border-radius: 0 5px 0 0;
    grid-column: 2;
    grid-row: 1;
  }

  .editor-area :global(.mdx-table-add-row) {
    border-radius: 0 0 5px 5px;
    grid-column: 1 / 3;
    grid-row: 2;
  }

  .editor-area :global(.mdx-table-caption) {
    max-width: 28rem;
  }

  .editor-area :global(.mdx-empty-copy) {
    color: $color-accent-1;
    margin: 0.5rem 0;
  }

  .editor-area :global(.mdx-raw-source) {
    min-height: 9rem;
  }

  .inspector {
    display: grid;
    gap: 1rem;

    @include respond-to("desktop") {
      position: sticky;
      top: 9rem;
      max-height: calc(100vh - 10rem);
      overflow-y: auto;
      padding-right: 0.15rem;
    }
  }

  .panel {
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.85rem;
  }

  .eyebrow,
  label > span,
  .tags > span,
  .list-title > span {
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .eyebrow {
    margin: 0;
  }

  label,
  .tags {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
  }

  input,
  textarea,
  select {
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-text;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    padding: 0.55rem 0.65rem;
    width: 100%;
  }

  textarea {
    resize: vertical;
  }

  .input-action {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.45rem;
  }

  .split {
    display: grid;
    gap: 0.65rem;

    @include respond-to("tablet") {
      grid-template-columns: 1fr 1fr;
    }
  }

  .check {
    align-items: center;
    flex-direction: row;
    gap: 0.5rem;

    input {
      width: auto;
    }
  }

  .chips {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;

    button {
      align-items: center;
      background-color: $color-accent-2;
      border: 0;
      border-radius: 999px;
      color: $color-text;
      cursor: pointer;
      display: inline-flex;
      gap: 0.25rem;
      font: inherit;
      font-size: $fs-xs;
      font-weight: 800;
      padding: 0.25rem 0.55rem;
    }
  }

  .list-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .hint-card {
    background-color: rgba(244, 249, 225, 0.55);
    border: 1px solid rgba($color-accent-1, 0.5);
    border-radius: 5px;
    display: grid;
    gap: 0.3rem;
    padding: 0.6rem 0.75rem;
    font-size: $fs-xs;

    strong {
      color: $color-text;
    }

    p {
      color: $color-accent-1;
      margin: 0;
    }

    code {
      background-color: rgba($color-accent-1, 0.18);
      border-radius: 3px;
      font-family: "JetBrains Mono", monospace;
      padding: 0 0.2rem;
    }
  }

  .bottom-actions .danger {
    &.danger,
    &.danger:hover {
      background-color: $color-error;
      border-color: $color-error;
      color: $color-white;
    }
  }

  .bottom-actions {
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    padding: 0.75rem;
  }

  .saved {
    color: $color-link;
    font-size: $fs-sm;
    font-weight: 800;
  }

  .error-text {
    color: $color-error;
    font-size: $fs-sm;
    font-weight: 800;
  }

  .muted {
    color: $color-accent-1;
    font-size: $fs-sm;
  }

  :global(.media-picker-portal .picker-backdrop) {
    align-items: center;
    background-color: rgba($color-text, 0.58);
    display: flex;
    inset: 0;
    justify-content: center;
    overflow-y: auto;
    padding: clamp(0.75rem, 2vw, 1.25rem);
    position: fixed;
    z-index: 140;
  }

  :global(.media-picker-portal .picker) {
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    box-shadow: 0 1.2rem 3rem rgba($color-text, 0.22);
    color: $color-text;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: min(54rem, calc(100dvh - 2rem));
    overflow: hidden;
    padding: 0.9rem;
    width: min(72rem, calc(100vw - 1.5rem));
  }

  :global(.media-picker-portal .picker > header) {
    align-items: center;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
  }

  :global(.media-picker-portal .picker h2) {
    font-size: $fs-xl;
    line-height: 1.1;
    margin: 0;
  }

  :global(.media-picker-portal .eyebrow),
  :global(.media-picker-portal label span) {
    color: $color-accent-1;
    font-size: $fs-xs;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0;
    text-transform: uppercase;
  }

  :global(.media-picker-portal button),
  :global(.media-picker-portal input),
  :global(.media-picker-portal select) {
    font-family: "JetBrains Mono", monospace;
  }

  :global(.media-picker-portal button) {
    cursor: pointer;
  }

  :global(.media-picker-portal .icon-btn) {
    align-items: center;
    background-color: $color-accent-1;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-white;
    display: inline-flex;
    justify-content: center;
    min-height: 2.25rem;
    min-width: 2.25rem;
    padding: 0.35rem;
  }

  :global(.media-picker-portal .picker-toolbar) {
    align-items: stretch;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;

    @include respond-to("tablet") {
      flex-direction: row;
    }
  }

  :global(.media-picker-portal .search-box),
  :global(.media-picker-portal .upload-card label),
  :global(.media-picker-portal .file-btn) {
    align-items: center;
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-accent-1;
    display: flex;
    font-size: $fs-xs;
    font-weight: 800;
    gap: 0.35rem;
    padding: 0.45rem 0.6rem;
    text-transform: uppercase;
  }

  :global(.media-picker-portal .search-box) {
    flex: 1;
  }

  :global(.media-picker-portal input),
  :global(.media-picker-portal select) {
    background-color: transparent;
    border: 0;
    color: $color-text;
    font-size: $fs-sm;
    min-width: 0;
    outline: 0;
    text-transform: none;
    width: 100%;
  }

  :global(.media-picker-portal .breadcrumbs) {
    align-items: center;
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.4rem 0.5rem;
  }

  :global(.media-picker-portal .breadcrumbs button) {
    background-color: transparent;
    border: 0;
    border-radius: 4px;
    color: $color-accent-1;
    font-size: $fs-sm;
    font-weight: 800;
    padding: 0.2rem 0.35rem;
  }

  :global(.media-picker-portal .breadcrumbs button.active),
  :global(.media-picker-portal .breadcrumbs button:hover) {
    background-color: rgba($color-accent-1, 0.12);
    color: $color-text;
  }

  :global(.media-picker-portal .picker-body) {
    display: grid;
    gap: 0.75rem;
    min-height: 0;

    @include respond-to("desktop") {
      grid-template-columns: minmax(0, 1fr) 19rem;
    }
  }

  :global(.media-picker-portal .drive-panel),
  :global(.media-picker-portal .side-panel) {
    background-color: var(--admin-paper);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
  }

  :global(.media-picker-portal .drive-panel) {
    min-height: 28rem;
    overflow-y: auto;
    padding: 0.75rem;
  }

  :global(.media-picker-portal .drive-grid) {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  }

  :global(.media-picker-portal .folder-card),
  :global(.media-picker-portal .media-tile) {
    background-color: $color-primary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-text;
    display: grid;
    gap: 0.35rem;
    padding: 0.55rem;
    text-align: left;
  }

  :global(.media-picker-portal .folder-card:hover),
  :global(.media-picker-portal .media-tile:hover),
  :global(.media-picker-portal .media-tile.selected) {
    outline: 3px solid $color-accent-2;
    outline-offset: 1px;
  }

  :global(.media-picker-portal .folder-card) {
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 4.75rem;
  }

  :global(.media-picker-portal .folder-card svg) {
    color: $color-accent-1;
    grid-row: span 2;
  }

  :global(.media-picker-portal .media-tile img) {
    aspect-ratio: 4 / 3;
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.5);
    border-radius: 4px;
    object-fit: contain;
    width: 100%;
  }

  :global(.media-picker-portal .folder-card span),
  :global(.media-picker-portal .media-tile span),
  :global(.media-picker-portal .media-tile small),
  :global(.media-picker-portal .folder-card small) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.media-picker-portal .media-tile small),
  :global(.media-picker-portal .folder-card small),
  :global(.media-picker-portal .path),
  :global(.media-picker-portal .muted) {
    color: $color-accent-1;
    font-size: $fs-xs;
  }

  :global(.media-picker-portal .side-panel) {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    overflow-y: auto;
    padding: 0.75rem;
  }

  :global(.media-picker-portal .preview),
  :global(.media-picker-portal .empty-preview) {
    aspect-ratio: 4 / 3;
    background-color: $color-primary;
    border: 1px solid rgba($color-accent-1, 0.65);
    border-radius: 5px;
    width: 100%;
  }

  :global(.media-picker-portal .preview) {
    object-fit: contain;
  }

  :global(.media-picker-portal .empty-preview) {
    align-items: center;
    color: $color-accent-1;
    display: grid;
    justify-items: center;
    padding: 1rem;
    text-align: center;
  }

  :global(.media-picker-portal .path) {
    overflow-wrap: anywhere;
  }

  :global(.media-picker-portal .primary) {
    align-items: center;
    background-color: $color-accent-1;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    color: $color-white;
    display: inline-flex;
    font-size: $fs-sm;
    font-weight: 800;
    gap: 0.35rem;
    justify-content: center;
    padding: 0.55rem 0.8rem;
  }

  :global(.media-picker-portal .primary:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }

  :global(.media-picker-portal .upload-card) {
    border-top: 1px solid rgba($color-accent-1, 0.5);
    display: grid;
    gap: 0.5rem;
    padding-top: 0.75rem;
  }

  :global(.media-picker-portal .file-btn) {
    cursor: pointer;
  }

  :global(.media-picker-portal .file-btn input[type="file"]) {
    display: none;
  }

  :global(.media-picker-portal .error) {
    background-color: $color-error;
    border-radius: 5px;
    color: $color-white;
    font-size: $fs-sm;
    font-weight: 800;
    margin: 0;
    padding: 0.55rem 0.75rem;
  }

  :global(.media-picker-portal .spin) {
    animation: spin 0.8s linear infinite;
    display: inline-flex;
  }

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 110;
    background-color: rgba($color-text, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .link-dialog {
    background-color: $color-tertiary;
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    width: min(26rem, 100%);

    div {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
  }
</style>
