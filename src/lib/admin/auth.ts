import argon2 from "argon2";
import { TOTP } from "otpauth";
import { getEnv } from "./env";

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = getEnv("ADMIN_PASSWORD_HASH");
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

function getTotp(): TOTP {
  return new TOTP({
    issuer: "Portfolio Admin",
    label: "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: getEnv("ADMIN_TOTP_SECRET"),
  });
}

export function verifyTotp(code: string): boolean {
  const totp = getTotp();
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const delta = totp.validate({ token: cleaned, window: 1 });
  return delta !== null;
}
