import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RepoChange } from "./github-upstream";

export interface StagedChange {
  path: string;
  delete: boolean;
  encoding?: "utf-8" | "base64";
  blobRef?: string;
  size: number;
}

export interface StagedTransaction {
  id: string;
  message: string;
  createdAt: string;
  changes: StagedChange[];
}

export interface StagingManifest {
  version: 1;
  transactions: StagedTransaction[];
}

export interface StagingDiff {
  total: number;
  transactions: Array<{
    id: string;
    message: string;
    createdAt: string;
    paths: Array<{ path: string; delete: boolean; size: number }>;
  }>;
}

export type StagedFileState =
  | { kind: "deleted" }
  | { kind: "present"; encoding: "utf-8" | "base64"; content: Buffer; size: number };

function stagingDir(): string {
  return (
    process.env.ADMIN_STAGING_DIR ||
    path.join(process.cwd(), ".admin-staging")
  );
}

function blobsDir(): string {
  return path.join(stagingDir(), "blobs");
}

function manifestPath(): string {
  return path.join(stagingDir(), "manifest.json");
}

function blobPath(blobRef: string): string {
  return path.join(blobsDir(), blobRef);
}

let lock: Promise<void> = Promise.resolve();
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release!: () => void;
  lock = new Promise<void>((r) => {
    release = r;
  });
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(blobsDir(), { recursive: true });
}

async function readManifest(): Promise<StagingManifest> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(manifestPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.version === 1 &&
      Array.isArray(parsed.transactions)
    ) {
      return parsed as StagingManifest;
    }
  } catch (err) {
    const e = err as { code?: string };
    if (e.code !== "ENOENT") {
      try {
        const backupName = `manifest.broken.${Date.now()}.json`;
        await fs.rename(manifestPath(), path.join(stagingDir(), backupName));
        console.error(
          `[staging] manifest corrupt, backed up to ${backupName}:`,
          err,
        );
      } catch {
        /* ignore */
      }
    }
  }
  return { version: 1, transactions: [] };
}

async function writeManifest(m: StagingManifest): Promise<void> {
  await ensureDirs();
  const tmp = manifestPath() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(m, null, 2), "utf-8");
  await fs.rename(tmp, manifestPath());
}

function bufferFromChange(change: Exclude<RepoChange, { delete: true }>): Buffer {
  const encoding = change.encoding ?? "utf-8";
  if (encoding === "base64") {
    return typeof change.content === "string"
      ? Buffer.from(change.content, "base64")
      : change.content;
  }
  return typeof change.content === "string"
    ? Buffer.from(change.content, "utf-8")
    : change.content;
}

export async function stageBatch(args: {
  changes: RepoChange[];
  message: string;
}): Promise<{ transactionId: string }> {
  if (args.changes.length === 0) return { transactionId: "" };
  return withLock(async () => {
    const manifest = await readManifest();
    const txId = randomUUID();
    const transaction: StagedTransaction = {
      id: txId,
      message: args.message,
      createdAt: new Date().toISOString(),
      changes: [],
    };

    for (const change of args.changes) {
      if ("delete" in change && change.delete) {
        transaction.changes.push({
          path: change.path,
          delete: true,
          size: 0,
        });
        continue;
      }
      const buf = bufferFromChange(change);
      const blobRef = randomUUID();
      await fs.writeFile(blobPath(blobRef), buf);
      transaction.changes.push({
        path: change.path,
        delete: false,
        encoding: change.encoding ?? "utf-8",
        blobRef,
        size: buf.length,
      });
    }

    manifest.transactions.push(transaction);
    await writeManifest(manifest);
    return { transactionId: txId };
  });
}

function latestPerPath(manifest: StagingManifest): Map<string, StagedChange> {
  const map = new Map<string, StagedChange>();
  for (const tx of manifest.transactions) {
    for (const change of tx.changes) {
      map.set(change.path, change);
    }
  }
  return map;
}

export async function getStagedFile(repoPath: string): Promise<StagedFileState | null> {
  const manifest = await readManifest();
  const latest = latestPerPath(manifest).get(repoPath);
  if (!latest) return null;
  if (latest.delete) return { kind: "deleted" };
  if (!latest.blobRef) return null;
  try {
    const content = await fs.readFile(blobPath(latest.blobRef));
    return {
      kind: "present",
      encoding: latest.encoding ?? "utf-8",
      content,
      size: latest.size,
    };
  } catch {
    return null;
  }
}

export async function getStagingState(): Promise<{
  additions: Map<string, { encoding: "utf-8" | "base64"; size: number }>;
  deletions: Set<string>;
}> {
  const manifest = await readManifest();
  const additions = new Map<string, { encoding: "utf-8" | "base64"; size: number }>();
  const deletions = new Set<string>();
  for (const tx of manifest.transactions) {
    for (const change of tx.changes) {
      if (change.delete) {
        additions.delete(change.path);
        deletions.add(change.path);
      } else {
        deletions.delete(change.path);
        additions.set(change.path, {
          encoding: change.encoding ?? "utf-8",
          size: change.size,
        });
      }
    }
  }
  return { additions, deletions };
}

export async function getStagingDiff(): Promise<StagingDiff> {
  const manifest = await readManifest();
  return {
    total: manifest.transactions.reduce((sum, tx) => sum + tx.changes.length, 0),
    transactions: manifest.transactions.map((tx) => ({
      id: tx.id,
      message: tx.message,
      createdAt: tx.createdAt,
      paths: tx.changes.map((c) => ({
        path: c.path,
        delete: c.delete,
        size: c.size,
      })),
    })),
  };
}

export async function discardTransaction(transactionId: string): Promise<boolean> {
  return withLock(async () => {
    const manifest = await readManifest();
    const tx = manifest.transactions.find((t) => t.id === transactionId);
    if (!tx) return false;
    for (const change of tx.changes) {
      if (change.blobRef) {
        await fs.rm(blobPath(change.blobRef), { force: true });
      }
    }
    manifest.transactions = manifest.transactions.filter((t) => t.id !== transactionId);
    await writeManifest(manifest);
    return true;
  });
}

async function wipeContents(): Promise<void> {
  await ensureDirs();
  let entries: Array<{ name: string }> = [];
  try {
    entries = await fs.readdir(stagingDir(), { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(stagingDir(), entry.name);
      await fs.rm(target, { recursive: true, force: true });
    }),
  );
  await ensureDirs();
  await writeManifest({ version: 1, transactions: [] });
}

export async function discardAll(): Promise<void> {
  return withLock(wipeContents);
}

export async function buildPublishChanges(): Promise<RepoChange[]> {
  const manifest = await readManifest();
  const latest = latestPerPath(manifest);
  const changes: RepoChange[] = [];
  for (const [repoPath, change] of latest) {
    if (change.delete) {
      changes.push({ path: repoPath, delete: true });
      continue;
    }
    if (!change.blobRef) continue;
    const content = await fs.readFile(blobPath(change.blobRef));
    changes.push({
      path: repoPath,
      content,
      encoding: change.encoding ?? "utf-8",
    });
  }
  return changes;
}

export async function clearStagingAfterPublish(): Promise<void> {
  return withLock(wipeContents);
}
