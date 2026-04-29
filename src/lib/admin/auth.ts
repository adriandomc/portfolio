import { argon2id, argon2Verify } from "hash-wasm";
import { randomBytes } from "node:crypto";
import { TOTP } from "otpauth";
import { getEnv } from "./env";

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = getEnv("ADMIN_PASSWORD_HASH");
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(randomBytes(16));
  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: "encoded",
  });
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
