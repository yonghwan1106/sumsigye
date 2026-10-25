// POST /api/guide — 보호자 행동지침 「지금 할 일」 5줄 (구현명세 §7-4).
// 사전계산 → LRU → LLM(haiku-5-5, 폴백 1회) + 검사 → 체크리스트 원문. 언제나 JSON, 500 없음.
import type { DeviceId } from "@/lib/types";
import { API_CACHE, Lru, LRU_MAX } from "@/lib/llm/cache";
import { apiKeyPresent, fallbackModel, realtimeModel, withFallback } from "@/lib/llm/client";
import { clientIp, sharedLimiter } from "@/lib/llm/limit";
import { guideChecklist, guideKey, guideWithModel, type GuideRequest } from "@/lib/llm/guide";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEVICES: DeviceId[] = ["VENT_A", "VENT_B", "O2_STAT", "O2_PORT", "SUCTION", "COUGH"];
const lru = new Lru<{ lines: string[]; model: string }>(LRU_MAX);

function parseReq(v: unknown): GuideRequest | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const device_id = o.device_id === null || o.device_id === undefined ? null : DEVICES.includes(o.device_id as DeviceId) ? (o.device_id as DeviceId) : undefined;
  if (device_id === undefined) return null;
  if (typeof o.safe !== "string" || o.safe.length > 100) return null;
  const status = o.status === "pending" || o.status === "approved" || o.status === "none" ? o.status : null;
  if (!status) return null;
  const arrival = typeof o.arrival === "string" && o.arrival.length <= 100 ? o.arrival : null;
  return { device_id, safe: o.safe, status, arrival };
}

export async function POST(req: Request) {
  let g: GuideRequest | null = null;
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    g = parseReq(body);
    if (!g) return Response.json({ ok: false, error: "bad_request" }, { status: 400 });

    const key = guideKey(g);
    const pre = API_CACHE.guides[key];
    if (pre) return Response.json({ ok: true, source: "precomputed", lines: pre.lines, model: pre.model, fallback_reason: null });
    const hit = lru.get(key);
    if (hit) return Response.json({ ok: true, source: "cache", lines: hit.lines, model: hit.model, fallback_reason: null });

    const checklist = guideChecklist(g.device_id);
    if (!apiKeyPresent()) {
      return Response.json({ ok: true, source: "template", lines: checklist, model: "checklist", fallback_reason: "no_key" });
    }
    const gate = sharedLimiter().tryAcquire(clientIp(req));
    if (!gate.ok) {
      return Response.json({ ok: true, source: "template", lines: checklist, model: "checklist", fallback_reason: gate.reason });
    }
    const req2 = g;
    const r = await withFallback([realtimeModel(), fallbackModel()], async (m) => {
      const x = await guideWithModel(req2, m);
      return x.ok ? { ...x, error: undefined } : { ...x, error: x.fallback_reason };
    });
    if (r.ok) {
      lru.set(key, { lines: r.lines, model: r.model });
      return Response.json({ ok: true, source: "llm", lines: r.lines, model: r.model, fallback_reason: null });
    }
    return Response.json({ ok: true, source: "template", lines: checklist, model: "checklist", fallback_reason: r.error ?? "llm_error" });
  } catch {
    return Response.json({
      ok: true,
      source: "template",
      lines: guideChecklist(g?.device_id ?? null),
      model: "checklist",
      fallback_reason: "llm_error",
    });
  }
}
