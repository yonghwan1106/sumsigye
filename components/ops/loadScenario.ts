// 서버 전용: 시나리오 묶음과 시나리오 문자들의 L1 결과를 준비한다.
// L1 = 묶음의 사전계산(claude-haiku-5-5)이 있으면 그것, 없으면 규칙 추출(lib/l1, 「규칙 추출(데모 모드)」 배지).
// 임시: data/scenarios/sc*.json(C3)이 아직 없어 stubScenario로 같은 스키마 묶음을 만든다.
// TODO(owner C·통합): C3 산출물이 생기면 아래 STUB을 지우고 `import sc1 from "@/data/scenarios/sc1.json"` 등 정적 import로 바꾼다.
import { finalize } from "@/lib/l1/validate";
import { ruleExtract } from "@/lib/l1/ruleExtract";
import type { ScenarioBundle } from "@/lib/types";
import type { SmsL1 } from "./scenario";
import { buildStubScenario } from "./stubScenario";

export type ScenarioId = "sc1" | "sc2" | "sc3";
export const SCENARIO_IDS: ScenarioId[] = ["sc1", "sc2", "sc3"];

export function parseScenarioId(s: string | string[] | undefined): ScenarioId {
  const v = Array.isArray(s) ? s[0] : s;
  return v === "sc2" || v === "sc3" ? v : "sc1";
}

export function loadScenario(id: ScenarioId): { bundle: ScenarioBundle; smsL1: SmsL1; stub: boolean } {
  const bundle = buildStubScenario(id);
  const smsL1: SmsL1 = {};
  for (const e of bundle.timeline) {
    if (e.type !== "sms") continue;
    const pre = bundle.precomputed.l1[String(e.sn)];
    if (pre) smsL1[String(e.sn)] = { fields: pre.fields, source: "precomputed" };
    else smsL1[String(e.sn)] = { fields: finalize(ruleExtract({ text: e.text, sent_at: e.at, org: e.org }), { text: e.text, sent_at: e.at }), source: "rule" };
  }
  return { bundle, smsL1, stub: true };
}
