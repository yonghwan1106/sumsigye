// POST /api/extract — L1 실시간 (구현명세 §7-2).
// ① 사전계산(코퍼스 문자) → ② LRU → ③ 상한 검사 → LLM(haiku-5-5, 실패 시 haiku-4-5 1회) → ④ 규칙 추출.
// LLM·규칙 결과 모두 lib/l1/validate.ts의 finalize(날짜 보정 + 검증)를 거친다. 언제나 JSON, 500 없음.
import l1Results from "@/data/eval/l1_results.json";
import type { L1Resolved, L1Results } from "@/lib/types";
import { API_CACHE, Lru, LRU_MAX, textKey } from "@/lib/llm/cache";
import { apiKeyPresent, fallbackModel, realtimeModel, withFallback } from "@/lib/llm/client";
import { clientIp, INPUT_MAX_CHARS, sharedLimiter } from "@/lib/llm/limit";
import { apiCacheKey, extractWithLlm } from "@/lib/l1/llmExtract";
import { ruleExtract, RULE_VERSION } from "@/lib/l1/ruleExtract";
import { finalize } from "@/lib/l1/validate";
import { mergeTimes } from "@/lib/llm/merge";

export const runtime = "nodejs";
export const maxDuration = 30;

type Source = "precomputed" | "cache" | "llm" | "rule";
type FallbackReason = null | "no_key" | "rate_limited" | "daily_cap" | "llm_error" | "invalid_output";

const lru = new Lru<{ model: string; fields: L1Resolved }>(LRU_MAX);
const REALTIME_MODE = ((l1Results as unknown as L1Results).meta?.realtime_mode ?? "llm") as "llm" | "merged";

function isIso(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s));
}

function ruleFields(text: string, sent_at: string, org: string | null): L1Resolved {
  return finalize(ruleExtract({ text, sent_at, org }), { text, sent_at });
}

function reply(t0: number, source: Source, model: string, fields: L1Resolved, fallback_reason: FallbackReason) {
  return Response.json({ ok: true, source, model, fields, fallback_reason, latency_ms: Date.now() - t0 });
}

export async function POST(req: Request) {
  const t0 = Date.now();
  let parsed: { text: string; sent_at: string; org: string | null } | null = null;
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const b = (body ?? {}) as Record<string, unknown>;
    if (typeof b.text !== "string") return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    const text = b.text;
    if (text.trim().length < 1 || text.length > INPUT_MAX_CHARS) {
      return Response.json({ ok: false, error: "text_length" }, { status: 400 });
    }
    if (!isIso(b.sent_at)) return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    if (!(b.org === undefined || b.org === null || typeof b.org === "string")) {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const sent_at = b.sent_at;
    const org = typeof b.org === "string" && b.org.trim() ? b.org.trim() : null;
    parsed = { text, sent_at, org };
    const merged = REALTIME_MODE === "merged";
    const maybeMerge = (f: L1Resolved) => (merged ? mergeTimes(f, ruleFields(text, sent_at, org)) : f);

    // ① 사전계산: 같은 문안·같은 발송 시각 → 저장값 그대로. 같은 문안·다른 발송 시각 → 저장된 L1Raw를 그 시각으로 다시 보정.
    const exact = API_CACHE.extract[apiCacheKey(text, sent_at)];
    if (exact) return reply(t0, "precomputed", exact.model, maybeMerge(exact.fields), null);
    const viaText = API_CACHE.text_index[textKey(text)];
    const sameText = viaText ? API_CACHE.extract[viaText] : undefined;
    if (sameText) return reply(t0, "precomputed", sameText.model, maybeMerge(finalize(sameText.raw, { text, sent_at })), null);

    // ② LRU
    const lkey = apiCacheKey(text, sent_at);
    const hit = lru.get(lkey);
    if (hit) return reply(t0, "cache", hit.model, hit.fields, null);

    // ③ LLM
    const rule = () => ruleFields(text, sent_at, org);
    if (!apiKeyPresent()) return reply(t0, "rule", `rule:${RULE_VERSION}`, rule(), "no_key");
    const gate = sharedLimiter().tryAcquire(clientIp(req));
    if (!gate.ok) return reply(t0, "rule", `rule:${RULE_VERSION}`, rule(), gate.reason);

    const r = await withFallback([realtimeModel(), fallbackModel()], (m) => extractWithLlm(text, { model: m }));
    if (r.ok) {
      const fields = maybeMerge(finalize(r.raw, { text, sent_at }));
      lru.set(lkey, { model: r.model, fields });
      return reply(t0, "llm", r.model, fields, null);
    }
    // ④ 규칙
    return reply(t0, "rule", `rule:${RULE_VERSION}`, rule(), r.error === "invalid_output" ? "invalid_output" : r.error === "no_key" ? "no_key" : "llm_error");
  } catch {
    if (parsed) {
      try {
        return reply(t0, "rule", `rule:${RULE_VERSION}`, ruleFields(parsed.text, parsed.sent_at, parsed.org), "llm_error");
      } catch {
        /* 아래로 */
      }
    }
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
}
