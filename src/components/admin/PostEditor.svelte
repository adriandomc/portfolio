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
    Heading2,
    Heading3,
    ImagePlus,
    Italic,
    Link2,
    List,
    ListOrdered,
    Quote,
    Save,
    Strikethrough,
    Trash2,
    X,
  } from "@lucide/svelte";
  import {
    COMPONENT_SPECS,
    customComponentExtensions,
  } from "../../lib/admin/editor/extensions";
  import type {
    BlogFrontmatter,
    Collection,
    Frontmatter,
    ProjectFrontmatter,
  } from "../../lib/admin/posts";
  import type { MediaRoot } from "../../lib/admin/media";
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
    | { kind: "projectImage"; index: number }
    | { kind: "blockFigure" }
    | { kind: "blockCarousel"; index: number };

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
  let editingBlockPos = $state<number | null>(null);
  let editingBlockNodeName = $state<string | null>(null);
  let editingBlockAttrs = $state<Record<string, unknown> | null>(null);
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
  const blockLabel = $derived(
    editingBlockNodeName
      ? editingBlockNodeName === "rawMdxBlock"
        ? "Raw MDX"
        : editingBlockNodeName.replace(/^mdx/, "")
      : "",
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
        ...customComponentExtensions,
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

  function openBlockEditor(pos: number) {
    if (!editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editingBlockPos = pos;
    editingBlockNodeName = node.type.name;
    editingBlockAttrs = JSON.parse(JSON.stringify(node.attrs));
  }

  function saveBlockAttrs() {
    if (!editor || editingBlockPos === null || !editingBlockAttrs) return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeMarkup(editingBlockPos!, undefined, editingBlockAttrs!);
        return true;
      })
      .run();
    editingBlockPos = null;
    editingBlockNodeName = null;
    editingBlockAttrs = null;
    markDirty();
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
    markDirty();
  }

  function setBlockField(key: string, value: unknown) {
    editingBlockAttrs = { ...(editingBlockAttrs ?? {}), [key]: value };
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

  function updateProjectImage(index: number, field: "src" | "alt", value: string) {
    const images = [...projectImages()];
    images[index] = { ...(images[index] ?? { src: "", alt: "" }), [field]: value };
    projFm.images = images;
    markDirty();
  }

  function addProjectImage() {
    projFm.images = [...projectImages(), { src: "", alt: "" }];
    markDirty();
  }

  function removeProjectImage(index: number) {
    const images = [...projectImages()];
    images.splice(index, 1);
    projFm.images = images;
    markDirty();
  }

  function moveProjectImage(index: number, direction: -1 | 1) {
    const images = [...projectImages()];
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    [images[index], images[target]] = [images[target], images[index]];
    projFm.images = images;
    markDirty();
  }

  function blockImages() {
    return Array.isArray(editingBlockAttrs?.images)
      ? ([...(editingBlockAttrs.images as Array<{ src: string; alt: string }>)] as Array<{
          src: string;
          alt: string;
        }>)
      : [];
  }

  function updateBlockImage(index: number, field: "src" | "alt", value: string) {
    const images = blockImages();
    images[index] = { ...(images[index] ?? { src: "", alt: "" }), [field]: value };
    setBlockField("images", images);
  }

  function addBlockImage() {
    setBlockField("images", [...blockImages(), { src: "", alt: "" }]);
  }

  function removeBlockImage(index: number) {
    const images = blockImages();
    images.splice(index, 1);
    setBlockField("images", images);
  }

  function updateTableHeaders(value: string) {
    const headers = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setBlockField("headers", headers);
  }

  function tableRows() {
    return Array.isArray(editingBlockAttrs?.data)
      ? ([...(editingBlockAttrs.data as Array<Record<string, unknown>>)] as Array<
          Record<string, unknown>
        >)
      : [];
  }

  function addTableRow() {
    const headers = Array.isArray(editingBlockAttrs?.headers)
      ? (editingBlockAttrs.headers as string[])
      : [];
    const row: Record<string, unknown> = {};
    headers.forEach((header) => (row[header] = ""));
    setBlockField("data", [...tableRows(), row]);
  }

  function updateTableCell(index: number, header: string, value: string) {
    const rows = tableRows();
    rows[index] = { ...(rows[index] ?? {}), [header]: value };
    setBlockField("data", rows);
  }

  function removeTableRow(index: number) {
    const rows = tableRows();
    rows.splice(index, 1);
    setBlockField("data", rows);
  }

  function chooseMedia(path: string) {
    if (!pickerTarget) return;
    if (pickerTarget.kind === "bodyImage") {
      editor?.chain().focus().setImage({ src: path, alt: "" }).run();
    } else if (pickerTarget.kind === "blogCover") {
      blogFm.image = path;
      markDirty();
    } else if (pickerTarget.kind === "projectImage") {
      updateProjectImage(pickerTarget.index, "src", path);
    } else if (pickerTarget.kind === "blockFigure") {
      setBlockField("src", path);
    } else if (pickerTarget.kind === "blockCarousel") {
      updateBlockImage(pickerTarget.index, "src", path);
    }
    pickerTarget = null;
  }

  function findBlockPosByElement(el: HTMLElement): number | null {
    if (!editor) return null;
    const rect = el.getBoundingClientRect();
    const result = editor.view.posAtCoords({
      left: rect.left + 4,
      top: rect.top + 4,
    });
    if (!result) return null;
    const resolved = editor.view.state.doc.resolve(
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
        onclick={handleEditorClick}
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
          <div class="image-list">
            <div class="list-title">
              <span>Project images</span>
              <button type="button" onclick={addProjectImage}>Add</button>
            </div>
            {#each projectImages() as image, index}
              <div class="image-row">
                <input value={image.src} oninput={(event) => updateProjectImage(index, "src", (event.currentTarget as HTMLInputElement).value)} placeholder="/images/..." />
                <input value={image.alt} oninput={(event) => updateProjectImage(index, "alt", (event.currentTarget as HTMLInputElement).value)} placeholder="Alt text" />
                <div class="row-actions">
                  <button type="button" onclick={() => (pickerTarget = { kind: "projectImage", index })}>Pick</button>
                  <button type="button" onclick={() => moveProjectImage(index, -1)}>Up</button>
                  <button type="button" onclick={() => moveProjectImage(index, 1)}>Down</button>
                  <button type="button" class="danger" onclick={() => removeProjectImage(index)}>Remove</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <label class="check">
          <input type="checkbox" bind:checked={frontmatter.draft} onchange={markDirty} />
          <span>Draft (excluded from build)</span>
        </label>
      </section>

      <section class="panel">
        <p class="eyebrow">Block inspector</p>
        {#if editingBlockNodeName && editingBlockAttrs}
          <h2>{blockLabel}</h2>
          {#if editingBlockNodeName === "rawMdxBlock"}
            <label>
              <span>MDX source</span>
              <textarea rows="8" value={String(editingBlockAttrs.source ?? "")} oninput={(event) => setBlockField("source", (event.currentTarget as HTMLTextAreaElement).value)}></textarea>
            </label>
          {:else if editingBlockNodeName === "mdxFigure"}
            <label>
              <span>Image path</span>
              <div class="input-action">
                <input value={String(editingBlockAttrs.src ?? "")} oninput={(event) => setBlockField("src", (event.currentTarget as HTMLInputElement).value)} />
                <button type="button" onclick={() => (pickerTarget = { kind: "blockFigure" })}>Pick</button>
              </div>
            </label>
            <label><span>Alt</span><input value={String(editingBlockAttrs.alt ?? "")} oninput={(event) => setBlockField("alt", (event.currentTarget as HTMLInputElement).value)} /></label>
            <label><span>Caption</span><textarea rows="3" value={String(editingBlockAttrs.caption ?? "")} oninput={(event) => setBlockField("caption", (event.currentTarget as HTMLTextAreaElement).value)}></textarea></label>
            <div class="split">
              <label><span>Width</span><input value={String(editingBlockAttrs.width ?? "")} oninput={(event) => setBlockField("width", (event.currentTarget as HTMLInputElement).value || null)} /></label>
              <label><span>Max width</span><input value={String(editingBlockAttrs.maxWidth ?? "")} oninput={(event) => setBlockField("maxWidth", (event.currentTarget as HTMLInputElement).value || null)} /></label>
            </div>
          {:else if editingBlockNodeName === "mdxImageCarousel"}
            <div class="image-list">
              <div class="list-title">
                <span>Carousel images</span>
                <button type="button" onclick={addBlockImage}>Add</button>
              </div>
              {#each blockImages() as image, index}
                <div class="image-row">
                  <input value={image.src} oninput={(event) => updateBlockImage(index, "src", (event.currentTarget as HTMLInputElement).value)} placeholder="/images/..." />
                  <input value={image.alt} oninput={(event) => updateBlockImage(index, "alt", (event.currentTarget as HTMLInputElement).value)} placeholder="Alt text" />
                  <div class="row-actions">
                    <button type="button" onclick={() => (pickerTarget = { kind: "blockCarousel", index })}>Pick</button>
                    <button type="button" class="danger" onclick={() => removeBlockImage(index)}>Remove</button>
                  </div>
                </div>
              {/each}
            </div>
            <label><span>Caption</span><textarea rows="3" value={String(editingBlockAttrs.caption ?? "")} oninput={(event) => setBlockField("caption", (event.currentTarget as HTMLTextAreaElement).value)}></textarea></label>
            <div class="split">
              <label><span>Aspect ratio</span><input value={String(editingBlockAttrs.aspectRatio ?? "")} oninput={(event) => setBlockField("aspectRatio", (event.currentTarget as HTMLInputElement).value)} /></label>
              <label><span>Object fit</span><select value={String(editingBlockAttrs.objectFit ?? "contain")} onchange={(event) => setBlockField("objectFit", (event.currentTarget as HTMLSelectElement).value)}><option value="contain">contain</option><option value="cover">cover</option><option value="fill">fill</option></select></label>
            </div>
            <label><span>Max width</span><input value={String(editingBlockAttrs.maxWidth ?? "")} oninput={(event) => setBlockField("maxWidth", (event.currentTarget as HTMLInputElement).value)} /></label>
          {:else if editingBlockNodeName === "mdxCard"}
            <label><span>Title</span><input value={String(editingBlockAttrs.title ?? "")} oninput={(event) => setBlockField("title", (event.currentTarget as HTMLInputElement).value)} /></label>
            <label><span>Body</span><textarea rows="4" value={String(editingBlockAttrs.caption ?? "")} oninput={(event) => setBlockField("caption", (event.currentTarget as HTMLTextAreaElement).value)}></textarea></label>
          {:else if editingBlockNodeName === "mdxBadge"}
            <label><span>Text</span><input value={String(editingBlockAttrs.title ?? "")} oninput={(event) => setBlockField("title", (event.currentTarget as HTMLInputElement).value)} /></label>
          {:else if editingBlockNodeName === "mdxButton"}
            <label><span>Label</span><input value={String(editingBlockAttrs.label ?? "")} oninput={(event) => setBlockField("label", (event.currentTarget as HTMLInputElement).value)} /></label>
            <label><span>Href</span><input value={String(editingBlockAttrs.href ?? "")} oninput={(event) => setBlockField("href", (event.currentTarget as HTMLInputElement).value)} /></label>
            <div class="split">
              <label><span>Variant</span><select value={String(editingBlockAttrs.variant ?? "primary")} onchange={(event) => setBlockField("variant", (event.currentTarget as HTMLSelectElement).value)}><option value="primary">primary</option><option value="secondary">secondary</option><option value="danger">danger</option><option value="warning">warning</option></select></label>
              <label><span>Target</span><select value={String(editingBlockAttrs.target ?? "")} onchange={(event) => setBlockField("target", (event.currentTarget as HTMLSelectElement).value || null)}><option value="">same tab</option><option value="_blank">new tab</option></select></label>
            </div>
          {:else if editingBlockNodeName === "mdxTable"}
            <label><span>Headers</span><input value={Array.isArray(editingBlockAttrs.headers) ? (editingBlockAttrs.headers as string[]).join(", ") : ""} oninput={(event) => updateTableHeaders((event.currentTarget as HTMLInputElement).value)} /></label>
            <label><span>Caption</span><input value={String(editingBlockAttrs.caption ?? "")} oninput={(event) => setBlockField("caption", (event.currentTarget as HTMLInputElement).value || null)} /></label>
            <div class="image-list">
              <div class="list-title">
                <span>Rows</span>
                <button type="button" onclick={addTableRow}>Add row</button>
              </div>
              {#each tableRows() as row, index}
                <div class="table-row">
                  {#each (editingBlockAttrs.headers as string[]) ?? [] as header}
                    <label><span>{header}</span><input value={String(row[header] ?? "")} oninput={(event) => updateTableCell(index, header, (event.currentTarget as HTMLInputElement).value)} /></label>
                  {/each}
                  <button type="button" class="danger" onclick={() => removeTableRow(index)}>Remove row</button>
                </div>
              {/each}
            </div>
          {/if}
          <div class="block-actions">
            <button type="button" onclick={saveBlockAttrs}>Apply block</button>
            <button type="button" class="danger" onclick={deleteBlock}>
              <Trash2 size={15} />
              Delete block
            </button>
          </div>
        {:else}
          <p class="muted">Click a MDX component block in the editor to edit its props here.</p>
        {/if}
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
    <section class="link-dialog" role="dialog" aria-modal="true" aria-label="Edit link">
      <h2>Link</h2>
      <input bind:value={linkUrl} placeholder="https://..." autofocus />
      <div>
        <button type="button" onclick={() => (linkOpen = false)}>Cancel</button>
        <button type="button" onclick={applyLink}>Apply</button>
      </div>
    </section>
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
  .bottom-actions,
  .block-actions,
  .row-actions {
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
  .block-actions button,
  .list-title button,
  .row-actions button,
  .input-action button,
  .link-dialog button {
    border: 1px solid $color-accent-1;
    border-radius: 5px;
    background-color: rgba($color-white, 0.4);
    color: $color-text;
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-size: $fs-sm;
    font-weight: 800;
    min-height: 2.25rem;
    padding: 0.45rem 0.6rem;

    &:hover,
    &.active {
      background-color: $color-accent-1;
      color: $color-white;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
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
    background-color: $color-white;
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
    background-color: rgba($color-primary, 0.75);
    border: 2px dashed $color-accent-1;
    border-radius: 5px;
    cursor: pointer;
    margin: 1rem 0;
    padding: 1rem;

    &::before {
      content: attr(data-mdx);
      display: inline-flex;
      background-color: $color-accent-1;
      border-radius: 4px;
      color: $color-white;
      font-size: $fs-xs;
      font-weight: 800;
      margin-bottom: 0.45rem;
      padding: 0.2rem 0.45rem;
      text-transform: uppercase;
    }

    &.raw::before {
      content: "Raw MDX";
    }

    &:hover {
      background-color: $color-secondary;
    }
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
    background-color: $color-white;
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

  .image-list,
  .image-row,
  .table-row {
    display: grid;
    gap: 0.5rem;
  }

  .list-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .image-row,
  .table-row {
    background-color: rgba($color-white, 0.5);
    border: 1px solid rgba($color-accent-1, 0.45);
    border-radius: 5px;
    padding: 0.55rem;
  }

  .row-actions button,
  .block-actions button,
  .bottom-actions .danger {
    &.danger,
    &.danger:hover {
      background-color: $color-error;
      border-color: $color-error;
      color: $color-white;
    }
  }

  .block-actions {
    justify-content: space-between;
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
