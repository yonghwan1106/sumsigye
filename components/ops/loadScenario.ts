// 서버 전용: 시나리오 묶음(data/scenarios/sc*.json, C3 build-scenarios)과 시나리오 문자들의 L1 결과를 준비한다.
// L1 = 묶음의 사전계산(claude-haiku-5-5)이 있으면 그것, 없으면 규칙 추출(lib/l1, 「규칙 추출(데모 모드)」 배지).
import { finalize } from "@/lib/l1/validate";
import { ruleExtract } from "@/lib/l1/ruleExtract";
import type { ScenarioBundle } from "@/lib/types";
import type { SmsL1 } from "./scenario";
import sc1 from "@/data/scenarios/sc1.json";
import sc2 from "@/data/scenarios/sc2.json";
import sc3 from "@/data/scenarios/sc3.json";

export type ScenarioId = "sc1" | "sc2" | "sc3";
export const SCENARIO_IDS: ScenarioId[] = ["sc1", "sc2", "sc3"];

const BUNDLES: Record<ScenarioId, ScenarioBundle> = {
  sc1: sc1 as unknown as ScenarioBundle,
  sc2: sc2 as unknown as ScenarioBundle,
  sc3: sc3 as unknown as ScenarioBundle,
};

export function parseScenarioId(s: string | string[] | undefined): ScenarioId {
  const v = Array.isArray(s) ? s[0] : s;
  return v === "sc2" || v === "sc3" ? v : "sc1";
}

export function loadScenario(id: ScenarioId): { bundle: ScenarioBundle; smsL1: SmsL1 } {
  const bundle = BUNDLES[id];
  const smsL1: SmsL1 = {};
  for (const e of bundle.timeline) {
    if (e.type !== "sms") continue;
    const pre = bundle.precomputed.l1[String(e.sn)];
    if (pre) smsL1[String(e.sn)] = { fields: pre.fields, source: "precomputed" };
    else smsL1[String(e.sn)] = { fields: finalize(ruleExtract({ text: e.text, sent_at: e.at, org: e.org }), { text: e.text, sent_at: e.at }), source: "rule" };
  }
  return { bundle, smsL1 };
}
