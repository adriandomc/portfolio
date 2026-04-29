import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function b64encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function b64decode<T>(s: string): T | null {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function createSessionToken(subject: string): string {
  const secret = getEnv("SESSION_SECRET");
  const now = Date.now();
  const payload: SessionPayload = {
    sub: subject,
    iat: now,
    exp: now + SESSION_TTL_MS,
    jti: randomBytes(16).toString("hex"),
  };
  const body = b64encode(payload);
  const sig = sign(body, secret);
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const secret = getEnv("SESSION_SECRET");
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = b64decode<SessionPayload>(body);
  if (!payload) return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}

export function readSessionFromCookies(
  cookieHeader: string | null,
): SessionPayload | null {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token);
}

export function buildSessionCookie(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function buildLogoutCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0",
  ].join("; ");
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
