// 보호자 행동지침 「지금 할 일」 (구현명세 §7-4·§8-3) — /api/guide와 build-scenarios(사전계산)가 같이 쓴다.
// 고정 체크리스트 5항목을 LLM이 쉬운 말로만 바꾼다. 핵심 낱말 누락·금지 낱말·5번째 줄 변경 → 체크리스트 원문.
import type { DeviceId } from "@/lib/types";
import { GUARDIAN } from "@/lib/copy";
import { callText, type LlmFailure } from "@/lib/llm/client";
import { guideOk, parseLines } from "@/lib/llm/guard";
import { shortHash } from "@/lib/llm/cache";

export const GUIDE_MAX_TOKENS = 400;

export interface GuideRequest {
  device_id: DeviceId | null;
  safe: string;
  status: "pending" | "approved" | "none";
  arrival: string | null;
}

export const GUIDE_SYSTEM_PROMPT = `너는 정전 중인 집의 보호자에게 보여 줄 「지금 할 일」 5줄을 쉬운 말로 다시 쓴다.

규칙
1. 주어진 체크리스트 5항목을 순서대로 한 줄씩, 뜻을 바꾸지 않고 더 쉬운 말로 쓴다. 각 항목의 핵심 낱말(배터리 경고·외장배터리·예비 산소통·전원선·휴대전화)은 그대로 둔다. 괄호 안 출처 구절(예: 「(인공호흡기 A계열 설명서 기준)」)은 글자 그대로 그 줄 끝에 남긴다.
2. 5번째 줄은 주어진 문장을 글자 그대로 쓴다.
3. 의학적 처치·약·기기 설정을 바꾸라는 말을 하지 않는다. 병을 판단하지 않는다.
4. 체크리스트와 상황에 없는 숫자를 만들지 않는다.
5. 줄머리 기호나 번호 없이 문장만, 정확히 5줄.`;

/** 고정 체크리스트 5항목(§8-3). */
export function guideChecklist(device: DeviceId | null): string[] {
  const c = GUARDIAN.checklist;
  return [
    device === "VENT_A" ? c.c1VentA : c.c1,
    c.c2,
    device === "O2_STAT" ? c.c3O2 : c.c3,
    c.c4,
    c.c5,
  ];
}

/** 항목별 핵심 낱말. */
export const GUIDE_SOURCE_VENT_A = "(인공호흡기 A계열 설명서 기준)";

export function guideKeywords(device: DeviceId | null): string[][] {
  // ①의 출처 구절도 핵심 낱말로 검사한다(바꿔 쓰며 출처가 빠지면 체크리스트 원문으로)
  return [device === "VENT_A" ? ["배터리 경고", GUIDE_SOURCE_VENT_A] : ["배터리 경고"], ["외장배터리"], [device === "O2_STAT" ? "예비 산소통" : "전원선"], ["휴대전화"], ["119"]];
}

export function guideContext(req: GuideRequest): string[] {
  return [req.safe, req.arrival ?? ""].filter(Boolean);
}

export function guideUserMessage(req: GuideRequest): string {
  const status = { pending: GUARDIAN.support.pending, approved: "승인됨", none: GUARDIAN.support.none }[req.status];
  return [
    "체크리스트:",
    ...guideChecklist(req.device_id).map((l, i) => `${i + 1}. ${l}`),
    "",
    `상황: 배터리로 버틸 시간 ${req.safe} · 지원 상태 ${status}${req.arrival ? ` · 도착 ${req.arrival}` : ""}`,
  ].join("\n");
}

/** 요청 열쇠(사전계산 guides 표). */
export function guideKey(req: GuideRequest): string {
  return shortHash({ device_id: req.device_id, safe: req.safe, status: req.status, arrival: req.arrival });
}

export type GuideGen =
  | { ok: true; source: "llm"; lines: string[]; model: string }
  | { ok: false; source: "template"; lines: string[]; model: "checklist"; fallback_reason: LlmFailure };

export async function guideWithModel(req: GuideRequest, model: string): Promise<GuideGen> {
  const checklist = guideChecklist(req.device_id);
  const r = await callText({ model, system: GUIDE_SYSTEM_PROMPT, user: guideUserMessage(req), maxTokens: GUIDE_MAX_TOKENS });
  if (!r.ok) return { ok: false, source: "template", lines: checklist, model: "checklist", fallback_reason: r.error };
  const lines = parseLines(r.text, 5);
  if (lines) lines[4] = checklist[4]; // ⑤는 고정 문구(§8-3) — 바꿔 쓰지 않는다
  if (!lines ||!guideOk(lines, checklist, guideKeywords(req.device_id), guideContext(req))) {
    return { ok: false, source: "template", lines: checklist, model: "checklist", fallback_reason: "invalid_output" };
  }
  return { ok: true, source: "llm", lines, model: r.model };
}
