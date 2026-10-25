// GET /api/health — 구현명세 §7-1
// C1b 최소판: 키 유무로 mode만 판단한다(키 값·길이·앞자리는 응답에 넣지 않는다).
// daily_used는 C2b(lib/llm/limit.ts)가 붙기 전까지 0.
import restoreModel from "@/data/model/restore_model.json";
import type { RestoreModelFile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function intEnv(name: string, dflt: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

export async function GET() {
  try {
    const m = restoreModel as unknown as RestoreModelFile;
    const hasKey = (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 0;
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    return Response.json({
      mode: hasKey ? "ai" : "demo",
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      fallback_model: process.env.ANTHROPIC_FALLBACK_MODEL || "claude-haiku-4-5",
      limits: {
        rpm_per_ip: intEnv("AI_RPM_PER_IP", 6),
        daily_cap: intEnv("AI_DAILY_CAP", 300),
        daily_used: 0,
        input_max_chars: 1000,
      },
      corpus: {
        n: m.data.corpus_n,
        collected_at: m.data.corpus_n > 0 ? m.data.collected_at : null,
      },
      model_file: { selected: m.selected, provisional: m.provisional, reviewed: m.reviewed },
      build: sha ? sha.slice(0, 7) : "local",
    });
  } catch {
    return Response.json({ mode: "demo", error: "health_unavailable" });
  }
}
