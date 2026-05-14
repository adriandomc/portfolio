import path from "node:path";
import {
  commitChanges,
  getBinaryFile,
  getFile,
  listDirRecursive,
  type RepoChange,
  type RepoFile,
} from "./github";
import { COLLECTIONS, slugFromPath, type Collection } from "./posts";

export type MediaKind = "image" | "document" | "file";

export const MEDIA_ROOT_CONFIG = {
  images: {
    publicPath: "/images",
    repoPath: "public/images",
    acceptedKinds: ["image"],
  },
} as const satisfies Record<
  string,
  {
    publicPath: `/${string}`;
    repoPath: `public/${string}`;
    acceptedKinds: readonly MediaKind[];
  }
>;

export type MediaRoot = keyof typeof MEDIA_ROOT_CONFIG;
export const MEDIA_ROOTS = Object.keys(MEDIA_ROOT_CONFIG) as MediaRoot[];

export interface MediaReference {
  collection: Collection;
  slug: string;
  path: string;
  field: "frontmatter" | "body";
  count: number;
}

export interface MediaItem {
  path: string;
  repoPath: string;
  root: MediaRoot;
  kind: MediaKind;
  folder: string;
  name: string;
  size: number;
  sha: string;
  references: MediaReference[];
}

export interface MediaFolder {
  path: string;
  repoPath: string;
  root: MediaRoot;
  folder: string;
  parent: string;
  name: string;
  itemCount: number;
  directItemCount: number;
  hasPlaceholder: boolean;
}

export interface MediaMutationResult {
  item?: MediaItem;
  items?: MediaItem[];
  folder?: MediaFolder;
  deleted?: boolean;
  references: MediaReference[];
  updatedFiles: string[];
  commitSha?: string;
}

export class MediaError extends Error {
  status: number;
  references?: MediaReference[];

  constructor(message: string, status = 400, references?: MediaReference[]) {
    super(message);
    this.name = "MediaError";
    this.status = status;
    this.references = references;
  }
}

export const MAX_MEDIA_SIZE = 10 * 1024 * 1024;

export const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const IMAGE_EXTENSIONS = new Set(Object.values(MIME_EXTENSIONS));
const MEDIA_KIND_EXTENSIONS: Record<MediaKind, Set<string>> = {
  image: IMAGE_EXTENSIONS,
  document: new Set(),
  file: new Set(),
};
const FOLDER_PLACEHOLDER = ".gitkeep";

function countOccurrences(input: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    index = input.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

function splitMatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!match) return { frontmatter: "", body: content };
  return {
    frontmatter: match[0],
    body: content.slice(match[0].length),
  };
}

function rootForRepoPath(repoPath: string): MediaRoot | null {
  return (
    MEDIA_ROOTS.find((root) => repoPath.startsWith(`${MEDIA_ROOT_CONFIG[root].repoPath}/`)) ??
    null
  );
}

function mediaKindForExtension(ext: string): MediaKind | null {
  for (const [kind, extensions] of Object.entries(MEDIA_KIND_EXTENSIONS)) {
    if (extensions.has(ext)) return kind as MediaKind;
  }
  return null;
}

function mediaKindForMime(type: string): MediaKind | null {
  const ext = MIME_EXTENSIONS[type];
  return ext ? mediaKindForExtension(ext) : null;
}

function rootAcceptsKind(root: MediaRoot, kind: MediaKind): boolean {
  return (MEDIA_ROOT_CONFIG[root].acceptedKinds as readonly MediaKind[]).includes(kind);
}

function normalizeRoot(value: unknown): MediaRoot {
  const root = String(value ?? "images").replace(/^\/+|\/+$/g, "");
  if (root in MEDIA_ROOT_CONFIG) return root as MediaRoot;
  throw new MediaError(`Media root must be one of: ${MEDIA_ROOTS.join(", ")}.`);
}

function normalizeFolder(value: unknown): string {
  const raw = String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
  if (!raw) return "";
  const segments = raw
    .split("/")
    .map((segment) =>
      segment
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean);
  if (segments.length === 0) return "";
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new MediaError("Invalid folder.");
  }
  return segments.join("/");
}

function normalizeFilename(
  value: unknown,
  fallback: string,
  forcedExt?: string,
  root?: MediaRoot,
): string {
  const raw = String(value || fallback || "image").replaceAll("\\", "/");
  const baseName = raw.split("/").pop() ?? "image";
  const parsed = path.posix.parse(baseName);
  const ext = (forcedExt || parsed.ext.replace(/^\./, "")).toLowerCase();
  if (!mediaKindForExtension(ext)) {
    throw new MediaError(`Unsupported image extension: ${ext || "(none)"}`);
  }
  if (root && !rootAcceptsKind(root, mediaKindForExtension(ext)!)) {
    throw new MediaError(`/${root} does not accept ${mediaKindForExtension(ext)} files.`);
  }
  const stem = (parsed.name || "image")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${stem || "image"}.${ext}`;
}

function repoPathFor(root: MediaRoot, folder: string, filename: string): string {
  return [MEDIA_ROOT_CONFIG[root].repoPath, folder, filename].filter(Boolean).join("/");
}

function folderRepoPathFor(root: MediaRoot, folder: string): string {
  return [MEDIA_ROOT_CONFIG[root].repoPath, folder].filter(Boolean).join("/");
}

function placeholderPathFor(root: MediaRoot, folder: string): string {
  return repoPathFor(root, folder, FOLDER_PLACEHOLDER);
}

export function publicPathFromRepoPath(repoPath: string): string {
  if (!repoPath.startsWith("public/")) {
    throw new MediaError("Media path must live under public/.");
  }
  return `/${repoPath.slice("public/".length)}`;
}

function assertMediaRepoPath(repoPath: string): {
  root: MediaRoot;
  kind: MediaKind;
  folder: string;
  name: string;
  ext: string;
} {
  const normalized = repoPath.replaceAll("\\", "/").replace(/^\/+/, "");
  const root = rootForRepoPath(normalized);
  if (!root) {
    throw new MediaError(
      `Media path must live under ${MEDIA_ROOTS.map((item) => MEDIA_ROOT_CONFIG[item].repoPath).join(" or ")}.`,
    );
  }
  const name = normalized.split("/").pop() ?? "";
  const ext = path.posix.extname(name).replace(/^\./, "").toLowerCase();
  const kind = mediaKindForExtension(ext);
  if (!kind || !rootAcceptsKind(root, kind)) {
    throw new MediaError("Unsupported media file type.");
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new MediaError("Invalid media path.");
  }
  const folder = normalized
    .slice(`${MEDIA_ROOT_CONFIG[root].repoPath}/`.length)
    .split("/")
    .slice(0, -1)
    .join("/");
  return { root, kind, folder, name, ext };
}

function itemFromFile(
  file: RepoFile,
  refs: MediaReference[] = [],
): MediaItem {
  const { root, kind, folder, name } = assertMediaRepoPath(file.path);
  return {
    path: publicPathFromRepoPath(file.path),
    repoPath: file.path,
    root,
    kind,
    folder,
    name,
    size: file.size,
    sha: file.sha,
    references: refs,
  };
}

function isPlaceholderFile(file: RepoFile): boolean {
  return file.path.split("/").pop() === FOLDER_PLACEHOLDER;
}

function isIgnoredRepoFile(file: RepoFile): boolean {
  return file.path.split("/").pop() === ".DS_Store";
}

function folderFromPath(
  root: MediaRoot,
  folder: string,
  directItemCount = 0,
  itemCount = 0,
  hasPlaceholder = false,
): MediaFolder {
  const segments = folder.split("/").filter(Boolean);
  const name = segments.at(-1) ?? folder;
  const parent = segments.slice(0, -1).join("/");
  return {
    path: `/${root}/${folder}`,
    repoPath: folderRepoPathFor(root, folder),
    root,
    folder,
    parent,
    name,
    itemCount,
    directItemCount,
    hasPlaceholder,
  };
}

async function listContentFiles(): Promise<
  Array<{ collection: Collection; slug: string; path: string; sha: string; content: string }>
> {
  const files = await Promise.all(
    COLLECTIONS.map(async (collection) => {
      const entries = await listDirRecursive(`src/content/${collection}`);
      return entries
        .filter((file) => /\.(md|mdx)$/.test(file.path))
        .map((file) => ({ collection, file }));
    }),
  );
  const out = [];
  for (const entry of files.flat()) {
    const detail = await getFile(entry.file.path);
    if (!detail) continue;
    out.push({
      collection: entry.collection,
      slug: slugFromPath(entry.file.path),
      path: entry.file.path,
      sha: detail.sha,
      content: detail.content,
    });
  }
  return out;
}

export async function findMediaReferences(
  paths: string[],
): Promise<Map<string, MediaReference[]>> {
  const publicPaths = paths.map((p) =>
    p.startsWith("public/") ? publicPathFromRepoPath(p) : p,
  );
  const map = new Map(publicPaths.map((p) => [p, [] as MediaReference[]]));
  const contentFiles = await listContentFiles();

  for (const file of contentFiles) {
    const parsed = splitMatter(file.content);
    for (const publicPath of publicPaths) {
      const fmCount = countOccurrences(parsed.frontmatter, publicPath);
      if (fmCount > 0) {
        map.get(publicPath)?.push({
          collection: file.collection,
          slug: file.slug,
          path: file.path,
          field: "frontmatter",
          count: fmCount,
        });
      }
      const bodyCount = countOccurrences(parsed.body, publicPath);
      if (bodyCount > 0) {
        map.get(publicPath)?.push({
          collection: file.collection,
          slug: file.slug,
          path: file.path,
          field: "body",
          count: bodyCount,
        });
      }
    }
  }

  return map;
}

function isManagedMediaRepoFile(file: RepoFile): boolean {
  const name = file.path.split("/").pop() ?? "";
  const ext = path.posix.extname(name).replace(/^\./, "").toLowerCase();
  const root = rootForRepoPath(file.path.replaceAll("\\", "/").replace(/^\/+/, ""));
  const kind = mediaKindForExtension(ext);
  return Boolean(root && kind && rootAcceptsKind(root, kind) && name !== ".DS_Store");
}

function foldersFromFiles(files: RepoFile[], items: MediaItem[]): MediaFolder[] {
  const folders = new Map<string, MediaFolder>();

  function ensure(root: MediaRoot, folder: string): MediaFolder {
    const key = `${root}:${folder}`;
    const existing = folders.get(key);
    if (existing) return existing;
    const next = folderFromPath(root, folder);
    folders.set(key, next);
    return next;
  }

  for (const file of files) {
    const normalized = file.path.replaceAll("\\", "/").replace(/^\/+/, "");
    const root = rootForRepoPath(normalized);
    if (!root) continue;
    if (!isManagedMediaRepoFile(file) && !isPlaceholderFile(file)) continue;

    const relParts = normalized
      .slice(`${MEDIA_ROOT_CONFIG[root].repoPath}/`.length)
      .split("/")
      .filter(Boolean);
    const folderParts = relParts.slice(0, -1);
    for (let index = 1; index <= folderParts.length; index += 1) {
      ensure(root, folderParts.slice(0, index).join("/"));
    }
    if (isPlaceholderFile(file) && folderParts.length > 0) {
      ensure(root, folderParts.join("/")).hasPlaceholder = true;
    }
  }

  for (const item of items) {
    if (!item.folder) continue;
    const parts = item.folder.split("/").filter(Boolean);
    for (let index = 1; index <= parts.length; index += 1) {
      const folder = ensure(item.root, parts.slice(0, index).join("/"));
      folder.itemCount += 1;
      if (folder.folder === item.folder) folder.directItemCount += 1;
    }
  }

  return [...folders.values()].sort((a, b) =>
    `${a.root}/${a.folder}`.localeCompare(`${b.root}/${b.folder}`),
  );
}

export async function listMediaLibrary(): Promise<{
  items: MediaItem[];
  folders: MediaFolder[];
}> {
  const allFiles = (
    await Promise.all(
      MEDIA_ROOTS.map((root) => listDirRecursive(MEDIA_ROOT_CONFIG[root].repoPath)),
    )
  ).flat().filter((file) => !isIgnoredRepoFile(file));
  const files = allFiles.filter(isManagedMediaRepoFile);

  const refMap = await findMediaReferences(files.map((file) => file.path));
  const items = files
    .map((file) =>
      itemFromFile(file, refMap.get(publicPathFromRepoPath(file.path)) ?? []),
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    items,
    folders: foldersFromFiles(allFiles, items),
  };
}

export async function listMedia(): Promise<MediaItem[]> {
  return (await listMediaLibrary()).items;
}

async function referenceUpdateChanges(
  oldPublicPath: string,
  nextPublicPath: string,
): Promise<{
  changes: RepoChange[];
  updatedFiles: string[];
  references: MediaReference[];
}> {
  const contentFiles = await listContentFiles();
  const changes: RepoChange[] = [];
  const updatedFiles: string[] = [];
  const references: MediaReference[] = [];

  for (const file of contentFiles) {
    if (!file.content.includes(oldPublicPath)) continue;
    const parsed = splitMatter(file.content);
    const fmCount = countOccurrences(parsed.frontmatter, oldPublicPath);
    if (fmCount > 0) {
      references.push({
        collection: file.collection,
        slug: file.slug,
        path: file.path,
        field: "frontmatter",
        count: fmCount,
      });
    }
    const bodyCount = countOccurrences(parsed.body, oldPublicPath);
    if (bodyCount > 0) {
      references.push({
        collection: file.collection,
        slug: file.slug,
        path: file.path,
        field: "body",
        count: bodyCount,
      });
    }
    changes.push({
      path: file.path,
      content: file.content.replaceAll(oldPublicPath, nextPublicPath),
      encoding: "utf-8",
    });
    updatedFiles.push(file.path);
  }

  return { changes, updatedFiles, references };
}

async function referenceUpdateChangesMany(
  replacements: Array<{ oldPublicPath: string; nextPublicPath: string }>,
): Promise<{
  changes: RepoChange[];
  updatedFiles: string[];
  references: MediaReference[];
}> {
  const contentFiles = await listContentFiles();
  const changes: RepoChange[] = [];
  const updatedFiles: string[] = [];
  const references: MediaReference[] = [];

  for (const file of contentFiles) {
    let nextContent = file.content;
    let touched = false;
    const parsed = splitMatter(file.content);

    for (const replacement of replacements) {
      if (!file.content.includes(replacement.oldPublicPath)) continue;
      const fmCount = countOccurrences(parsed.frontmatter, replacement.oldPublicPath);
      if (fmCount > 0) {
        references.push({
          collection: file.collection,
          slug: file.slug,
          path: file.path,
          field: "frontmatter",
          count: fmCount,
        });
      }
      const bodyCount = countOccurrences(parsed.body, replacement.oldPublicPath);
      if (bodyCount > 0) {
        references.push({
          collection: file.collection,
          slug: file.slug,
          path: file.path,
          field: "body",
          count: bodyCount,
        });
      }
      nextContent = nextContent.replaceAll(
        replacement.oldPublicPath,
        replacement.nextPublicPath,
      );
      touched = true;
    }

    if (touched) {
      changes.push({
        path: file.path,
        content: nextContent,
        encoding: "utf-8",
      });
      updatedFiles.push(file.path);
    }
  }

  return { changes, updatedFiles, references };
}

interface PreparedUpload {
  repoPath: string;
  filename: string;
  size: number;
  change: RepoChange;
}

async function prepareUpload(args: {
  content: Buffer;
  fileName: string;
  type: string;
  size: number;
  root?: unknown;
  folder?: unknown;
  filename?: unknown;
}): Promise<PreparedUpload> {
  if (args.size > MAX_MEDIA_SIZE) {
    throw new MediaError(`File too large (max ${MAX_MEDIA_SIZE / 1024 / 1024}MB).`);
  }
  const ext = MIME_EXTENSIONS[args.type];
  if (!ext) throw new MediaError(`Unsupported type: ${args.type}`);

  const root = normalizeRoot(args.root);
  const kind = mediaKindForMime(args.type);
  if (!kind || !rootAcceptsKind(root, kind)) {
    throw new MediaError(`/${root} does not accept ${kind ?? "unknown"} files.`);
  }
  const folder = normalizeFolder(args.folder);
  const filename = normalizeFilename(args.filename, args.fileName, ext, root);
  const repoPath = repoPathFor(root, folder, filename);
  const existing = await getBinaryFile(repoPath);
  if (existing) {
    throw new MediaError(`Media already exists at ${publicPathFromRepoPath(repoPath)}.`, 409);
  }
  return {
    repoPath,
    filename,
    size: args.content.length,
    change: { path: repoPath, content: args.content, encoding: "base64" },
  };
}

export async function uploadMedia(args: {
  content: Buffer;
  fileName: string;
  type: string;
  size: number;
  root?: unknown;
  folder?: unknown;
  filename?: unknown;
}): Promise<MediaMutationResult> {
  const prepared = await prepareUpload(args);
  const result = await commitChanges({
    changes: [prepared.change],
    message: `content(media): upload ${prepared.filename}`,
  });
  return {
    item: itemFromFile({
      path: prepared.repoPath,
      size: prepared.size,
      sha: result.files[prepared.repoPath] ?? "local",
    }),
    references: [],
    updatedFiles: [],
    commitSha: result.commitSha,
  };
}

export async function uploadMediaBatch(args: {
  items: Array<{
    content: Buffer;
    fileName: string;
    type: string;
    size: number;
    filename?: unknown;
  }>;
  root?: unknown;
  folder?: unknown;
}): Promise<MediaMutationResult> {
  if (args.items.length === 0) {
    throw new MediaError("No files to upload.");
  }
  const prepared: PreparedUpload[] = [];
  const seen = new Set<string>();
  for (const item of args.items) {
    const entry = await prepareUpload({
      content: item.content,
      fileName: item.fileName,
      type: item.type,
      size: item.size,
      root: args.root,
      folder: args.folder,
      filename: item.filename,
    });
    if (seen.has(entry.repoPath)) {
      throw new MediaError(`Duplicate filename in batch: ${entry.filename}`);
    }
    seen.add(entry.repoPath);
    prepared.push(entry);
  }
  const message =
    prepared.length === 1
      ? `content(media): upload ${prepared[0].filename}`
      : `content(media): upload ${prepared.length} files`;
  const result = await commitChanges({
    changes: prepared.map((p) => p.change),
    message,
  });
  const items: MediaItem[] = prepared.map((p) =>
    itemFromFile({
      path: p.repoPath,
      size: p.size,
      sha: result.files[p.repoPath] ?? "local",
    }),
  );
  return {
    item: items.at(-1),
    items,
    references: [],
    updatedFiles: [],
    commitSha: result.commitSha,
  };
}

export async function createMediaFolder(args: {
  root: unknown;
  folder: unknown;
}): Promise<MediaMutationResult> {
  const root = normalizeRoot(args.root);
  const folder = normalizeFolder(args.folder);
  if (!folder) throw new MediaError("Folder name is required.");

  const prefix = `${folderRepoPathFor(root, folder)}/`;
  const files = await listDirRecursive(MEDIA_ROOT_CONFIG[root].repoPath);
  if (files.some((file) => file.path.startsWith(prefix))) {
    throw new MediaError(`Folder already exists at /${root}/${folder}.`, 409);
  }

  const repoPath = placeholderPathFor(root, folder);
  const result = await commitChanges({
    changes: [{ path: repoPath, content: "", encoding: "utf-8" }],
    message: `content(media): create /${root}/${folder}`,
  });

  return {
    folder: {
      ...folderFromPath(root, folder),
      hasPlaceholder: true,
    },
    references: [],
    updatedFiles: [],
    commitSha: result.commitSha,
  };
}

export async function moveMediaFolder(args: {
  root: unknown;
  folder: unknown;
  nextRoot?: unknown;
  nextFolder: unknown;
}): Promise<MediaMutationResult> {
  const root = normalizeRoot(args.root);
  const folder = normalizeFolder(args.folder);
  const nextRoot = args.nextRoot === undefined ? root : normalizeRoot(args.nextRoot);
  const nextFolder = normalizeFolder(args.nextFolder);

  if (!folder) throw new MediaError("Root media folders cannot be renamed.");
  if (!nextFolder) throw new MediaError("Folder name is required.");

  const oldPrefix = `${folderRepoPathFor(root, folder)}/`;
  const nextPrefix = `${folderRepoPathFor(nextRoot, nextFolder)}/`;
  if (oldPrefix === nextPrefix) {
    return { items: [], references: [], updatedFiles: [] };
  }
  if (nextPrefix.startsWith(oldPrefix)) {
    throw new MediaError("A folder cannot be moved into itself.");
  }

  const files = (await listDirRecursive(MEDIA_ROOT_CONFIG[root].repoPath))
    .filter((file) => isManagedMediaRepoFile(file) || isPlaceholderFile(file))
    .filter((file) => file.path.startsWith(oldPrefix));
  if (files.length === 0) throw new MediaError("Folder not found.", 404);

  const nextFiles = await listDirRecursive(MEDIA_ROOT_CONFIG[nextRoot].repoPath);
  if (nextFiles.some((file) => file.path.startsWith(nextPrefix))) {
    throw new MediaError(`Folder already exists at /${nextRoot}/${nextFolder}.`, 409);
  }

  const oldPaths = new Set(files.map((file) => file.path));
  const binaries = await Promise.all(
    files.map(async (file) => {
      const binary = await getBinaryFile(file.path);
      if (!binary) throw new MediaError(`Media file not found: ${file.path}`, 404);
      const nextRepoPath = `${nextPrefix}${file.path.slice(oldPrefix.length)}`;
      const existing = await getBinaryFile(nextRepoPath);
      if (existing && !oldPaths.has(nextRepoPath)) {
        throw new MediaError(
          `Media already exists at ${publicPathFromRepoPath(nextRepoPath)}.`,
          409,
        );
      }
      return { file, binary, nextRepoPath };
    }),
  );

  const replacements = binaries
    .filter(({ file }) => isManagedMediaRepoFile(file))
    .map(({ file, nextRepoPath }) => ({
      oldPublicPath: publicPathFromRepoPath(file.path),
      nextPublicPath: publicPathFromRepoPath(nextRepoPath),
    }));
  const refUpdates = await referenceUpdateChangesMany(replacements);
  const result = await commitChanges({
    changes: [
      ...binaries.map(({ binary, nextRepoPath }) => ({
        path: nextRepoPath,
        content: binary.content,
        encoding: "base64" as const,
      })),
      ...binaries.map(({ file }) => ({ path: file.path, delete: true as const })),
      ...refUpdates.changes,
    ],
    message: `content(media): move /${root}/${folder} to /${nextRoot}/${nextFolder}`,
  });

  const refsByPath = await findMediaReferences(
    binaries
      .filter(({ file }) => isManagedMediaRepoFile(file))
      .map(({ nextRepoPath }) => nextRepoPath),
  );
  const movedImages = binaries.filter(({ file }) => isManagedMediaRepoFile(file));
  return {
    items: movedImages.map(({ binary, nextRepoPath }) =>
      itemFromFile(
        {
          path: nextRepoPath,
          size: binary.size,
          sha: result.files[nextRepoPath] ?? "local",
        },
        refsByPath.get(publicPathFromRepoPath(nextRepoPath)) ?? [],
      ),
    ),
    folder: folderFromPath(
      nextRoot,
      nextFolder,
      movedImages.filter(({ nextRepoPath }) => {
        const currentFolder = nextRepoPath
          .slice(`${MEDIA_ROOT_CONFIG[nextRoot].repoPath}/`.length)
          .split("/")
          .slice(0, -1)
          .join("/");
        return currentFolder === nextFolder;
      }).length,
      movedImages.length,
      binaries.some(({ nextRepoPath }) => nextRepoPath === placeholderPathFor(nextRoot, nextFolder)),
    ),
    references: refUpdates.references,
    updatedFiles: refUpdates.updatedFiles,
    commitSha: result.commitSha,
  };
}

export async function moveMedia(args: {
  repoPath: string;
  root?: unknown;
  folder?: unknown;
  filename?: unknown;
}): Promise<MediaMutationResult> {
  const current = assertMediaRepoPath(args.repoPath);
  const file = await getBinaryFile(args.repoPath);
  if (!file) throw new MediaError("Media file not found.", 404);

  const root = args.root === undefined ? current.root : normalizeRoot(args.root);
  const folder = args.folder === undefined ? current.folder : normalizeFolder(args.folder);
  const filename =
    args.filename === undefined
      ? current.name
      : normalizeFilename(args.filename, current.name, current.ext, root);
  const nextRepoPath = repoPathFor(root, folder, filename);

  if (nextRepoPath === args.repoPath) {
    const refs = await findMediaReferences([args.repoPath]);
    return {
      item: itemFromFile(file, refs.get(publicPathFromRepoPath(args.repoPath)) ?? []),
      references: refs.get(publicPathFromRepoPath(args.repoPath)) ?? [],
      updatedFiles: [],
    };
  }

  const existing = await getBinaryFile(nextRepoPath);
  if (existing) {
    throw new MediaError(`Media already exists at ${publicPathFromRepoPath(nextRepoPath)}.`, 409);
  }

  const oldPublicPath = publicPathFromRepoPath(args.repoPath);
  const nextPublicPath = publicPathFromRepoPath(nextRepoPath);
  const refUpdates = await referenceUpdateChanges(oldPublicPath, nextPublicPath);
  const result = await commitChanges({
    changes: [
      { path: nextRepoPath, content: file.content, encoding: "base64" },
      { path: args.repoPath, delete: true },
      ...refUpdates.changes,
    ],
    message: `content(media): move ${oldPublicPath} to ${nextPublicPath}`,
  });

  return {
    item: itemFromFile(
      {
        path: nextRepoPath,
        size: file.size,
        sha: result.files[nextRepoPath] ?? "local",
      },
      refUpdates.references.map((ref) => ({ ...ref })),
    ),
    references: refUpdates.references,
    updatedFiles: refUpdates.updatedFiles,
    commitSha: result.commitSha,
  };
}

export async function deleteMediaFolder(args: {
  root: unknown;
  folder: unknown;
  force?: boolean;
}): Promise<MediaMutationResult> {
  const root = normalizeRoot(args.root);
  const folder = normalizeFolder(args.folder);
  if (!folder) throw new MediaError("Root media folders cannot be deleted.");

  const prefix = `${folderRepoPathFor(root, folder)}/`;
  const files = (await listDirRecursive(MEDIA_ROOT_CONFIG[root].repoPath))
    .filter((file) => isManagedMediaRepoFile(file) || isPlaceholderFile(file))
    .filter((file) => file.path.startsWith(prefix));
  if (files.length === 0) throw new MediaError("Folder not found.", 404);

  const refMap = await findMediaReferences(
    files.filter(isManagedMediaRepoFile).map((file) => file.path),
  );
  const references = [...refMap.values()].flat();
  if (references.length > 0 && !args.force) {
    throw new MediaError("Folder contains referenced media.", 409, references);
  }

  const result = await commitChanges({
    changes: files.map((file) => ({ path: file.path, delete: true })),
    message: `content(media): delete /${root}/${folder}`,
  });

  return {
    deleted: true,
    references,
    updatedFiles: [],
    commitSha: result.commitSha,
  };
}

export async function deleteMedia(args: {
  repoPath: string;
  force?: boolean;
}): Promise<MediaMutationResult> {
  assertMediaRepoPath(args.repoPath);
  const file = await getBinaryFile(args.repoPath);
  if (!file) throw new MediaError("Media file not found.", 404);

  const refMap = await findMediaReferences([args.repoPath]);
  const references = refMap.get(publicPathFromRepoPath(args.repoPath)) ?? [];
  if (references.length > 0 && !args.force) {
    throw new MediaError("Media is still referenced.", 409, references);
  }

  const result = await commitChanges({
    changes: [{ path: args.repoPath, delete: true }],
    message: `content(media): delete ${publicPathFromRepoPath(args.repoPath)}`,
  });

  return {
    deleted: true,
    references,
    updatedFiles: [],
    commitSha: result.commitSha,
  };
}

export type PendingAction =
  | { kind: "delete-file"; repoPath: string; force?: boolean }
  | { kind: "delete-folder"; root: unknown; folder: unknown; force?: boolean }
  | {
      kind: "move-file";
      repoPath: string;
      root?: unknown;
      folder?: unknown;
      filename?: unknown;
    }
  | {
      kind: "move-folder";
      root: unknown;
      folder: unknown;
      nextRoot?: unknown;
      nextFolder: unknown;
    };

interface ActionPlan {
  changes: RepoChange[];
  replacements: Array<{ oldPublicPath: string; nextPublicPath: string }>;
}

async function planDeleteFile(action: {
  repoPath: string;
  force?: boolean;
}): Promise<ActionPlan> {
  assertMediaRepoPath(action.repoPath);
  const file = await getBinaryFile(action.repoPath);
  if (!file) throw new MediaError(`Media file not found: ${action.repoPath}`, 404);
  const refMap = await findMediaReferences([action.repoPath]);
  const references = refMap.get(publicPathFromRepoPath(action.repoPath)) ?? [];
  if (references.length > 0 && !action.force) {
    throw new MediaError(
      `Media is still referenced: ${publicPathFromRepoPath(action.repoPath)}`,
      409,
      references,
    );
  }
  return {
    changes: [{ path: action.repoPath, delete: true }],
    replacements: [],
  };
}

async function planDeleteFolder(action: {
  root: unknown;
  folder: unknown;
  force?: boolean;
}): Promise<ActionPlan> {
  const root = normalizeRoot(action.root);
  const folder = normalizeFolder(action.folder);
  if (!folder) throw new MediaError("Root media folders cannot be deleted.");
  const prefix = `${folderRepoPathFor(root, folder)}/`;
  const files = (await listDirRecursive(MEDIA_ROOT_CONFIG[root].repoPath))
    .filter((file) => isManagedMediaRepoFile(file) || isPlaceholderFile(file))
    .filter((file) => file.path.startsWith(prefix));
  if (files.length === 0) throw new MediaError(`Folder not found: /${root}/${folder}`, 404);
  const refMap = await findMediaReferences(
    files.filter(isManagedMediaRepoFile).map((file) => file.path),
  );
  const references = [...refMap.values()].flat();
  if (references.length > 0 && !action.force) {
    throw new MediaError(
      `Folder contains referenced media: /${root}/${folder}`,
      409,
      references,
    );
  }
  return {
    changes: files.map((file) => ({ path: file.path, delete: true })),
    replacements: [],
  };
}

async function planMoveFile(action: {
  repoPath: string;
  root?: unknown;
  folder?: unknown;
  filename?: unknown;
}): Promise<ActionPlan> {
  const current = assertMediaRepoPath(action.repoPath);
  const file = await getBinaryFile(action.repoPath);
  if (!file) throw new MediaError(`Media file not found: ${action.repoPath}`, 404);
  const root = action.root === undefined ? current.root : normalizeRoot(action.root);
  const folder =
    action.folder === undefined ? current.folder : normalizeFolder(action.folder);
  const filename =
    action.filename === undefined
      ? current.name
      : normalizeFilename(action.filename, current.name, current.ext, root);
  const nextRepoPath = repoPathFor(root, folder, filename);
  if (nextRepoPath === action.repoPath) {
    return { changes: [], replacements: [] };
  }
  const existing = await getBinaryFile(nextRepoPath);
  if (existing) {
    throw new MediaError(
      `Media already exists at ${publicPathFromRepoPath(nextRepoPath)}.`,
      409,
    );
  }
  return {
    changes: [
      { path: nextRepoPath, content: file.content, encoding: "base64" },
      { path: action.repoPath, delete: true },
    ],
    replacements: [
      {
        oldPublicPath: publicPathFromRepoPath(action.repoPath),
        nextPublicPath: publicPathFromRepoPath(nextRepoPath),
      },
    ],
  };
}

async function planMoveFolder(action: {
  root: unknown;
  folder: unknown;
  nextRoot?: unknown;
  nextFolder: unknown;
}): Promise<ActionPlan> {
  const root = normalizeRoot(action.root);
  const folder = normalizeFolder(action.folder);
  const nextRoot = action.nextRoot === undefined ? root : normalizeRoot(action.nextRoot);
  const nextFolder = normalizeFolder(action.nextFolder);
  if (!folder) throw new MediaError("Root media folders cannot be renamed.");
  if (!nextFolder) throw new MediaError("Folder name is required.");
  const oldPrefix = `${folderRepoPathFor(root, folder)}/`;
  const nextPrefix = `${folderRepoPathFor(nextRoot, nextFolder)}/`;
  if (oldPrefix === nextPrefix) {
    return { changes: [], replacements: [] };
  }
  if (nextPrefix.startsWith(oldPrefix)) {
    throw new MediaError("A folder cannot be moved into itself.");
  }
  const files = (await listDirRecursive(MEDIA_ROOT_CONFIG[root].repoPath))
    .filter((file) => isManagedMediaRepoFile(file) || isPlaceholderFile(file))
    .filter((file) => file.path.startsWith(oldPrefix));
  if (files.length === 0) throw new MediaError(`Folder not found: /${root}/${folder}`, 404);
  const nextFiles = await listDirRecursive(MEDIA_ROOT_CONFIG[nextRoot].repoPath);
  if (nextFiles.some((file) => file.path.startsWith(nextPrefix))) {
    throw new MediaError(`Folder already exists at /${nextRoot}/${nextFolder}.`, 409);
  }
  const oldPaths = new Set(files.map((file) => file.path));
  const binaries = await Promise.all(
    files.map(async (file) => {
      const binary = await getBinaryFile(file.path);
      if (!binary) throw new MediaError(`Media file not found: ${file.path}`, 404);
      const nextRepoPath = `${nextPrefix}${file.path.slice(oldPrefix.length)}`;
      const existing = await getBinaryFile(nextRepoPath);
      if (existing && !oldPaths.has(nextRepoPath)) {
        throw new MediaError(
          `Media already exists at ${publicPathFromRepoPath(nextRepoPath)}.`,
          409,
        );
      }
      return { file, binary, nextRepoPath };
    }),
  );
  const replacements = binaries
    .filter(({ file }) => isManagedMediaRepoFile(file))
    .map(({ file, nextRepoPath }) => ({
      oldPublicPath: publicPathFromRepoPath(file.path),
      nextPublicPath: publicPathFromRepoPath(nextRepoPath),
    }));
  return {
    changes: [
      ...binaries.map(({ binary, nextRepoPath }) => ({
        path: nextRepoPath,
        content: binary.content,
        encoding: "base64" as const,
      })),
      ...binaries.map(({ file }) => ({ path: file.path, delete: true as const })),
    ],
    replacements,
  };
}

export async function publishPendingActions(args: {
  actions: PendingAction[];
}): Promise<{
  commitSha: string;
  applied: number;
  references: MediaReference[];
  updatedFiles: string[];
}> {
  if (!Array.isArray(args.actions) || args.actions.length === 0) {
    throw new MediaError("No pending actions to publish.");
  }
  const allChanges: RepoChange[] = [];
  const allReplacements: Array<{ oldPublicPath: string; nextPublicPath: string }> = [];

  for (const action of args.actions) {
    let plan: ActionPlan;
    switch (action.kind) {
      case "delete-file":
        plan = await planDeleteFile(action);
        break;
      case "delete-folder":
        plan = await planDeleteFolder(action);
        break;
      case "move-file":
        plan = await planMoveFile(action);
        break;
      case "move-folder":
        plan = await planMoveFolder(action);
        break;
      default:
        throw new MediaError(`Unknown action kind: ${(action as { kind?: string }).kind ?? "(missing)"}`);
    }
    allChanges.push(...plan.changes);
    allReplacements.push(...plan.replacements);
  }

  const refUpdates = await referenceUpdateChangesMany(allReplacements);
  const message =
    args.actions.length === 1
      ? `content(media): publish 1 change`
      : `content(media): publish ${args.actions.length} changes`;
  const result = await commitChanges({
    changes: [...allChanges, ...refUpdates.changes],
    message,
  });
  return {
    commitSha: result.commitSha,
    applied: args.actions.length,
    references: refUpdates.references,
    updatedFiles: refUpdates.updatedFiles,
  };
}
