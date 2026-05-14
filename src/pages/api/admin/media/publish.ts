import type { APIRoute } from "astro";
import {
  MediaError,
  publishPendingActions,
  type PendingAction,
} from "../../../../lib/admin/media";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonError(err: unknown, fallback = "Publish failed."): Response {
  if (err instanceof MediaError) {
    return json(
      {
        error: err.message,
        references: err.references ?? [],
      },
      err.status,
    );
  }
  console.error("media publish error", err);
  return json(
    { error: err instanceof Error ? err.message : fallback },
    500,
  );
}

export const POST: APIRoute = async ({ request }) => {
  let payload: { actions?: PendingAction[] };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!Array.isArray(payload.actions) || payload.actions.length === 0) {
    return json({ error: "Missing 'actions' array." }, 400);
  }
  try {
    return json(await publishPendingActions({ actions: payload.actions }));
  } catch (err) {
    return jsonError(err);
  }
};
