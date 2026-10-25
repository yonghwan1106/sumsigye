// 운영자 메모 「왜 이 배정인가」 (구현명세 §7-3) — /api/brief와 build-scenarios(사전계산)가 같이 쓴다.
// LLM은 엔진이 만든 표시 문자열만 받아 3줄로 풀어 쓴다. 숫자 검사·금지 표현 검사 실패 → 템플릿.
import { BRIEF, fill } from "@/lib/copy";
import { callText, type LlmFailure } from "@/lib/llm/client";
import { briefOk, parseLines } from "@/lib/llm/guard";

export const BRIEF_MAX_TOKENS = 300;

export interface BriefFacts {
  rows: {
    alias: string;
    device: string;
    safe: string;
    prob: string;
    margin: string;
    resource: string | null;
    arrival: string | null;
    lane: "119" | "manual" | "main";
    excluded: string[];
  }[];
  changed: string[];
  now: string;
}

export const BRIEF_SYSTEM_PROMPT = `너는 지자체 재난 담당자가 보는 비상전원 배정안 옆에 붙는 짧은 메모를 쓴다.

칸의 뜻
- safe: 그 집 의료기기가 내장·외장 배터리로 버틸 시간(가장 짧게 잡은 값, 거치형 산소발생기는 예비 산소통으로 버틸 시간). 비상전원으로 버티는 시간이 아니다.
- prob: 전기가 돌아오기 전에 배터리가 먼저 끝날 가능성.
- margin: 여유 시간(배터리로 버틸 시간에서 복구 또는 전원 도착까지 걸리는 시간을 뺀 값, 음수면 모자람).
- resource·arrival: 계산이 추천한 비상전원과 도착까지 걸리는 시간. 아직 담당자 승인 전의 제안이다.
- lane: 119는 「119 연계 검토」, manual은 「전화로 값 확인 필요」, main은 일반 순서. excluded: 보낼 수 없는 전원과 그 사유.

규칙
1. 주어진 줄 수만큼 정확히 쓴다(가구가 하나면 그 가구를 3줄로, 여럿이면 한 줄에 한 가구). 한 줄은 한 문장(70자 안팎)이고 줄과 줄은 줄바꿈으로 나눈다. 줄머리 기호나 번호 없이 문장만 쓴다.
2. 숫자·시간·확률·가구 ID·전원 이름은 주어진 표시 문자열을 글자 그대로만 쓴다. 새 숫자를 만들거나 계산하지 않는다.
3. 배정은 '제안'으로 쓴다('배정되었습니다'·'보냅니다'라고 쓰지 않는다). 승인을 권하거나 부탁하지 않고 결정을 대신하지 않는다. 최종 판단은 담당자가 한다.
4. 왜 그 전원이 제안됐는지(배터리로 버틸 시간, 배터리가 먼저 끝날 가능성, 도착 시간, 제외된 전원의 사유)를 쉬운 말로 설명한다.
5. 영어 낱말(manual·main 같은 칸 이름)을 쓰지 않는다. 문장은 끝까지 맺는다.`;

/** 한 가구(펼침)면 그 가구 설명 3줄, 여러 가구면 가구당 1줄(최대 3). */
export function briefLineCount(facts: BriefFacts): number {
  if (facts.rows.length === 1) return 3;
  return Math.min(3, Math.max(1, facts.rows.length));
}

export function briefUserMessage(facts: BriefFacts): string {
  return `줄 수: ${briefLineCount(facts)}\n배정안(표시 문자열):\n${JSON.stringify(facts, null, 1)}`;
}

/** 템플릿 3줄(LLM 없을 때). */
export function briefTemplate(facts: BriefFacts): string[] {
  const rows = facts.rows.slice(0, 3);
  if (rows.length === 0) return [BRIEF.none];
  if (rows.length === 1) {
    const r = rows[0];
    const l1 = fill(BRIEF.rowSafe, { alias: r.alias, safe: r.safe, prob: r.prob, margin: r.margin });
    const manualTail = r.lane === "manual" ? BRIEF.manualTail : "";
    const l2 = r.resource
      ? fill(BRIEF.rowResource, { resource: r.resource, arrival: r.arrival ?? "" }) + manualTail
      : r.lane === "manual" ? BRIEF.rowManual : r.lane === "119" ? BRIEF.rowNoResource : BRIEF.rowNoNeed;
    const ex = r.excluded.length ? fill(BRIEF.rowExcluded, { list: r.excluded.join("; ") }) : BRIEF.rowNoExcluded;
    const l3 = facts.changed.includes(r.alias) ? `${BRIEF.rowChanged} · ${ex}` : ex;
    return [l1, l2, l3];
  }
  return rows.map((r) => {
    if (!r.resource) {
      if (r.lane === "manual") return fill(BRIEF.manual, { alias: r.alias });
      if (r.lane === "119") return fill(BRIEF.noResource, { alias: r.alias, safe: r.safe, prob: r.prob });
      return fill(BRIEF.noNeed, { alias: r.alias, safe: r.safe, prob: r.prob });
    }
    const line = fill(BRIEF.withResource, {
      alias: r.alias, safe: r.safe, prob: r.prob, resource: r.resource, arrival: r.arrival ?? "",
    }).replace(/\s+도착 제안$/, r.arrival ? " 도착 제안" : " 제안");
    return r.lane === "manual" ? line + BRIEF.manualTail : line;
  });
}

export type BriefGen =
  | { ok: true; source: "llm"; lines: string[]; model: string }
  | { ok: false; source: "template"; lines: string[]; model: "template"; fallback_reason: LlmFailure };

/** LLM 1회(한 모델) + 검사. 실패하면 ok:false + 템플릿. */
export async function briefWithModel(facts: BriefFacts, model: string): Promise<BriefGen> {
  const n = briefLineCount(facts);
  const r = await callText({ model, system: BRIEF_SYSTEM_PROMPT, user: briefUserMessage(facts), maxTokens: BRIEF_MAX_TOKENS });
  if (!r.ok) return { ok: false, source: "template", lines: briefTemplate(facts), model: "template", fallback_reason: r.error };
  const lines = parseLines(r.text, n);
  if (!lines || !briefOk(lines, facts, n)) {
    return { ok: false, source: "template", lines: briefTemplate(facts), model: "template", fallback_reason: "invalid_output" };
  }
  return { ok: true, source: "llm", lines, model: r.model };
}
