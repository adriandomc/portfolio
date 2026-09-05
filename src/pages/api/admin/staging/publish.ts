import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import {
  buildPublishChanges,
  clearStagingAfterPublish,
  getBaseCommitSha,
  getStagingDiff,
} from "../../../../lib/admin/staging";
import {
  commitChangesUpstream,
  getHeadShaUpstream,
  getTreeShasUpstream,
  type RepoChange,
} from "../../../../lib/admin/github-upstream";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isDelete(change: RepoChange): boolean {
  return "delete" in change && change.delete === true;
}

function contentBuffer(change: RepoChange): Buffer {
  if (isDelete(change)) return Buffer.alloc(0);
  const write = change as Extract<RepoChange, { delete?: false }>;
  if (typeof write.content !== "string") return write.content;
  return Buffer.from(
    write.content,
    write.encoding === "base64" ? "base64" : "utf-8",
  );
}

/** Git's object id for a blob: sha1("blob <bytes>\0" + content). */
function gitBlobSha(content: Buffer): string {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

type Preflight =
  | { state: "clean" }
  | { state: "applied" }
  | { state: "conflict"; paths: string[] };

/**
 * Compares the staged changes against the branch head before overwriting it.
 * Blob shas are computed locally, so this costs one API call when nothing has
 * moved upstream and three at worst — versus one file download per change.
 */
async function preflight(
  changes: RepoChange[],
  baseCommitSha: string | undefined,
): Promise<Preflight> {
  const headSha = await getHeadShaUpstream();
  // No recorded base (lookup failed at stage time, or dry-run): nothing to
  // compare against, so behave as before and let the commit through.
  if (!baseCommitSha || headSha === baseCommitSha) return { state: "clean" };

  const [headTree, baseTree] = await Promise.all([
    getTreeShasUpstream(headSha),
    getTreeShasUpstream(baseCommitSha),
  ]);

  const matchesHead = (change: RepoChange): boolean =>
    isDelete(change)
      ? !headTree.has(change.path)
      : headTree.get(change.path) === gitBlobSha(contentBuffer(change));

  if (changes.every(matchesHead)) return { state: "applied" };

  const paths = changes
    .filter(
      (change) =>
        headTree.get(change.path) !== baseTree.get(change.path) &&
        !matchesHead(change),
    )
    .map((change) => change.path);

  return paths.length > 0 ? { state: "conflict", paths } : { state: "clean" };
}

function summaryMessage(diff: Awaited<ReturnType<typeof getStagingDiff>>): string {
  const counts = { add: 0, delete: 0 };
  const seen = new Set<string>();
  for (const tx of diff.transactions) {
    for (const p of tx.paths) {
      if (seen.has(p.path)) continue;
      seen.add(p.path);
      if (p.delete) counts.delete += 1;
      else counts.add += 1;
    }
  }
  const total = counts.add + counts.delete;
  if (total === 0) return "content(admin): publish";
  if (total === 1) {
    return counts.delete === 1
      ? `content(admin): delete 1 file`
      : `content(admin): write 1 file`;
  }
  const parts: string[] = [];
  if (counts.add > 0) parts.push(`${counts.add} write${counts.add === 1 ? "" : "s"}`);
  if (counts.delete > 0)
    parts.push(`${counts.delete} delete${counts.delete === 1 ? "" : "s"}`);
  return `content(admin): publish ${parts.join(", ")}`;
}

export const POST: APIRoute = async ({ request }) => {
  let payload: { message?: string } = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      payload = await request.json();
    }
  } catch {
    /* ignore */
  }

  try {
    const diff = await getStagingDiff();
    if (diff.total === 0) {
      return json({ error: "Nothing to publish." }, 400);
    }
    const changes = await buildPublishChanges();
    if (changes.length === 0) {
      return json({ error: "Nothing to publish." }, 400);
    }
    const check = await preflight(changes, await getBaseCommitSha());
    if (check.state === "applied") {
      await clearStagingAfterPublish();
      return json({
        commitSha: "already-applied",
        published: 0,
        skipped: true,
      });
    }
    if (check.state === "conflict") {
      return json(
        {
          error:
            `Changed on ${process.env.GITHUB_DEFAULT_BRANCH ?? "main"} since you staged this: ` +
            `${check.paths.join(", ")}. Publishing would overwrite it — discard and redo the edit.`,
          conflicts: check.paths,
        },
        409,
      );
    }
    const message = payload.message?.trim() || summaryMessage(diff);
    const result = await commitChangesUpstream({ changes, message });
    await clearStagingAfterPublish();
    return json({ commitSha: result.commitSha, published: changes.length });
  } catch (err) {
    console.error("staging publish error", err);
    const status = (err as { status?: number }).status ?? 500;
    return json(
      { error: err instanceof Error ? err.message : "Publish failed." },
      status >= 400 && status < 600 ? status : 500,
    );
  }
};
