const SESSION_COOKIE = "wb_session";

async function sha256(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sessionToken(username: string, password: string): Promise<string> {
  return sha256(`${username}:${password}`);
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export function isAuthRequired(): boolean {
  const u = process.env.LOGIN_USERNAME;
  const p = process.env.LOGIN_PASSWORD;
  return Boolean(u && p);
}

export async function validateSession(cookieValue: string | undefined): Promise<boolean> {
  const username = process.env.LOGIN_USERNAME;
  const password = process.env.LOGIN_PASSWORD;
  if (!username || !password) return true;
  if (!cookieValue) return false;
  const expected = await sessionToken(username, password);
  return cookieValue === expected;
}
