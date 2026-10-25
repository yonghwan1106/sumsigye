// GET /api/health — 구현명세 §7-1. 키 값·길이·앞자리는 응답에 넣지 않는다.
import restoreModel from "@/data/model/restore_model.json";
import fetchLog from "@/data/sms/fetch_log.json";
import type { RestoreModelFile } from "@/lib/types";
import { apiKeyPresent, fallbackModel, realtimeModel } from "@/lib/llm/client";
import { INPUT_MAX_CHARS, sharedLimiter } from "@/lib/llm/limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const m = restoreModel as unknown as RestoreModelFile;
    const log = fetchLog as unknown as { n_unique: number; fetched_at: string };
    const lim = sharedLimiter();
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    return Response.json({
      mode: apiKeyPresent() ? "ai" : "demo",
      model: realtimeModel(),
      fallback_model: fallbackModel(),
      limits: {
        rpm_per_ip: lim.config().rpm,
        daily_cap: lim.config().dailyCap,
        daily_used: lim.dailyUsed(),
        input_max_chars: INPUT_MAX_CHARS,
      },
      corpus: { n: log.n_unique, collected_at: log.fetched_at },
      model_file: { selected: m.selected, provisional: m.provisional, reviewed: m.reviewed },
      build: sha ? sha.slice(0, 7) : "local",
    });
  } catch {
    return Response.json({ mode: "demo", error: "health_unavailable" });
  }
}
