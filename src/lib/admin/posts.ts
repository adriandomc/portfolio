import matter from "gray-matter";
import { commitChanges, listDir, getFile, commitFile, deleteFile, type RepoChange } from "./github";

export type Collection = "blog" | "projects";

export const COLLECTIONS: Collection[] = ["blog", "projects"];

const COLLECTION_DIRS: Record<Collection, string> = {
  blog: "src/content/blog",
  projects: "src/content/projects",
};

export interface BlogFrontmatter {
  title: string;
  description: string;
  date: string;
  tags: string[];
  draft: boolean;
  image?: string;
}

export interface ProjectImage {
  src: string;
  alt: string;
}

export interface ProjectFrontmatter {
  title: string;
  description: string;
  images: ProjectImage[];
  href?: string;
  tags: string[];
  featured: boolean;
  order?: number;
  draft: boolean;
}

export type Frontmatter = BlogFrontmatter | ProjectFrontmatter;

export interface PostSummary {
  collection: Collection;
  slug: string;
  path: string;
  title: string;
  description: string;
  draft: boolean;
  date?: string;
  tags: string[];
  featured?: boolean;
  order?: number;
  cover?: string;
}

export interface PostDetail extends PostSummary {
  body: string;
  frontmatter: Frontmatter;
  /**
   * Untouched frontmatter as read from the file. `frontmatter` is normalised
   * and only carries the keys the admin UI knows about, so saves merge over
   * this to avoid dropping fields the editor doesn't manage (summary, role,
   * year, …).
   */
  raw: Record<string, unknown>;
  sha: string;
}

export function pathFor(collection: Collection, slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(
      "Slug must be lowercase letters, digits, and dashes only.",
    );
  }
  return `${COLLECTION_DIRS[collection]}/${slug}.mdx`;
}

export function slugFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? "";
  return base.replace(/\.(md|mdx)$/, "");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultsFor(collection: Collection): Frontmatter {
  if (collection === "blog") {
    return {
      title: "",
      description: "",
      date: new Date().toISOString().slice(0, 10),
      tags: [],
      draft: true,
    };
  }
  return {
    title: "",
    description: "",
    images: [],
    tags: [],
    featured: false,
    draft: true,
  };
}

export function emptyPost(
  collection: Collection,
  slug: string,
): PostDetail {
  return {
    collection,
    slug,
    path: slug ? pathFor(collection, slug) : `${COLLECTION_DIRS[collection]}/new.mdx`,
    title: "",
    description: "",
    draft: true,
    tags: [],
    body: "",
    frontmatter: defaultsFor(collection),
    raw: {},
    sha: "",
  };
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") return value;
  return new Date().toISOString().slice(0, 10);
}

function parseFrontmatter(
  collection: Collection,
  raw: Record<string, unknown>,
): Frontmatter {
  if (collection === "blog") {
    return {
      title: String(raw.title ?? ""),
      description: String(raw.description ?? ""),
      date: normalizeDate(raw.date),
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      draft: Boolean(raw.draft ?? false),
      image: raw.image ? String(raw.image) : undefined,
    };
  }
  return {
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    images: Array.isArray(raw.images)
      ? (raw.images as Array<Record<string, unknown>>).map((img) => ({
          src: String(img.src ?? ""),
          alt: String(img.alt ?? ""),
        }))
      : [],
    href: raw.href ? String(raw.href) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    featured: Boolean(raw.featured ?? false),
    order: typeof raw.order === "number" ? raw.order : undefined,
    draft: Boolean(raw.draft ?? false),
  };
}

function summaryFromFrontmatter(
  collection: Collection,
  slug: string,
  filePath: string,
  fm: Frontmatter,
): PostSummary {
  const base: PostSummary = {
    collection,
    slug,
    path: filePath,
    title: fm.title,
    description: fm.description,
    draft: fm.draft,
    tags: fm.tags,
  };
  if (collection === "blog") {
    return { ...base, date: (fm as BlogFrontmatter).date };
  }
  const proj = fm as ProjectFrontmatter;
  return {
    ...base,
    featured: proj.featured,
    order: proj.order,
    cover: proj.images?.[0]?.src,
  };
}

export async function listPosts(
  collection: Collection,
): Promise<PostSummary[]> {
  const dir = COLLECTION_DIRS[collection];
  const files = await listDir(dir);
  const out: PostSummary[] = [];
  for (const file of files) {
    if (!file.path.endsWith(".mdx") && !file.path.endsWith(".md")) continue;
    const detail = await getFile(file.path);
    if (!detail) continue;
    const slug = slugFromPath(file.path);
    if (collection === "projects" && slug === "all") continue;
    const parsed = matter(detail.content);
    const fm = parseFrontmatter(collection, parsed.data);
    out.push(summaryFromFrontmatter(collection, slug, file.path, fm));
  }
  if (collection === "blog") {
    out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  } else {
    out.sort((a, b) => {
      const orderA = a.order ?? Number.POSITIVE_INFINITY;
      const orderB = b.order ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return a.title.localeCompare(b.title);
    });
  }
  return out;
}

export async function getPost(
  collection: Collection,
  slug: string,
): Promise<PostDetail | null> {
  const filePath = pathFor(collection, slug);
  const file = await getFile(filePath);
  if (!file) return null;
  const parsed = matter(file.content);
  const fm = parseFrontmatter(collection, parsed.data);
  return {
    collection,
    slug,
    path: filePath,
    title: fm.title,
    description: fm.description,
    draft: fm.draft,
    tags: fm.tags,
    date: collection === "blog" ? (fm as BlogFrontmatter).date : undefined,
    body: parsed.content,
    frontmatter: fm,
    raw: parsed.data as Record<string, unknown>,
    sha: file.sha,
  };
}

export function serializePost(
  collection: Collection,
  fm: Frontmatter,
  body: string,
  base: Record<string, unknown> = {},
): string {
  const data: Record<string, unknown> = { ...base, ...fm };
  if (collection === "blog") {
    const blog = fm as BlogFrontmatter;
    if (!blog.image) delete data.image;
  } else {
    const proj = fm as ProjectFrontmatter;
    if (!proj.href) delete data.href;
    if (proj.order === undefined) delete data.order;
    if (!proj.images || proj.images.length === 0) delete data.images;
  }
  if (!fm.tags || fm.tags.length === 0) delete data.tags;
  // `{...base, ...fm}` reintroduces keys the form left blank as `undefined`;
  // js-yaml would either throw or emit `null` for those.
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
  return matter.stringify(body.endsWith("\n") ? body : `${body}\n`, data);
}

export async function savePost(args: {
  collection: Collection;
  slug: string;
  frontmatter: Frontmatter;
  body: string;
  sha?: string;
  /** Existing raw frontmatter to merge over; preserves unmanaged keys. */
  base?: Record<string, unknown>;
}): Promise<{ sha: string; commitSha: string }> {
  const filePath = pathFor(args.collection, args.slug);
  const content = serializePost(
    args.collection,
    args.frontmatter,
    args.body,
    args.base,
  );
  const message = `content(${args.collection}): ${args.sha ? "update" : "create"} ${args.slug}`;
  return commitFile({
    file: { path: filePath, content, encoding: "utf-8" },
    message,
    sha: args.sha,
  });
}

export async function removePost(args: {
  collection: Collection;
  slug: string;
  sha: string;
}): Promise<void> {
  const filePath = pathFor(args.collection, args.slug);
  await deleteFile({
    path: filePath,
    sha: args.sha,
    message: `content(${args.collection}): delete ${args.slug}`,
  });
}

export async function updateProjectsOrdering(args: {
  updates: Array<{ slug: string; order: number; featured: boolean }>;
}): Promise<{ commitSha: string; updated: number }> {
  if (!Array.isArray(args.updates) || args.updates.length === 0) {
    throw new Error("No project updates provided.");
  }
  const seen = new Set<string>();
  const changes: RepoChange[] = [];
  for (const update of args.updates) {
    const slug = String(update.slug ?? "");
    if (!slug) throw new Error("Missing slug in project update.");
    if (seen.has(slug)) throw new Error(`Duplicate slug in updates: ${slug}`);
    seen.add(slug);

    const filePath = pathFor("projects", slug);
    const file = await getFile(filePath);
    if (!file) throw new Error(`Project not found: ${slug}`);

    const parsed = matter(file.content);
    const data = parsed.data as Record<string, unknown>;
    const nextOrder = Number(update.order);
    if (!Number.isFinite(nextOrder)) {
      throw new Error(`Invalid order for ${slug}.`);
    }
    const nextFeatured = Boolean(update.featured);

    if (data.order === nextOrder && data.featured === nextFeatured) {
      continue;
    }

    data.order = nextOrder;
    data.featured = nextFeatured;
    const nextContent = matter.stringify(parsed.content, data);
    if (nextContent === file.content) continue;

    changes.push({ path: filePath, content: nextContent, encoding: "utf-8" });
  }

  if (changes.length === 0) {
    return { commitSha: "", updated: 0 };
  }

  const message =
    changes.length === 1
      ? `content(projects): reorder ${changes.length} project`
      : `content(projects): reorder ${changes.length} projects`;
  const result = await commitChanges({ changes, message });
  return { commitSha: result.commitSha, updated: changes.length };
}
