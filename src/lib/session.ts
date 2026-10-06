import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed session cookie.
 *
 * The cookie used to contain the plain e-mail, so anyone could forge it from the
 * browser devtools. Now its value is `<email>.<hmac>` signed with SESSION_SECRET:
 * a cookie without a valid signature is ignored and the user has to log in again.
 */
export const SESSION_COOKIE = "user_email";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 giorni

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET mancante o troppo corto (min 32 caratteri). Impostalo nelle variabili ambiente."
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSessionValue(email: string): string {
  const normalized = email.toLowerCase().trim();
  return `${normalized}.${sign(normalized)}`;
}

/** Returns the e-mail stored in a valid signed cookie, or null. */
export function readSessionValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const email = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(email));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return email;
}

export function sessionCookieOptions(rememberMe: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // Senza "Ricordami" il cookie dura fino alla chiusura del browser.
    ...(rememberMe ? { maxAge: SESSION_MAX_AGE } : {}),
  };
}
