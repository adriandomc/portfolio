const REQUIRED = [
  "ADMIN_PASSWORD_HASH",
  "ADMIN_TOTP_SECRET",
  "SESSION_SECRET",
  "GITHUB_TOKEN",
  "GITHUB_REPO",
] as const;

type RequiredKey = (typeof REQUIRED)[number];

export function getEnv(key: RequiredKey): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required env var ${key}. Run \`npm run admin:setup\` to generate secrets.`,
    );
  }
  return value;
}

export function getOptionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function isDryRun(): boolean {
  return process.env.ADMIN_DRY_RUN === "1";
}

export function adminConfig() {
  return {
    githubRepo: getEnv("GITHUB_REPO"),
    githubBranch: getOptionalEnv("GITHUB_DEFAULT_BRANCH", "main"),
    githubToken: getEnv("GITHUB_TOKEN"),
    commitAuthorName: getOptionalEnv("GIT_AUTHOR_NAME", "Portfolio Admin"),
    commitAuthorEmail: getOptionalEnv(
      "GIT_AUTHOR_EMAIL",
      "admin@adriandomc.com",
    ),
    dryRun: isDryRun(),
  };
}
