import type { APIRoute } from "astro";
import { discardAll } from "../../../../lib/admin/staging";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async () => {
  try {
    await discardAll();
    return json({ ok: true });
  } catch (err) {
    console.error("staging discard error", err);
    return json(
      { error: err instanceof Error ? err.message : "Discard failed." },
      500,
    );
  }
};
