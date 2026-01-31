import { NextRequest, NextResponse } from "next/server";
import { processNextJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_JOBS_PER_INVOCATION = 10;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let processed = 0;
  for (let i = 0; i < MAX_JOBS_PER_INVOCATION; i++) {
    try {
      const hadJob = await processNextJob();
      if (!hadJob) break;
      processed++;
    } catch (err) {
      console.error("[cron/jobs] Error processing job:", err);
      break;
    }
  }
  return NextResponse.json({ processed });
}
