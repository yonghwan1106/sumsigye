// POST /api/brief — 운영자 메모 「왜 이 배정인가」 (구현명세 §7-3).
// 사전계산(시나리오 기본 상태) → LRU → LLM(haiku-5-5, 폴백 1회) + 검사 → 템플릿. 언제나 JSON, 500 없음.
import { API_CACHE, Lru, LRU_MAX, shortHash } from "@/lib/llm/cache";
import { apiKeyPresent, fallbackModel, realtimeModel } from "@/lib/llm/client";
import { clientIp, sharedLimiter } from "@/lib/llm/limit";
import { briefTemplate, briefWithModel, type BriefFacts } from "@/lib/llm/brief";
import { withFallback } from "@/lib/llm/client";

export const runtime = "nodejs";
export const maxDuration = 30;

const lru = new Lru<{ lines: string[]; model: string }>(LRU_MAX);

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function parseFacts(v: unknown): BriefFacts | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.rows) || o.rows.length > 60) return null;
  const rows: BriefFacts["rows"] = [];
  for (const r of o.rows) {
    if (!r || typeof r !== "object") return null;
    const x = r as Record<string, unknown>;
    if (![x.alias, x.device, x.safe, x.prob, x.margin].every(isStr)) return null;
    const lane = x.lane === "119" || x.lane === "manual" ? x.lane : "main";
    rows.push({
      alias: x.alias as string,
      device: x.device as string,
      safe: x.safe as string,
      prob: x.prob as string,
      margin: x.margin as string,
      resource: isStr(x.resource) ? x.resource : null,
      arrival: isStr(x.arrival) ? x.arrival : null,
      lane,
      excluded: Array.isArray(x.excluded) ? x.excluded.filter(isStr).slice(0, 10) : [],
    });
  }
  const changed = Array.isArray(o.changed) ? o.changed.filter(isStr).slice(0, 20) : [];
  const now = isStr(o.now) ? o.now : "";
  const total = JSON.stringify({ rows, changed, now }).length;
  if (total > 8000) return null;
  return { rows, changed, now };
}

export async function POST(req: Request) {
  let facts: BriefFacts | null = null;
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const b = (body ?? {}) as Record<string, unknown>;
    facts = parseFacts(b.facts);
    if (!facts) return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    const stateHash = isStr(b.state_hash) ? b.state_hash : "";

    // 사전계산: 한 가구 펼침이면 「상태 해시:가명」, 여러 가구면 상태 해시
    const preKey = facts.rows.length === 1 ? `${stateHash}:${facts.rows[0].alias}` : stateHash;
    const pre = stateHash ? API_CACHE.briefs[preKey] : undefined;
    if (pre) return Response.json({ ok: true, source: "precomputed", lines: pre.lines, model: pre.model, fallback_reason: null });

    const key = shortHash(facts);
    const hit = lru.get(key);
    if (hit) return Response.json({ ok: true, source: "cache", lines: hit.lines, model: hit.model, fallback_reason: null });

    if (!apiKeyPresent()) {
      return Response.json({ ok: true, source: "template", lines: briefTemplate(facts), model: "template", fallback_reason: "no_key" });
    }
    const gate = sharedLimiter().tryAcquire(clientIp(req));
    if (!gate.ok) {
      return Response.json({ ok: true, source: "template", lines: briefTemplate(facts), model: "template", fallback_reason: gate.reason });
    }
    const f = facts;
    const g = await withFallback([realtimeModel(), fallbackModel()], async (m) => {
      const r = await briefWithModel(f, m);
      return r.ok ? { ...r, error: undefined } : { ...r, error: r.fallback_reason };
    });
    if (g.ok) {
      lru.set(key, { lines: g.lines, model: g.model });
      return Response.json({ ok: true, source: "llm", lines: g.lines, model: g.model, fallback_reason: null });
    }
    return Response.json({ ok: true, source: "template", lines: g.lines, model: "template", fallback_reason: g.error ?? "llm_error" });
  } catch {
    return Response.json({
      ok: true,
      source: "template",
      lines: facts ? briefTemplate(facts) : [],
      model: "template",
      fallback_reason: "llm_error",
    });
  }
}
