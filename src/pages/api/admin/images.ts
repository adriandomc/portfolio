import type { APIRoute } from "astro";
import {
  MAX_MEDIA_SIZE,
  MediaError,
  uploadMedia,
} from "../../../lib/admin/media";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data." }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Missing 'file' field." }, 400);
  if (file.size > MAX_MEDIA_SIZE) {
    return json({ error: `File too large (max ${MAX_MEDIA_SIZE / 1024 / 1024}MB).` }, 400);
  }

  try {
    const result = await uploadMedia({
      content: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || "image",
      type: file.type,
      size: file.size,
      root: "images",
      folder: form.get("folder") ?? "uploads",
      filename: form.get("filename") ?? undefined,
    });
    return json({
      path: result.item?.path,
      repoPath: result.item?.repoPath,
      item: result.item,
    });
  } catch (err) {
    if (err instanceof MediaError) {
      return json({ error: err.message, references: err.references ?? [] }, err.status);
    }
    console.error("image upload failed", err);
    return json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      500,
    );
  }
};
