#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { Secret } from "otpauth";
import qrcode from "qrcode";

async function prompt(question, { hidden = false } = {}) {
  const rl = createInterface({ input: stdin, output: stdout });
  if (hidden) {
    const writeOriginal = stdout.write.bind(stdout);
    stdout.write = (chunk, encoding, cb) => {
      if (typeof chunk === "string" && chunk !== question) {
        return writeOriginal("", encoding, cb);
      }
      return writeOriginal(chunk, encoding, cb);
    };
    const answer = await rl.question(question);
    stdout.write = writeOriginal;
    rl.close();
    stdout.write("\n");
    return answer;
  }
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function main() {
  console.log("\nPortfolio admin setup\n=====================\n");
  const password = await prompt("Choose admin password: ", { hidden: true });
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }
  const confirm = await prompt("Confirm admin password: ", { hidden: true });
  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const totpSecret = new Secret({ size: 20 }).base32;
  const sessionSecret = randomBytes(32).toString("hex");

  const issuer = "Portfolio Admin";
  const label = "admin";
  const otpauthUrl =
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}` +
    `?secret=${totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  console.log("\nScan this QR code with 1Password / Authy / Google Authenticator:\n");
  const qr = await qrcode.toString(otpauthUrl, { type: "terminal", small: true });
  console.log(qr);
  console.log(`Or enter this secret manually: ${totpSecret}\n`);

  console.log("Add the following env vars to Coolify (and your local .env):\n");
  console.log(`ADMIN_PASSWORD_HASH='${passwordHash}'`);
  console.log(`ADMIN_TOTP_SECRET='${totpSecret}'`);
  console.log(`SESSION_SECRET='${sessionSecret}'`);
  console.log("\nStill required (set these yourself):");
  console.log("GITHUB_TOKEN='<fine-grained PAT, contents:write on this repo>'");
  console.log("GITHUB_REPO='adriandomc/portfolio'");
  console.log("GITHUB_DEFAULT_BRANCH='main'");
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
