import {
  type CommitFile,
  type RepoBinaryFile,
  type RepoChange,
  type RepoFile,
  type RepoFileContent,
  getBinaryFileUpstream,
  getFileUpstream,
  listDirRecursiveUpstream,
  listDirUpstream,
} from "./github-upstream";
import {
  getStagedFile,
  getStagingState,
  stageBatch,
} from "./staging";

export type {
  CommitFile,
  RepoBinaryFile,
  RepoChange,
  RepoFile,
  RepoFileContent,
} from "./github-upstream";

export async function listDir(dirPath: string): Promise<RepoFile[]> {
  const upstream = await listDirUpstream(dirPath);
  const { additions, deletions } = await getStagingState();
  if (additions.size === 0 && deletions.size === 0) return upstream;

  const prefix = dirPath.replace(/\/+$/, "") + "/";
  const upstreamByPath = new Map(upstream.map((file) => [file.path, file]));

  // Apply staged adds within this directory (non-recursive — same depth)
  for (const [path, info] of additions) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (rest.includes("/")) continue;
    upstreamByPath.set(path, { path, sha: "staged", size: info.size });
  }

  // Apply staged deletes
  for (const path of deletions) {
    upstreamByPath.delete(path);
  }

  return [...upstreamByPath.values()];
}

export async function listDirRecursive(dirPath: string): Promise<RepoFile[]> {
  const upstream = await listDirRecursiveUpstream(dirPath);
  const { additions, deletions } = await getStagingState();
  if (additions.size === 0 && deletions.size === 0) return upstream;

  const prefix = dirPath.replace(/\/+$/, "") + "/";
  const upstreamByPath = new Map(upstream.map((file) => [file.path, file]));

  for (const [path, info] of additions) {
    if (!path.startsWith(prefix)) continue;
    upstreamByPath.set(path, { path, sha: "staged", size: info.size });
  }

  for (const path of deletions) {
    upstreamByPath.delete(path);
  }

  return [...upstreamByPath.values()];
}

export async function getFile(
  filePath: string,
): Promise<RepoFileContent | null> {
  const staged = await getStagedFile(filePath);
  if (staged) {
    if (staged.kind === "deleted") return null;
    return {
      path: filePath,
      sha: "staged",
      content: staged.content.toString("utf-8"),
    };
  }
  return getFileUpstream(filePath);
}

export async function getBinaryFile(
  filePath: string,
): Promise<RepoBinaryFile | null> {
  const staged = await getStagedFile(filePath);
  if (staged) {
    if (staged.kind === "deleted") return null;
    return {
      path: filePath,
      sha: "staged",
      size: staged.size,
      content: staged.content,
    };
  }
  return getBinaryFileUpstream(filePath);
}

export async function commitFile(args: {
  file: CommitFile;
  message: string;
  sha?: string;
}): Promise<{ sha: string; commitSha: string }> {
  await stageBatch({
    changes: [
      {
        path: args.file.path,
        content: args.file.content,
        encoding: args.file.encoding,
      },
    ],
    message: args.message,
  });
  return { sha: "staged", commitSha: "staged" };
}

export async function commitChanges(args: {
  changes: RepoChange[];
  message: string;
}): Promise<{ commitSha: string; files: Record<string, string> }> {
  if (args.changes.length === 0) return { commitSha: "", files: {} };
  await stageBatch(args);
  return { commitSha: "staged", files: {} };
}

export async function deleteFile(args: {
  path: string;
  sha: string;
  message: string;
}): Promise<void> {
  await stageBatch({
    changes: [{ path: args.path, delete: true }],
    message: args.message,
  });
}
