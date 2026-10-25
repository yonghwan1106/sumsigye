// 평가 JSON → 화면 문장 (구현명세 §8-4 띠 ①②③, §8-6 400개 띠, §6-10 화면 규칙).
// 숫자는 data/eval/*.json에서만 읽는다. status !== "final" 또는 provisional이면 띠 숫자는 「측정 중」.
import l1Json from "@/data/eval/l1_results.json";
import l2Json from "@/data/eval/l2_results.json";
import l4Json from "@/data/eval/l4_results.json";
import type { L1Results, L2Results, L4Results, WilsonCov } from "@/lib/types";
import { COMMON, EVAL_BAND, RACE, fill } from "@/lib/copy";
import { fmt1 } from "@/components/_fmt";

export const L1 = l1Json as unknown as L1Results;
export const L2 = l2Json as unknown as L2Results;
export const L4 = l4Json as unknown as L4Results;

export const L1_MIN_REVIEWED = 40;

/** 0~1 비율 → 정수 %. 이미 %(>1)로 들어온 값도 받는다. */
export function pctInt(r: number): number {
  return Math.round(r > 1 ? r : r * 100);
}

export interface BandItem {
  key: "l1" | "l2" | "l4";
  text: string;
  measuring: boolean;
}

export function l1Band(l1: L1Results = L1): BandItem {
  const prefix = "재난문자 읽기";
  if (l1.status !== "final") return { key: "l1", text: `${prefix}: ${COMMON.measuring}`, measuring: true };
  const g = l1.meta.reviewed_n;
  const haiku = l1.rows.find((r) => r.system === "claude-haiku-5-5");
  if (g >= L1_MIN_REVIEWED && haiku && haiku.time_exact.rate !== null) {
    return { key: "l1", text: fill(EVAL_BAND.l1, { g, x: pctInt(haiku.time_exact.rate) }), measuring: false };
  }
  const auto = l1.auto_checks.find((a) => a.system === "claude-haiku-5-5");
  if (auto) {
    const n = (auto as { n?: number }).n ?? l1.meta.total_n;
    return { key: "l1", text: fill(EVAL_BAND.l1Fallback, { x: pctInt(auto.evidence_in_text), n }), measuring: false };
  }
  return { key: "l1", text: `${prefix}: ${COMMON.measuring}`, measuring: true };
}

export function selectedCov80(l2: L2Results = L2): WilsonCov | null {
  const row = l2.loo.find((r) => r.id === l2.selected);
  return row?.cov80 ?? null;
}

export function l2Band(l2: L2Results = L2): BandItem {
  const cov = selectedCov80(l2);
  if (l2.status !== "final" || !cov) {
    return { key: "l2", text: `복구시간 '10번 중 8번' 범위: ${COMMON.measuring}`, measuring: true };
  }
  return {
    key: "l2",
    text: fill(EVAL_BAND.l2, { a: cov.a, n: cov.n, lo: pctInt(cov.lo), hi: pctInt(cov.hi) }),
    measuring: false,
  };
}

/** 400개 평균 { b: 단순 규칙(R1), a: 숨시계 } — 없거나 임시면 null. */
export function l4Headline(l4: L4Results = L4): { b: string; a: string } | null {
  if (l4.status !== "final" || l4.provisional) return null;
  const r1 = l4.methods.find((m) => m.id === "R1");
  const ours = l4.methods.find((m) => m.id === "ours");
  if (!r1 || !ours) return null;
  return { b: fmt1(r1.all.interrupted_mean), a: fmt1(ours.all.interrupted_mean) };
}

/** 효과 범위 한 줄: 「광역(가구 20~50곳)에서 0.76곳 적음(95% 구간 0.51~1.02) · 소규모(가구 4~8곳)은 차이 없음(…)」. 값은 diffs(R1 − 숨시계). */
export function l4ScopeNote(l4: L4Results = L4): string | null {
  if (!l4Headline(l4)) return null;
  const f2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
  const part = (scope: "wide" | "small") => {
    const x = l4.diffs.find((d) => d.a === "R1" && d.b === "ours" && d.scope === scope);
    if (!x) return null;
    const name = EVAL_BAND.scopeNames[scope];
    const v = { name, lo: f2(x.ci[0]), hi: f2(x.ci[1]) };
    if (x.ci[0] > 0) return fill(EVAL_BAND.scopeFewer, { ...v, v: f2(x.mean) });
    if (x.ci[1] < 0) return fill(EVAL_BAND.scopeMore, { ...v, v: f2(-x.mean) });
    return fill(EVAL_BAND.scopeNone, { ...v, v: f2(x.mean) });
  };
  const parts = [part("wide"), part("small")].filter((p): p is string => !!p);
  return parts.length ? parts.join(" · ") : null;
}

export function l4Band(l4: L4Results = L4): BandItem {
  const h = l4Headline(l4);
  if (!h) return { key: "l4", text: `합성 시나리오 400개: ${COMMON.measuring}`, measuring: true };
  const scope = l4ScopeNote(l4);
  return { key: "l4", text: fill(EVAL_BAND.l4, h) + (scope ? ` — ${scope}` : ""), measuring: false };
}

/** 두 막대 경주 아래 400개 띠 문장(효과 범위 포함). */
export function raceBand(l4: L4Results = L4): string {
  const h = l4Headline(l4);
  if (!h) return `가상 시나리오 400개 평균: ${COMMON.measuring}`;
  const scope = l4ScopeNote(l4);
  return fill(RACE.band, h) + (scope ? ` — ${scope}` : "");
}

/** 표 칸용: 임시면 숫자 옆에 「측정 중(임시)」. */
export function withTemp(text: string, temp: boolean): string {
  return temp ? `${text} ${COMMON.measuringTemp}` : text;
}
