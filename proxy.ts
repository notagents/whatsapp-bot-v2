import { NextRequest, NextResponse } from "next/server";
import { initializeApp } from "@/lib/init";

let initPromise: Promise<void> | null = null;

export async function proxy(request: NextRequest) {
  if (!initPromise) {
    initPromise = initializeApp();
  }
  await initPromise;
  return NextResponse.next();
}
