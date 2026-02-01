import { NextRequest, NextResponse } from "next/server";
import { initializeApp } from "@/lib/init";
import {
  sessionCookieName,
  isAuthRequired,
  validateSession,
} from "@/lib/auth";

let initPromise: Promise<void> | null = null;

export async function proxy(request: NextRequest) {
  if (!initPromise) {
    initPromise = initializeApp();
  }
  await initPromise;

  if (isAuthRequired()) {
    const loginPath = "/login";
    const pathname = request.nextUrl.pathname;
    if (pathname !== loginPath && !pathname.startsWith("/api/auth")) {
      const cookieName = sessionCookieName();
      const cookieValue = request.cookies.get(cookieName)?.value;
      const valid = await validateSession(cookieValue);
      if (!valid) {
        const url = request.nextUrl.clone();
        url.pathname = loginPath;
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
