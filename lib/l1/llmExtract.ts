// L1 LLM 추출 (구현명세 §4-5) — 재난문자 한 통 → L1Raw. 도구 호출 1회, tool_choice 고정.
// 프롬프트 공개 사본: prompts/l1_extract.md (tests/api.test.ts가 이 문자열과 대조한다).
// 날짜 보정(dates.resolve)·검증(validate)은 묶음 A의 lib/l1/{dates,validate}.ts가 한다 — 이 파일은 L1Raw까지만.
import { createHash } from "node:crypto";
import type { Cause6, EtaRaw, L1Raw, SmsKind } from "@/lib/types";
import { callTool, type LlmFailure, type ToolDef } from "@/lib/llm/client";

export const L1_TOOL_NAME = "record_outage_sms";
export const L1_MAX_TOKENS = 500;

export const L1_SYSTEM_PROMPT = `너는 한국 재난문자 한 통에서 가구 전력 정전 정보를 뽑아 record_outage_sms 도구로 기록한다.

규칙
1. 문안에 없는 값은 null(목록은 빈 배열)로 둔다. 추측하지 않는다. 발송 시각이나 '현재'를 발생 시각으로 쓰지 않는다.
2. 시각은 문안 표기 그대로 24시간제 HH:MM으로 쓴다(예: '18시 52분경' → '18:52', '18:52경' → '18:52'). '오전·오후'가 없으면 숫자를 바꾸지 않는다(예: '3시까지' → '3:00'). 날짜는 쓰지 않는다.
3. 예고(eta): 복구 예정 시각이 적혀 있으면 {type:"absolute", clock}. '○시간 ○분 소요·예상'처럼 걸리는 시간만 있으면 {type:"duration", minutes, base}. base는 '발생 후·발생으로부터'면 occurrence, '현재부터·지금부터'면 sent, 기준 시각이 문안에 없으면 unknown(예: '복구까지 3시간 소요예상' → unknown). 예고가 없으면 null.
4. relevant: 지역의 일반 전력 공급(가구 전기)이 끊긴 정전의 발생·진행·복구를 알리는 문자면 true. 신호등·지하철·열차·정수장 같은 시설만의 정전, 절전·냉방 안내, 훈련 안내는 false.
5. kind: occurrence(정전 발생 알림) · eta_update(복구 예정·지연 등 진행 중 안내) · restoration(복구 완료 알림) · advisory(정전 관련 주의·행동 안내) · other(그 밖).
6. cause6: vehicle(차량·추돌·교통사고·전신주 파손) · equipment(변압기·개폐기·고압선·선로·전선 등 설비) · fire(화재) · weather(낙뢰·강풍·폭설·태풍·호우·침수) · overload(과부하·전기 사용 집중) · work(공사·작업·굴착) · unknown(문안에 원인이 없음).
7. place_text는 문안에 적힌 장소 구절 그대로, areas는 그 안의 동·읍·면·리 이름 목록(예: ["서교동"]). scale_hint는 '대규모·일대·여러' 같은 규모 표현 그대로, 없으면 null.
8. evidence의 각 값은 원문에서 그대로 잘라 낸 부분 문자열만 쓴다(고쳐 쓰지 않는다). 근거가 없는 칸은 넣지 않는다.`;

export const L1_TOOL: ToolDef = {
  name: L1_TOOL_NAME,
  description: "재난문자 한 통에서 뽑은 가구 전력 정전 정보를 기록한다.",
  input_schema: {
    type: "object",
    properties: {
      relevant: { type: "boolean" },
      kind: { type: "string", enum: ["occurrence", "eta_update", "restoration", "advisory", "other"] },
      place_text: { type: ["string", "null"] },
      areas: { type: "array", items: { type: "string" } },
      occurred_clock: { type: ["string", "null"], description: "HH:MM 또는 H:MM, 없으면 null" },
      eta: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            properties: { type: { type: "string", enum: ["absolute"] }, clock: { type: "string" } },
            required: ["type", "clock"],
          },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["duration"] },
              minutes: { type: "integer" },
              base: { type: "string", enum: ["occurrence", "sent", "unknown"] },
            },
            required: ["type", "minutes", "base"],
          },
        ],
      },
      restored_clock: { type: ["string", "null"] },
      cause6: { type: "string", enum: ["vehicle", "equipment", "fire", "weather", "overload", "work", "unknown"] },
      scale_hint: { type: ["string", "null"] },
      evidence: {
        type: "object",
        properties: {
          kind: { type: "string" },
          place: { type: "string" },
          occurred: { type: "string" },
          eta: { type: "string" },
          restored: { type: "string" },
          cause: { type: "string" },
        },
      },
    },
    required: ["relevant", "kind", "place_text", "areas", "occurred_clock", "eta", "restored_clock", "cause6", "scale_hint", "evidence"],
  },
};

const KINDS: SmsKind[] = ["occurrence", "eta_update", "restoration", "advisory", "other"];
const CAUSES: Cause6[] = ["vehicle", "equipment", "fire", "weather", "overload", "work", "unknown"];
const EVIDENCE_KEYS = ["kind", "place", "occurred", "eta", "restored", "cause"] as const;

/** 공백 정리(캐시 키·대조용). */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 오프라인·실시간 LLM 캐시 키 = sha256(model + 정규화 문안 + sent_at) (§4-5). */
export function llmCacheKey(model: string, text: string, sentAt: string): string {
  return createHash("sha256").update(model + normalizeText(text) + sentAt).digest("hex");
}

/** /api/extract 사전계산 키 = sha256(정규화 문안 + sent_at) (§7-2 ①). */
export function apiCacheKey(text: string, sentAt: string): string {
  return createHash("sha256").update(normalizeText(text) + sentAt).digest("hex");
}

/** "18:52", "3:00", "18:52:00" → "H:MM"/"HH:MM". 형식이 아니면 null. 값 범위 검사는 validate.ts 몫. */
function normClock(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseEta(v: unknown): EtaRaw {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.type === "absolute") {
    const clock = normClock(o.clock);
    return clock ? { type: "absolute", clock } : null;
  }
  if (o.type === "duration") {
    const minutes = typeof o.minutes === "number" ? Math.round(o.minutes) : Number.parseInt(String(o.minutes), 10);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    const base = o.base === "occurrence" || o.base === "sent" ? o.base : "unknown";
    return { type: "duration", minutes, base };
  }
  return null;
}

/** 도구 입력(unknown) → L1Raw. 필수 칸(relevant·kind)이 형식에 맞지 않으면 null(= invalid_output). */
export function parseL1Raw(input: unknown): L1Raw | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.relevant !== "boolean") return null;
  if (typeof o.kind !== "string" || !KINDS.includes(o.kind as SmsKind)) return null;
  const cause6 = CAUSES.includes(o.cause6 as Cause6) ? (o.cause6 as Cause6) : "unknown";
  const areas = Array.isArray(o.areas)
    ? o.areas.filter((a): a is string => typeof a === "string" && a.trim().length > 0).map((a) => a.trim())
    : [];
  const evidence: L1Raw["evidence"] = {};
  if (o.evidence && typeof o.evidence === "object") {
    const ev = o.evidence as Record<string, unknown>;
    for (const k of EVIDENCE_KEYS) {
      const s = strOrNull(ev[k]);
      if (s) evidence[k] = s;
    }
  }
  return {
    relevant: o.relevant,
    kind: o.kind as SmsKind,
    place_text: strOrNull(o.place_text),
    areas,
    occurred_clock: normClock(o.occurred_clock),
    eta: parseEta(o.eta),
    restored_clock: normClock(o.restored_clock),
    cause6,
    scale_hint: strOrNull(o.scale_hint),
    evidence,
  };
}

export function l1UserMessage(text: string): string {
  return `재난문자 원문:\n${text}`;
}

export type LlmExtractResult =
  | { ok: true; model: string; raw: L1Raw; latency_ms: number }
  | { ok: false; model: string; error: LlmFailure; latency_ms: number };

/** 재난문자 한 통 → L1Raw (한 모델, 1회). 예외를 던지지 않는다. */
export async function extractWithLlm(
  text: string,
  opts: { model: string; timeoutMs?: number },
): Promise<LlmExtractResult> {
  const r = await callTool({
    model: opts.model,
    system: L1_SYSTEM_PROMPT,
    user: l1UserMessage(text),
    tool: L1_TOOL,
    maxTokens: L1_MAX_TOKENS,
    timeoutMs: opts.timeoutMs,
  });
  if (!r.ok) return r;
  const raw = parseL1Raw(r.input);
  if (!raw) return { ok: false, model: r.model, error: "invalid_output", latency_ms: r.latency_ms };
  return { ok: true, model: r.model, raw, latency_ms: r.latency_ms };
}
