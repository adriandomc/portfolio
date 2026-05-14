import type { APIRoute } from "astro";
import { updateProjectsOrdering } from "../../../../lib/admin/posts";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let payload: {
    updates?: Array<{ slug?: unknown; order?: unknown; featured?: unknown }>;
  };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!Array.isArray(payload.updates)) {
    return json({ error: "Missing 'updates' array." }, 400);
  }
  const updates = payload.updates.map((entry, index) => {
    const slug = typeof entry.slug === "string" ? entry.slug : "";
    const order = Number(entry.order);
    const featured = Boolean(entry.featured);
    if (!slug) throw new Error(`Update at index ${index} is missing a slug.`);
    if (!Number.isFinite(order)) {
      throw new Error(`Update for ${slug} has invalid order.`);
    }
    return { slug, order, featured };
  });
  try {
    const result = await updateProjectsOrdering({ updates });
    return json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reorder failed.";
    return json({ error: message }, 500);
  }
};
