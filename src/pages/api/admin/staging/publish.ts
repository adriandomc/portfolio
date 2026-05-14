import type { APIRoute } from "astro";
import {
  buildPublishChanges,
  clearStagingAfterPublish,
  getStagingDiff,
} from "../../../../lib/admin/staging";
import { commitChangesUpstream } from "../../../../lib/admin/github-upstream";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
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
