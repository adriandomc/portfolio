import matter from "gray-matter";
import { listDir, getFile, commitFile, deleteFile } from "./github";

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
}

export interface PostDetail extends PostSummary {
  body: string;
  frontmatter: Frontmatter;
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
    path: pathFor(collection, slug),
    title: "",
    description: "",
    draft: true,
    tags: [],
    body: "",
    frontmatter: defaultsFor(collection),
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
  return base;
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
    out.sort((a, b) => a.title.localeCompare(b.title));
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
    sha: file.sha,
  };
}

export function serializePost(
  collection: Collection,
  fm: Frontmatter,
  body: string,
): string {
  const data: Record<string, unknown> = { ...fm };
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
  return matter.stringify(body.endsWith("\n") ? body : `${body}\n`, data);
}

export async function savePost(args: {
  collection: Collection;
  slug: string;
  frontmatter: Frontmatter;
  body: string;
  sha?: string;
}): Promise<{ sha: string; commitSha: string }> {
  const filePath = pathFor(args.collection, args.slug);
  const content = serializePost(args.collection, args.frontmatter, args.body);
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
