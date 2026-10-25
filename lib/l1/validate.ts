// L1 후처리 검증(구현명세 §4-3): 근거 조각·시각 문자열이 원문에 있는가, 시각 형식(HH 0~23·MM 0~59), occurred ≤ restored.
// 위반한 필드는 null로 바꾸고 warnings에 남긴다. 규칙·LLM 출력 모두 finalize()를 거쳐 저장한다.
import type { Cause6, ISO, L1Raw, L1Resolved, SmsKind } from "../types";
import { findClocks } from "./ruleExtract";
import { isoToMs, parseClock, resolve } from "./dates";

const KINDS: SmsKind[] = ["occurrence", "eta_update", "restoration", "advisory", "other"];
const CAUSES: Cause6[] = ["vehicle", "equipment", "fire", "weather", "overload", "work", "unknown"];

const squash = (s: string) => s.replace(/\s+/g, "");

/** 원문에 나오는 시각들(분, 0~1439). 12시간제 해석을 위해 ±12시간 값도 넣는다. */
function clockMinutesInText(text: string): Set<number> {
  const set = new Set<number>();
  for (const c of findClocks(text)) {
    const v = c.h * 60 + c.m;
    set.add(v); set.add((v + 720) % 1440);
  }
  return set;
}

export function validateRaw(raw: L1Raw, text: string): { raw: L1Raw; warnings: string[] } {
  const warnings: string[] = [];
  const out: L1Raw = {
    relevant: !!raw.relevant,
    kind: KINDS.includes(raw.kind) ? raw.kind : "other",
    place_text: typeof raw.place_text === "string" && raw.place_text.trim() ? raw.place_text : null,
    areas: Array.isArray(raw.areas) ? raw.areas.filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim()) : [],
    occurred_clock: raw.occurred_clock ?? null,
    eta: raw.eta ?? null,
    restored_clock: raw.restored_clock ?? null,
    cause6: CAUSES.includes(raw.cause6) ? raw.cause6 : "unknown",
    scale_hint: typeof raw.scale_hint === "string" && raw.scale_hint.trim() ? raw.scale_hint : null,
    evidence: {},
  };
  if (!KINDS.includes(raw.kind)) warnings.push("bad_kind");
  if (!CAUSES.includes(raw.cause6)) warnings.push("bad_cause6");

  // 근거 조각: 원문 부분 문자열이어야 한다(공백 차이는 허용)
  const sq = squash(text);
  for (const [k, v] of Object.entries(raw.evidence ?? {})) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (text.includes(v) || sq.includes(squash(v))) (out.evidence as Record<string, string>)[k] = v;
    else warnings.push(`evidence_not_in_text:${k}`);
  }
  if (out.place_text && !(text.includes(out.place_text) || sq.includes(squash(out.place_text)))) {
    warnings.push("place_not_in_text"); out.place_text = null;
  }

  // 시각 형식·원문 포함
  const inText = clockMinutesInText(text);
  const checkClock = (field: string, v: string | null): string | null => {
    if (v === null || v === undefined) return null;
    const c = parseClock(v);
    if (!c) { warnings.push(`bad_clock:${field}`); return null; }
    if (!inText.has(c.h * 60 + c.m)) { warnings.push(`clock_not_in_text:${field}`); return null; }
    return v;
  };
  out.occurred_clock = checkClock("occurred", out.occurred_clock);
  out.restored_clock = checkClock("restored", out.restored_clock);
  if (out.eta) {
    if (out.eta.type === "absolute") {
      const v = checkClock("eta", out.eta.clock);
      out.eta = v ? { type: "absolute", clock: v } : null;
    } else if (out.eta.type === "duration") {
      const okBase = ["occurrence", "sent", "unknown"].includes(out.eta.base);
      if (!(Number.isFinite(out.eta.minutes) && out.eta.minutes > 0) || !okBase) { warnings.push("bad_eta_duration"); out.eta = null; }
      else out.eta = { type: "duration", minutes: Math.round(out.eta.minutes), base: out.eta.base };
    } else { warnings.push("bad_eta"); out.eta = null; }
  }
  return { raw: out, warnings };
}

/** 검증 → 날짜 보정 → 순서 검사. 결과는 data/l1/extract_*.json에 그대로 저장한다. */
export function finalize(raw: L1Raw, row: { text: string; sent_at: ISO }): L1Resolved {
  const v = validateRaw(raw, row.text);
  const r = resolve(v.raw, row.sent_at);
  const warnings = [...v.warnings, ...r.warnings];
  if (r.occurred_at && r.restored_at && isoToMs(r.occurred_at) > isoToMs(r.restored_at)) {
    warnings.push("occurred_after_restored");
    r.restored_clock = null; r.restored_at = null;
  }
  return { ...r, warnings };
}

/** 자동 검증 지표(검수 없이 계산, §5-1): 근거 조각 원문 포함 여부·시각 형식 통과 여부 */
export function autoCheck(raw: L1Raw, text: string): { evidence_total: number; evidence_ok: number; time_total: number; time_ok: number } {
  const sq = squash(text);
  let et = 0, eo = 0, tt = 0, to = 0;
  for (const v of Object.values(raw.evidence ?? {})) {
    if (typeof v !== "string" || !v.trim()) continue;
    et++; if (text.includes(v) || sq.includes(squash(v))) eo++;
  }
  const clocks = [raw.occurred_clock, raw.restored_clock, raw.eta && raw.eta.type === "absolute" ? raw.eta.clock : null];
  for (const c of clocks) { if (c === null || c === undefined) continue; tt++; if (parseClock(c)) to++; }
  return { evidence_total: et, evidence_ok: eo, time_total: tt, time_ok: to };
}
