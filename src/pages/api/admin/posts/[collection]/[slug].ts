import type { APIRoute } from "astro";
import {
  COLLECTIONS,
  removePost,
  savePost,
  slugify,
  type Collection,
  type Frontmatter,
  type BlogFrontmatter,
  type ProjectFrontmatter,
} from "../../../../../lib/admin/posts";
import { tiptapToMdx } from "../../../../../lib/admin/mdx/serialize";
import type { TiptapDoc } from "../../../../../lib/admin/mdx/types";

export const prerender = false;

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

function validateFrontmatter(
  collection: Collection,
  fm: Partial<Frontmatter>,
): { ok: true; value: Frontmatter } | { ok: false; error: string } {
  if (typeof fm.title !== "string" || fm.title.trim().length === 0) {
    return { ok: false, error: "Title is required." };
  }
  if (
    typeof fm.description !== "string" ||
    fm.description.trim().length === 0
  ) {
    return { ok: false, error: "Description is required." };
  }
  const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];

  if (collection === "blog") {
    const blog = fm as BlogFrontmatter;
    const date =
      typeof blog.date === "string" && blog.date
        ? blog.date
        : new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      value: {
        title: blog.title.trim(),
        description: blog.description.trim(),
        date,
        tags,
        draft: Boolean(blog.draft),
        image: blog.image && blog.image.trim() ? blog.image.trim() : undefined,
      } as BlogFrontmatter,
    };
  }
  const proj = fm as ProjectFrontmatter;
  return {
    ok: true,
    value: {
      title: proj.title.trim(),
      description: proj.description.trim(),
      images: Array.isArray(proj.images)
        ? proj.images.map((img) => ({
            src: String(img.src ?? "").trim(),
            alt: String(img.alt ?? "").trim(),
          }))
        : [],
      href: proj.href && String(proj.href).trim() ? String(proj.href).trim() : undefined,
      tags,
      featured: Boolean(proj.featured),
      order: typeof proj.order === "number" ? proj.order : undefined,
      draft: Boolean(proj.draft),
    } as ProjectFrontmatter,
  };
}

export const PUT: APIRoute = async ({ params, request }) => {
  const { collection, slug } = params;
  if (!collection || !COLLECTIONS.includes(collection as Collection)) {
    return jsonError("Unknown collection", 404);
  }
  const col = collection as Collection;
  if (!slug) return jsonError("Slug is required.");

  const finalSlug = slug === "new" ? "" : slug;

  let payload: {
    frontmatter: Frontmatter;
    doc: TiptapDoc;
    sha?: string;
    isNew?: boolean;
  };
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const fmResult = validateFrontmatter(col, payload.frontmatter);
  if (!fmResult.ok) return jsonError(fmResult.error);

  let chosenSlug = finalSlug;
  if (payload.isNew) {
    chosenSlug = (slug || slugify(fmResult.value.title)).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(chosenSlug)) {
      return jsonError(
        "Slug must be lowercase letters, digits, and dashes (e.g. my-post).",
      );
    }
  }

  if (!chosenSlug) {
    return jsonError("Slug is required.");
  }

  let body: string;
  try {
    body = tiptapToMdx(payload.doc);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to serialize content.",
      500,
    );
  }

  try {
    const result = await savePost({
      collection: col,
      slug: chosenSlug,
      frontmatter: fmResult.value,
      body,
      sha: payload.sha || undefined,
    });
    return jsonOk({
      sha: result.sha,
      commitSha: result.commitSha,
      slug: chosenSlug,
      path: `src/content/${col}/${chosenSlug}.mdx`,
    });
  } catch (err) {
    console.error("savePost error", err);
    const status = (err as { status?: number }).status ?? 500;
    const message =
      err instanceof Error ? err.message : "Failed to save post.";
    return jsonError(message, status >= 400 && status < 600 ? status : 500);
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const { collection, slug } = params;
  if (!collection || !COLLECTIONS.includes(collection as Collection)) {
    return jsonError("Unknown collection", 404);
  }
  if (!slug || slug === "new") return jsonError("Slug is required.");
  const col = collection as Collection;

  let payload: { sha?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (!payload.sha) return jsonError("File sha required for delete.");

  try {
    await removePost({ collection: col, slug, sha: payload.sha });
    return jsonOk({ ok: true });
  } catch (err) {
    console.error("removePost error", err);
    const status = (err as { status?: number }).status ?? 500;
    const message =
      err instanceof Error ? err.message : "Failed to delete post.";
    return jsonError(message, status >= 400 && status < 600 ? status : 500);
  }
};
