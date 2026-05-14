import { Octokit } from "@octokit/rest";
import { adminConfig } from "./env";
import { promises as fs } from "node:fs";
import path from "node:path";

let _octokit: Octokit | null = null;

function octokit(): Octokit {
  if (!_octokit) {
    _octokit = new Octokit({ auth: adminConfig().githubToken });
  }
  return _octokit;
}

function repoParts(): { owner: string; repo: string } {
  const [owner, repo] = adminConfig().githubRepo.split("/");
  if (!owner || !repo) {
    throw new Error(
      `GITHUB_REPO must be in "owner/repo" format, got: ${adminConfig().githubRepo}`,
    );
  }
  return { owner, repo };
}

export interface RepoFile {
  path: string;
  sha: string;
  size: number;
}

export interface RepoBinaryFile extends RepoFile {
  content: Buffer;
}

export interface RepoFileContent {
  path: string;
  sha: string;
  content: string;
}

export interface CommitFile {
  path: string;
  content: string | Buffer;
  encoding?: "utf-8" | "base64";
}

export type RepoChange =
  | {
      path: string;
      content: string | Buffer;
      encoding?: "utf-8" | "base64";
      delete?: false;
    }
  | {
      path: string;
      delete: true;
    };

export async function listDirUpstream(dirPath: string): Promise<RepoFile[]> {
  const cfg = adminConfig();
  if (cfg.dryRun) return listDirLocal(dirPath);

  const { owner, repo } = repoParts();
  try {
    const res = await octokit().repos.getContent({
      owner,
      repo,
      path: dirPath,
      ref: cfg.githubBranch,
    });
    if (!Array.isArray(res.data)) return [];
    return res.data
      .filter((item) => item.type === "file")
      .map((item) => ({
        path: item.path,
        sha: item.sha,
        size: item.size,
      }));
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 404) return [];
    throw err;
  }
}

export async function listDirRecursiveUpstream(
  dirPath: string,
): Promise<RepoFile[]> {
  const cfg = adminConfig();
  if (cfg.dryRun) return listDirRecursiveLocal(dirPath);

  const { owner, repo } = repoParts();
  const out: RepoFile[] = [];

  async function walk(currentPath: string) {
    const res = await octokit().repos.getContent({
      owner,
      repo,
      path: currentPath,
      ref: cfg.githubBranch,
    });
    if (!Array.isArray(res.data)) {
      if (res.data.type === "file") {
        out.push({
          path: res.data.path,
          sha: res.data.sha,
          size: res.data.size,
        });
      }
      return;
    }
    for (const item of res.data) {
      if (item.type === "file") {
        out.push({
          path: item.path,
          sha: item.sha,
          size: item.size,
        });
      } else if (item.type === "dir") {
        await walk(item.path);
      }
    }
  }

  try {
    await walk(dirPath);
    return out;
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 404) return [];
    throw err;
  }
}

export async function getFileUpstream(
  filePath: string,
): Promise<RepoFileContent | null> {
  const cfg = adminConfig();
  if (cfg.dryRun) return getFileLocal(filePath);

  const { owner, repo } = repoParts();
  try {
    const res = await octokit().repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: cfg.githubBranch,
    });
    if (Array.isArray(res.data) || res.data.type !== "file") return null;
    const content = Buffer.from(res.data.content, "base64").toString("utf8");
    return { path: filePath, sha: res.data.sha, content };
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 404) return null;
    throw err;
  }
}

export async function getBinaryFileUpstream(
  filePath: string,
): Promise<RepoBinaryFile | null> {
  const cfg = adminConfig();
  if (cfg.dryRun) return getBinaryFileLocal(filePath);

  const { owner, repo } = repoParts();
  try {
    const res = await octokit().repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: cfg.githubBranch,
    });
    if (Array.isArray(res.data) || res.data.type !== "file") return null;
    return {
      path: filePath,
      sha: res.data.sha,
      size: res.data.size,
      content: Buffer.from(res.data.content, "base64"),
    };
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 404) return null;
    throw err;
  }
}

export async function commitFileUpstream(args: {
  file: CommitFile;
  message: string;
  sha?: string;
}): Promise<{ sha: string; commitSha: string }> {
  const cfg = adminConfig();
  if (cfg.dryRun) return commitFileLocal(args);

  const { owner, repo } = repoParts();
  const encoding = args.file.encoding ?? "utf-8";
  const contentB64 =
    encoding === "base64"
      ? typeof args.file.content === "string"
        ? args.file.content
        : args.file.content.toString("base64")
      : Buffer.from(args.file.content as string, "utf8").toString("base64");

  const res = await octokit().repos.createOrUpdateFileContents({
    owner,
    repo,
    path: args.file.path,
    message: args.message,
    content: contentB64,
    branch: cfg.githubBranch,
    sha: args.sha,
    committer: {
      name: cfg.commitAuthorName,
      email: cfg.commitAuthorEmail,
    },
    author: {
      name: cfg.commitAuthorName,
      email: cfg.commitAuthorEmail,
    },
  });

  return {
    sha: res.data.content?.sha ?? "",
    commitSha: res.data.commit.sha ?? "",
  };
}

export async function commitChangesUpstream(args: {
  changes: RepoChange[];
  message: string;
}): Promise<{ commitSha: string; files: Record<string, string> }> {
  if (args.changes.length === 0) return { commitSha: "", files: {} };

  const cfg = adminConfig();
  if (cfg.dryRun) return commitChangesLocal(args);

  const { owner, repo } = repoParts();
  const branchRef = `heads/${cfg.githubBranch}`;
  const ref = await octokit().git.getRef({
    owner,
    repo,
    ref: branchRef,
  });
  const parentSha = ref.data.object.sha;
  const parent = await octokit().git.getCommit({
    owner,
    repo,
    commit_sha: parentSha,
  });

  const files: Record<string, string> = {};
  const tree = await Promise.all(
    args.changes.map(async (change) => {
      if ("delete" in change && change.delete) {
        return {
          path: change.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: null,
        };
      }

      const encoding = change.encoding ?? "utf-8";
      const content =
        encoding === "base64"
          ? typeof change.content === "string"
            ? change.content
            : change.content.toString("base64")
          : typeof change.content === "string"
            ? change.content
            : change.content.toString("utf8");
      const blob = await octokit().git.createBlob({
        owner,
        repo,
        content,
        encoding: encoding === "base64" ? "base64" : "utf-8",
      });
      files[change.path] = blob.data.sha;
      return {
        path: change.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.data.sha,
      };
    }),
  );

  const nextTree = await octokit().git.createTree({
    owner,
    repo,
    base_tree: parent.data.tree.sha,
    tree,
  });
  const commit = await octokit().git.createCommit({
    owner,
    repo,
    message: args.message,
    tree: nextTree.data.sha,
    parents: [parentSha],
    author: {
      name: cfg.commitAuthorName,
      email: cfg.commitAuthorEmail,
    },
    committer: {
      name: cfg.commitAuthorName,
      email: cfg.commitAuthorEmail,
    },
  });
  await octokit().git.updateRef({
    owner,
    repo,
    ref: branchRef,
    sha: commit.data.sha,
  });

  return { commitSha: commit.data.sha, files };
}

export async function deleteFileUpstream(args: {
  path: string;
  sha: string;
  message: string;
}): Promise<void> {
  const cfg = adminConfig();
  if (cfg.dryRun) {
    await fs.unlink(path.join(process.cwd(), args.path));
    return;
  }
  const { owner, repo } = repoParts();
  await octokit().repos.deleteFile({
    owner,
    repo,
    path: args.path,
    message: args.message,
    sha: args.sha,
    branch: cfg.githubBranch,
    committer: {
      name: cfg.commitAuthorName,
      email: cfg.commitAuthorEmail,
    },
    author: {
      name: cfg.commitAuthorName,
      email: cfg.commitAuthorEmail,
    },
  });
}

// --- Local fallbacks for ADMIN_DRY_RUN=1 ---

async function listDirLocal(dirPath: string): Promise<RepoFile[]> {
  const abs = path.join(process.cwd(), dirPath);
  try {
    const entries = await fs.readdir(abs, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => ({
        path: path.posix.join(dirPath, e.name),
        sha: "local",
        size: 0,
      }));
  } catch {
    return [];
  }
}

async function listDirRecursiveLocal(dirPath: string): Promise<RepoFile[]> {
  const abs = path.join(process.cwd(), dirPath);
  const out: RepoFile[] = [];

  async function walk(currentAbs: string, currentRel: string) {
    let entries;
    try {
      entries = await fs.readdir(currentAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childAbs = path.join(currentAbs, entry.name);
      const childRel = path.posix.join(currentRel, entry.name);
      if (entry.isDirectory()) {
        await walk(childAbs, childRel);
      } else if (entry.isFile()) {
        const stat = await fs.stat(childAbs);
        out.push({ path: childRel, sha: "local", size: stat.size });
      }
    }
  }

  await walk(abs, dirPath);
  return out;
}

async function getFileLocal(filePath: string): Promise<RepoFileContent | null> {
  const abs = path.join(process.cwd(), filePath);
  try {
    const content = await fs.readFile(abs, "utf8");
    return { path: filePath, sha: "local", content };
  } catch {
    return null;
  }
}

async function getBinaryFileLocal(
  filePath: string,
): Promise<RepoBinaryFile | null> {
  const abs = path.join(process.cwd(), filePath);
  try {
    const content = await fs.readFile(abs);
    const stat = await fs.stat(abs);
    return { path: filePath, sha: "local", size: stat.size, content };
  } catch {
    return null;
  }
}

async function commitFileLocal(args: {
  file: CommitFile;
  message: string;
}): Promise<{ sha: string; commitSha: string }> {
  const abs = path.join(process.cwd(), args.file.path);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  if (args.file.encoding === "base64") {
    const buf =
      typeof args.file.content === "string"
        ? Buffer.from(args.file.content, "base64")
        : args.file.content;
    await fs.writeFile(abs, buf);
  } else {
    await fs.writeFile(abs, args.file.content as string, "utf8");
  }
  console.log(`[dry-run] wrote ${args.file.path} (${args.message})`);
  return { sha: "local", commitSha: "local" };
}

async function commitChangesLocal(args: {
  changes: RepoChange[];
  message: string;
}): Promise<{ commitSha: string; files: Record<string, string> }> {
  const files: Record<string, string> = {};
  for (const change of args.changes) {
    const abs = path.join(process.cwd(), change.path);
    if ("delete" in change && change.delete) {
      await fs.rm(abs, { force: true });
      console.log(`[dry-run] deleted ${change.path} (${args.message})`);
      continue;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    if (change.encoding === "base64") {
      const buf =
        typeof change.content === "string"
          ? Buffer.from(change.content, "base64")
          : change.content;
      await fs.writeFile(abs, buf);
    } else {
      await fs.writeFile(abs, change.content as string | Buffer);
    }
    files[change.path] = "local";
    console.log(`[dry-run] wrote ${change.path} (${args.message})`);
  }
  return { commitSha: "local", files };
}
