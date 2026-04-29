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

export async function listDir(dirPath: string): Promise<RepoFile[]> {
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

export interface RepoFileContent {
  path: string;
  sha: string;
  content: string;
}

export async function getFile(filePath: string): Promise<RepoFileContent | null> {
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

export interface CommitFile {
  path: string;
  content: string | Buffer;
  encoding?: "utf-8" | "base64";
}

export async function commitFile(args: {
  file: CommitFile;
  message: string;
  sha?: string;
}): Promise<{ sha: string; commitSha: string }> {
  const cfg = adminConfig();
  if (cfg.dryRun) {
    return commitFileLocal(args);
  }

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

export async function deleteFile(args: {
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

async function getFileLocal(filePath: string): Promise<RepoFileContent | null> {
  const abs = path.join(process.cwd(), filePath);
  try {
    const content = await fs.readFile(abs, "utf8");
    return { path: filePath, sha: "local", content };
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
