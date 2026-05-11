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

export type MediaRoot = "images" | "assets";

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

export const MEDIA_ROOTS: MediaRoot[] = ["images", "assets"];
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

function normalizeRoot(value: unknown): MediaRoot {
  const root = String(value ?? "images").replace(/^\/+|\/+$/g, "");
  if (root === "images" || root === "assets") return root;
  throw new MediaError("Media root must be either images or assets.");
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
): string {
  const raw = String(value || fallback || "image").replaceAll("\\", "/");
  const baseName = raw.split("/").pop() ?? "image";
  const parsed = path.posix.parse(baseName);
  const ext = (forcedExt || parsed.ext.replace(/^\./, "")).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw new MediaError(`Unsupported image extension: ${ext || "(none)"}`);
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
  return ["public", root, folder, filename].filter(Boolean).join("/");
}

function folderRepoPathFor(root: MediaRoot, folder: string): string {
  return ["public", root, folder].filter(Boolean).join("/");
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
  folder: string;
  name: string;
  ext: string;
} {
  const normalized = repoPath.replaceAll("\\", "/").replace(/^\/+/, "");
  const match = normalized.match(/^public\/(images|assets)\/(.+)$/);
  if (!match) {
    throw new MediaError("Media path must live under public/images or public/assets.");
  }
  const root = normalizeRoot(match[1]);
  const name = normalized.split("/").pop() ?? "";
  const ext = path.posix.extname(name).replace(/^\./, "").toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw new MediaError("Only image files can be managed here.");
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new MediaError("Invalid media path.");
  }
  const folder = normalized
    .slice(`public/${root}/`.length)
    .split("/")
    .slice(0, -1)
    .join("/");
  return { root, folder, name, ext };
}

function itemFromFile(
  file: RepoFile,
  refs: MediaReference[] = [],
): MediaItem {
  const { root, folder, name } = assertMediaRepoPath(file.path);
  return {
    path: publicPathFromRepoPath(file.path),
    repoPath: file.path,
    root,
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

function isImageRepoFile(file: RepoFile): boolean {
  const name = file.path.split("/").pop() ?? "";
  const ext = path.posix.extname(name).replace(/^\./, "").toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) && name !== ".DS_Store";
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
    const match = normalized.match(/^public\/(images|assets)\/(.+)$/);
    if (!match) continue;
    if (!isImageRepoFile(file) && !isPlaceholderFile(file)) continue;

    const root = normalizeRoot(match[1]);
    const relParts = match[2].split("/").filter(Boolean);
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
      MEDIA_ROOTS.map((root) => listDirRecursive(`public/${root}`)),
    )
  ).flat().filter((file) => !isIgnoredRepoFile(file));
  const files = allFiles.filter(isImageRepoFile);

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

export async function uploadMedia(args: {
  content: Buffer;
  fileName: string;
  type: string;
  size: number;
  root?: unknown;
  folder?: unknown;
  filename?: unknown;
}): Promise<MediaMutationResult> {
  if (args.size > MAX_MEDIA_SIZE) {
    throw new MediaError(`File too large (max ${MAX_MEDIA_SIZE / 1024 / 1024}MB).`);
  }
  const ext = MIME_EXTENSIONS[args.type];
  if (!ext) throw new MediaError(`Unsupported type: ${args.type}`);

  const root = normalizeRoot(args.root);
  const folder = normalizeFolder(args.folder);
  const filename = normalizeFilename(args.filename, args.fileName, ext);
  const repoPath = repoPathFor(root, folder, filename);
  const existing = await getBinaryFile(repoPath);
  if (existing) {
    throw new MediaError(`Media already exists at ${publicPathFromRepoPath(repoPath)}.`, 409);
  }

  const result = await commitChanges({
    changes: [{ path: repoPath, content: args.content, encoding: "base64" }],
    message: `content(media): upload ${filename}`,
  });

  return {
    item: itemFromFile({
      path: repoPath,
      size: args.content.length,
      sha: result.files[repoPath] ?? "local",
    }),
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
  const files = await listDirRecursive(`public/${root}`);
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

  const oldPrefix = `public/${root}/${folder}/`;
  const nextPrefix = `public/${nextRoot}/${nextFolder}/`;
  if (oldPrefix === nextPrefix) {
    return { items: [], references: [], updatedFiles: [] };
  }
  if (nextPrefix.startsWith(oldPrefix)) {
    throw new MediaError("A folder cannot be moved into itself.");
  }

  const files = (await listDirRecursive(`public/${root}`))
    .filter((file) => isImageRepoFile(file) || isPlaceholderFile(file))
    .filter((file) => file.path.startsWith(oldPrefix));
  if (files.length === 0) throw new MediaError("Folder not found.", 404);

  const nextFiles = await listDirRecursive(`public/${nextRoot}`);
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
    .filter(({ file }) => isImageRepoFile(file))
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
      .filter(({ file }) => isImageRepoFile(file))
      .map(({ nextRepoPath }) => nextRepoPath),
  );
  const movedImages = binaries.filter(({ file }) => isImageRepoFile(file));
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
          .slice(`public/${nextRoot}/`.length)
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
      : normalizeFilename(args.filename, current.name, current.ext);
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

  const prefix = `public/${root}/${folder}/`;
  const files = (await listDirRecursive(`public/${root}`))
    .filter((file) => isImageRepoFile(file) || isPlaceholderFile(file))
    .filter((file) => file.path.startsWith(prefix));
  if (files.length === 0) throw new MediaError("Folder not found.", 404);

  const refMap = await findMediaReferences(
    files.filter(isImageRepoFile).map((file) => file.path),
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
