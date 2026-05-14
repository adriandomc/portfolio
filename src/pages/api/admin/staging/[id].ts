import type { APIRoute } from "astro";
import { discardTransaction } from "../../../../lib/admin/staging";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id || typeof id !== "string") {
    return json({ error: "Transaction id required." }, 400);
  }
  try {
    const removed = await discardTransaction(id);
    if (!removed) {
      return json({ error: "Transaction not found." }, 404);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("staging discard transaction error", err);
    return json(
      { error: err instanceof Error ? err.message : "Discard failed." },
      500,
    );
  }
};
