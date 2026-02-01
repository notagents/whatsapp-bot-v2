import { sessionCookieName, validateSession } from "./auth";

export async function requireAuth(request: Request): Promise<string> {
  const cookie = request.headers.get("cookie");
  const match = cookie?.match(new RegExp(`${sessionCookieName()}=([^;]+)`));
  const cookieValue = match?.[1];
  const valid = await validateSession(cookieValue);
  if (!valid) {
    throw new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const username = process.env.LOGIN_USERNAME;
  return username ?? "unknown";
}
