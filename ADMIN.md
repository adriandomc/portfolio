# Admin

Self-hosted post editor at `/admin`. Authenticates with password + TOTP,
commits MDX directly to this repo via the GitHub API.

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
- Image uploads in editor commit to `public/images/<folder>/...` in the repo.
- Saving commits the MDX file to `main`; Coolify rebuilds and deploys.
- Toggle "Draft" in the form to publish/unpublish without deleting the file.

## Security

- argon2 password hash + TOTP (RFC 6238).
- Sessions: HMAC-signed cookies, `HttpOnly Secure SameSite=Strict`, 12h TTL.
- Login rate limit: 5 attempts / 15 min per IP (in-memory).
- `/admin/*` and `/api/admin/*` gated by middleware.
- `noindex,nofollow` on every admin page.
- No secrets are stored in the repo — only in Coolify env vars.
