import type { APIRoute } from "astro";
import { verifyPassword, verifyTotp } from "../../../lib/admin/auth";
import {
  buildSessionCookie,
  createSessionToken,
} from "../../../lib/admin/session";
import { clientIp, rateLimit } from "../../../lib/admin/rate-limit";

export const prerender = false;

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function safeNext(next: string | null): string {
  if (!next) return "/admin";
  if (!next.startsWith("/")) return "/admin";
  if (next.startsWith("//")) return "/admin";
  return next;
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request);
  const limit = rateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.allowed) {
    return redirect("/admin/login?error=ratelimit");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirect("/admin/login?error=invalid");
  }

  const password = String(formData.get("password") ?? "");
  const totp = String(formData.get("totp") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/admin"));

  if (!password || !totp) {
    return redirect("/admin/login?error=invalid");
  }

  let passOk = false;
  let totpOk = false;
  try {
    passOk = await verifyPassword(password);
    totpOk = verifyTotp(totp);
  } catch (err) {
    console.error("login config error", err);
    return redirect("/admin/login?error=config");
  }

  if (!passOk) {
    return redirect("/admin/login?error=invalid");
  }
  if (!totpOk) {
    return redirect("/admin/login?error=totp");
  }

  const token = createSessionToken("admin");
  const cookie = buildSessionCookie(token);
  return redirect(next, cookie);
};
