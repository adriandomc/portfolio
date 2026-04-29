import type { APIRoute } from "astro";
import { commitFile } from "../../../lib/admin/github";

export const prerender = false;

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function safeFilename(name: string, ext: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const stamp = Date.now().toString(36);
  const slug = base || "image";
  return `${slug}-${stamp}.${ext}`;
}

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected multipart/form-data.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("Missing 'file' field.");
  }
  if (file.size > MAX_SIZE) {
    return jsonError(`File too large (max ${MAX_SIZE / 1024 / 1024}MB).`);
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return jsonError(`Unsupported type: ${file.type}`);
  }

  const folderRaw = String(form.get("folder") ?? "uploads");
  const folder = folderRaw.replace(/[^a-z0-9-/]/gi, "").replace(/^\/+|\/+$/g, "");
  if (!folder) return jsonError("Invalid folder.");

  const filename = safeFilename(file.name || "image", ext);
  const repoPath = `public/images/${folder}/${filename}`;
  const publicPath = `/images/${folder}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await commitFile({
      file: { path: repoPath, content: buffer, encoding: "base64" },
      message: `content(images): upload ${filename}`,
    });
    return new Response(
      JSON.stringify({ path: publicPath, repoPath }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    console.error("image upload failed", err);
    const status = (err as { status?: number }).status ?? 500;
    return jsonError(
      err instanceof Error ? err.message : "Upload failed.",
      status >= 400 && status < 600 ? status : 500,
    );
  }
};
