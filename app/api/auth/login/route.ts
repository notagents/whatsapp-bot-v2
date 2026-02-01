import { NextResponse } from "next/server";
import { sessionToken, sessionCookieName, isAuthRequired } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAuthRequired()) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const username = process.env.LOGIN_USERNAME;
  const password = process.env.LOGIN_PASSWORD;
  if (
    body.username !== username ||
    body.password !== password
  ) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await sessionToken(username!, password!);
  const cookieName = sessionCookieName();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
