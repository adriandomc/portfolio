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
    Strikethrough,
    X,
  } from "@lucide/svelte";
  import {
    COMPONENT_SPECS,
    createCustomComponentExtensions,
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

  let slug = $state(initialSlug === "new" ? "" : initialSlug);
  let frontmatter = $state<Frontmatter>(
    JSON.parse(JSON.stringify(initialFrontmatter)),
  );
  let sha = $state(initialSha);
  let saving = $state(false);
  let dirty = $state(false);
  let saveStatus = $state<"idle" | "saved" | "error">("idle");
  let saveError = $state<string | null>(null);
  let confirmingDelete = $state(false);
  let wordCount = $state(0);
  let mounted = $state(false);
  let lastSavedMeta = $state(JSON.stringify({ slug, frontmatter }));
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
          placeholder: "Start writing your post...",
        }),
        ...createCustomComponentExtensions({
          openMediaPicker: (target) => {
            pickerTarget = target;
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
  });

  onDestroy(() => {
    editor?.destroy();
  });

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
    linkOpen = false;
    markDirty();
  }

  function insertCustomBlock(specName: string) {
    const spec = COMPONENT_SPECS.find((item) => item.name === specName);
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

  function projectImages() {
    return Array.isArray(projFm.images) ? projFm.images : [];
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
    if (!pickerTarget) return;
    if (pickerTarget.kind === "bodyImage") {
      editor?.chain().focus().setImage({ src: path, alt: "" }).run();
    } else if (pickerTarget.kind === "blogCover") {
      blogFm.image = path;
      markDirty();
    } else if (pickerTarget.kind === "blockFigure") {
      updateBlockAttrsAt(pickerTarget.pos, (attrs) => ({ ...attrs, src: path }));
    } else if (pickerTarget.kind === "blockCarousel") {
      updateBlockAttrsAt(pickerTarget.pos, (attrs) => {
        const images = Array.isArray(attrs.images)
          ? ([...(attrs.images as Array<{ src: string; alt: string }>)] as Array<{
              src: string;
              alt: string;
            }>)
          : [];
        images[pickerTarget.index] = {
          ...(images[pickerTarget.index] ?? { src: "", alt: "" }),
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
</script>

<section class="editor-workspace">
  <header class="editor-topbar">
    <a href={`/admin/${collection}`}>/{collection}</a>
    <div class="toolbar" role="toolbar">
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
      <button type="button" class:active={isActive("codeBlock")} onclick={() => exec(() => editor!.chain().focus().toggleCodeBlock().run())} aria-label="Code block">
        <Code size={16} />
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
      <div
        class="editor-area"
        bind:this={editorEl}
        role="textbox"
        tabindex="0"
      ></div>
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
          <div class="split">
            <label>
              <span>Order</span>
              <input
                type="number"
                value={projFm.order ?? ""}
                oninput={(event) => {
                  const value = (event.currentTarget as HTMLInputElement).value;
                  projFm.order = value === "" ? undefined : Number(value);
                  markDirty();
                }}
              />
            </label>
            <label class="check">
              <input type="checkbox" bind:checked={projFm.featured} onchange={markDirty} />
              <span>Featured</span>
            </label>
          </div>
          <div class="project-images">
            <div class="list-title">
              <span>Project images</span>
            </div>
            <div class="project-gallery" aria-label="Project images preview">
              {#each projectImages() as image, index}
                <figure>
                  {#if image.src}
                    <img src={image.src} alt={image.alt} loading="lazy" />
                  {:else}
                    <div class="image-placeholder">No image</div>
                  {/if}
                  <figcaption>
                    <strong>{index + 1}. {image.alt || "Untitled image"}</strong>
                    <span>{image.src || "No path"}</span>
                  </figcaption>
                </figure>
              {:else}
                <p class="muted">No project images configured.</p>
              {/each}
            </div>
          </div>
        {/if}

        <label class="check">
          <input type="checkbox" bind:checked={frontmatter.draft} onchange={markDirty} />
          <span>Draft (excluded from build)</span>
        </label>
      </section>

      <section class="panel">
        <p class="eyebrow">MDX blocks</p>
        <p class="muted">Component blocks are edited directly in the canvas. Use each block's inline controls to change copy, images, tables, and links.</p>
      </section>
    </aside>
  </div>

  <div class="bottom-actions">
    <button type="button" class="save-btn" onclick={save} disabled={saving}>
      <Save size={16} />
      {saving ? "Saving..." : isNew ? "Create post" : "Save"}
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
  <MediaPicker
    title="Select image"
    defaultRoot="images"
    defaultFolder={defaultMediaFolder}
    onSelect={chooseMedia}
    onClose={() => (pickerTarget = null)}
  />
{/if}

{#if linkOpen}
  <div class="dialog-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && (linkOpen = false)}>
    <div class="link-dialog" role="dialog" aria-modal="true" aria-label="Edit link">
      <h2>Link</h2>
      <input bind:value={linkUrl} placeholder="https://..." />
      <div>
        <button type="button" onclick={() => (linkOpen = false)}>Cancel</button>
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

  .editor-area :global(.mdx-block) {
    background-color: rgba($color-primary, 0.78);
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    margin: 1rem 0;
    padding: 0.8rem;
  }

  .editor-area :global(.mdx-block-head) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
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

  .editor-area :global(.mdx-fields--media) {
    @include respond-to("tablet") {
      grid-template-columns: minmax(0, 1fr) auto minmax(8rem, 0.8fr);
    }
  }

  .editor-area :global(.mdx-fields--carousel),
  .editor-area :global(.mdx-fields--button) {
    @include respond-to("tablet") {
      grid-template-columns: repeat(3, minmax(0, 1fr));
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

  .editor-area :global(.mdx-figure-preview),
  .editor-area :global(.mdx-empty-media) {
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.65);
    border-radius: 5px;
    min-height: 11rem;
  }

  .editor-area :global(.mdx-figure-preview) {
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  .editor-area :global(.mdx-figure-preview img) {
    border: 0;
    margin: 0;
    max-height: 22rem;
    max-width: 100%;
    object-fit: contain;
  }

  .editor-area :global(.mdx-empty-media) {
    align-items: center;
    color: $color-accent-1;
    display: inline-flex;
    justify-content: center;
    width: 100%;
  }

  .editor-area :global(.mdx-carousel-strip) {
    display: grid;
    gap: 0.65rem;

    @include respond-to("tablet") {
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    }
  }

  .editor-area :global(.mdx-carousel-item) {
    background-color: rgba(244, 249, 225, 0.58);
    border: 1px solid rgba($color-accent-1, 0.55);
    border-radius: 5px;
    display: grid;
    gap: 0.4rem;
    padding: 0.5rem;
  }

  .editor-area :global(.mdx-carousel-item img) {
    aspect-ratio: 4 / 3;
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.5);
    margin: 0;
    object-fit: contain;
    width: 100%;
  }

  .editor-area :global(.mdx-mini-actions),
  .editor-area :global(.mdx-badge-row) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .editor-area :global(.mdx-preview-badge) {
    align-self: center;
    background-color: $color-accent-1;
    border-radius: 999px;
    color: $color-white;
    display: inline-flex;
    font-size: $fs-sm;
    font-weight: 800;
    padding: 0.35rem 0.75rem;
  }

  .editor-area :global(.mdx-preview-card) {
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.6);
    border-radius: 5px;
    display: grid;
    gap: 0.55rem;
    padding: 0.75rem;
  }

  .editor-area :global(.mdx-card-title) {
    font-size: $fs-lg;
    font-weight: 800;
  }

  .editor-area :global(.mdx-button-preview) {
    border: 2px solid $color-accent-1;
    border-radius: 999px;
    display: inline-flex;
    font-size: $fs-sm;
    font-weight: 800;
    margin-bottom: 0.65rem;
    padding: 0.45rem 1rem;
    width: fit-content;
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

  .editor-area :global(.mdx-preview-table) {
    border-collapse: collapse;
    width: 100%;
  }

  .editor-area :global(.mdx-preview-table th),
  .editor-area :global(.mdx-preview-table td) {
    border: 1px solid $color-accent-1;
    padding: 0.35rem;
  }

  .editor-area :global(.mdx-preview-table th) {
    background-color: $color-accent-1;
    color: $color-white;
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

  .project-images,
  .project-gallery {
    display: grid;
    gap: 0.6rem;
  }

  .project-gallery {
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  }

  .project-gallery figure {
    background-color: rgba(244, 249, 225, 0.55);
    border: 1px solid rgba($color-accent-1, 0.5);
    border-radius: 5px;
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0.45rem;
  }

  .project-gallery img,
  .image-placeholder {
    aspect-ratio: 4 / 3;
    background-color: var(--admin-paper);
    border: 1px solid rgba($color-accent-1, 0.55);
    border-radius: 4px;
    object-fit: contain;
    width: 100%;
  }

  .image-placeholder {
    align-items: center;
    color: $color-accent-1;
    display: flex;
    font-size: $fs-xs;
    justify-content: center;
  }

  .project-gallery figcaption {
    display: grid;
    gap: 0.2rem;
    font-size: $fs-xs;

    span {
      color: $color-accent-1;
      overflow-wrap: anywhere;
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
