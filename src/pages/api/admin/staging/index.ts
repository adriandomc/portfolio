import type { APIRoute } from "astro";
import { getStagingDiff } from "../../../../lib/admin/staging";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const GET: APIRoute = async () => {
  try {
    const diff = await getStagingDiff();
    return json(diff);
  } catch (err) {
    console.error("staging diff error", err);
    return json(
      { error: err instanceof Error ? err.message : "Failed to read staging." },
      500,
    );
  }
};
