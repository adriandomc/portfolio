import { defineMiddleware } from "astro:middleware";
import { readSessionFromCookies } from "./lib/admin/session";

const PUBLIC_ADMIN_PATHS = new Set<string>([
  "/admin/login",
  "/api/admin/login",
  "/api/admin/logout",
]);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");
  if (!isAdminPage && !isAdminApi) return next();
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return next();

  const session = readSessionFromCookies(
    context.request.headers.get("cookie"),
  );
  context.locals.session = session;

  if (!session) {
    if (isAdminApi) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const next = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/admin/login?next=${next}`);
  }

  return next();
});
