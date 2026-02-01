import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/ui-auth-middleware";
import { buildOverview } from "@/lib/dashboard-overview";

export async function GET(request: Request) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  try {
    const overview = await buildOverview();
    return NextResponse.json(overview);
  } catch (err) {
    console.error("[dashboard overview]", err);
    return NextResponse.json(
      { error: "Failed to build dashboard overview" },
      { status: 500 }
    );
  }
}
