import { NextResponse } from "next/server";
import { getContextSnapshot } from "@/lib/context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ whatsappId: string }> }
) {
  try {
    const { whatsappId } = await params;
    const decoded = decodeURIComponent(whatsappId);
    const snapshot = await getContextSnapshot(decoded);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[context GET]", err);
    return NextResponse.json(
      { error: "Failed to load context" },
      { status: 500 }
    );
  }
}
