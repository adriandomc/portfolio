import type { APIRoute } from "astro";
import {
  createMediaFolder,
  deleteMedia,
  deleteMediaFolder,
  listMediaLibrary,
  MAX_MEDIA_SIZE,
  MediaError,
  moveMedia,
  moveMediaFolder,
  uploadMedia,
} from "../../../lib/admin/media";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonError(err: unknown, fallback = "Media request failed."): Response {
  if (err instanceof MediaError) {
    return json(
      {
        error: err.message,
        references: err.references ?? [],
      },
      err.status,
    );
  }
  console.error("media api error", err);
  return json(
    { error: err instanceof Error ? err.message : fallback },
    500,
  );
}

export const GET: APIRoute = async () => {
  try {
    return json(await listMediaLibrary());
  } catch (err) {
    return jsonError(err, "Failed to list media.");
  }
};

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let payload: {
      kind?: "folder";
      root?: string;
      folder?: string;
    };
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }
    if (payload.kind !== "folder") {
      return json({ error: "Unsupported media action." }, 400);
    }
    try {
      return json(await createMediaFolder({
        root: payload.root,
        folder: payload.folder,
      }));
    } catch (err) {
      return jsonError(err, "Create folder failed.");
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data." }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "Missing 'file' field." }, 400);
  }
  if (file.size > MAX_MEDIA_SIZE) {
    return json({ error: `File too large (max ${MAX_MEDIA_SIZE / 1024 / 1024}MB).` }, 400);
  }

  try {
    const result = await uploadMedia({
      content: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || "image",
      type: file.type,
      size: file.size,
      root: form.get("root") ?? "images",
      folder: form.get("folder") ?? "",
      filename: form.get("filename") ?? undefined,
    });
    return json(result);
  } catch (err) {
    return jsonError(err, "Upload failed.");
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  let payload: {
    kind?: "file" | "folder";
    repoPath?: string;
    root?: string;
    folder?: string;
    nextRoot?: string;
    nextFolder?: string;
    filename?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  try {
    const result =
      payload.kind === "folder"
        ? await moveMediaFolder({
            root: payload.root,
            folder: payload.folder,
            nextRoot: payload.nextRoot,
            nextFolder: payload.nextFolder,
          })
        : await moveMedia({
            repoPath: payload.repoPath ?? "",
            root: payload.root,
            folder: payload.folder,
            filename: payload.filename,
          });
    return json(result);
  } catch (err) {
    return jsonError(err, "Move failed.");
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  let payload: {
    kind?: "file" | "folder";
    repoPath?: string;
    root?: string;
    folder?: string;
    force?: boolean;
  };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  try {
    const result =
      payload.kind === "folder"
        ? await deleteMediaFolder({
            root: payload.root,
            folder: payload.folder,
            force: Boolean(payload.force),
          })
        : await deleteMedia({
            repoPath: payload.repoPath ?? "",
            force: Boolean(payload.force),
          });
    return json(result);
  } catch (err) {
    return jsonError(err, "Delete failed.");
  }
};
