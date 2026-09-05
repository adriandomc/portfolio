# Admin

Self-hosted post editor at `/admin`. Authenticates with password + TOTP,
stages MDX changes server-side, then publishes them to this repo as a single
commit via the GitHub API.

## First-time setup

```sh
npm install
npm run admin:setup       # prompts for password, prints env values + QR code
```

Paste the printed values into Coolify's env vars (and `.env` for local dev).
Add a fine-grained GitHub PAT scoped to this repo only with `contents:write`
as `GITHUB_TOKEN`.

## Running

- **Build**: `npm run build`
- **Start (production)**: `npm start` (runs `node ./dist/server/entry.mjs`)
- **Dev**: `npm run dev`

In Coolify, set the start command to `node ./dist/server/entry.mjs` (or
`npm start`) and expose the port from `PORT` (default `4321`).

## Local testing without a real GitHub token

```sh
ADMIN_DRY_RUN=1 npm start
```

Saves write to your local `src/content/...` instead of committing to GitHub.

## Editor model

- TipTap-based rich-text editor for the body.
- Frontmatter form for title/description/date/tags/draft.
- Insert custom MDX components (`ImageCarousel`, `Figure`, `Card`, `Badge`,
  `Button`, `Table`) as visual blocks; click a block to edit its props.
- Image uploads in editor write to `public/images/<folder>/...`.
- Toggle "Draft" in the form to publish/unpublish without deleting the file.

## Staging and publishing

Saving does **not** commit. Every admin write (posts, media, reordering) lands
in a server-side staging area first; the bar at the top of `/admin` lists what
is pending and lets you discard a single batch or all of it. Reads are overlaid
on top of GitHub, so the admin shows staged content as if it were live.

"Publish" bundles everything into **one** commit on `main` via the Git Data
API, then clears staging. Coolify sees the push and redeploys.

Two guards run before that commit:

- **Lost-update check.** The commit the changes were staged on is recorded in
  the manifest. If any staged path moved on `main` since then — a push from
  your IDE, say — publish returns `409` and names the files instead of
  overwriting them. Discard and redo the edit.
- **Already-applied check.** If the branch head already matches every staged
  change (a publish whose response was lost), staging is cleared without a
  duplicate commit.

Frontmatter is validated against `src/content.schemas.ts` — the same schemas
the content collections use — so a bad save is rejected here rather than
breaking the next build. Keys the editor has no field for (`summary`, `role`,
`year`, …) are merged forward, not dropped.

> **Production requirement:** the staging area lives on disk (`ADMIN_STAGING_DIR`,
> default `<cwd>/.admin-staging`). Mount it as a persistent volume in Coolify,
> or every restart silently discards unpublished work. See `.env.example`.

## Security

- argon2 password hash + TOTP (RFC 6238).
- Sessions: HMAC-signed cookies, `HttpOnly Secure SameSite=Strict`, 12h TTL.
- Login rate limit: 5 attempts / 15 min per IP (in-memory).
- `/admin/*` and `/api/admin/*` gated by middleware.
- `noindex,nofollow` on every admin page.
- No secrets are stored in the repo — only in Coolify env vars.
