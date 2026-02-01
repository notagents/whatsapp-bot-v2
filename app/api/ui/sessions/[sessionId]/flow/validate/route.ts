import { NextResponse } from "next/server";
import { validateFlow } from "@/lib/flows/validator";
import { requireAuth } from "@/lib/ui-auth-middleware";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAuth(request);
  } catch (res) {
    return res as Response;
  }
  await params;
  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid body" },
      { status: 400 }
    );
  }
  const text = body.text ?? "";
  const result = validateFlow(text);
  if (result.valid) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
}
