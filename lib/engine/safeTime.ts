// L3 잔여안전시간 하한(설계서 §4-3 규칙 1~11, 구현명세 §5-3 시험 20건).
// 단위: 분. 관측 시각 → 판단 시각(now)까지 경과만큼 뺀다. 음수는 0.
import type { DeviceSpec, EngineParams, ExtBatterySpec, Household, ISO, SafeTime } from "../types";
import { CONFLICT_REL, HEAT_BADGE_C, SPARE_O2_FACTOR } from "./params";
import { minutesBetween } from "./time";

export interface SpecDb { devices: DeviceSpec[]; ext: ExtBatterySpec[] }
export type Weather = { precip_mm: number; wind_ms: number; temp_c: number } | null | undefined;

export function findDevice(specs: SpecDb, id: string | null | undefined): DeviceSpec | null {
  if (!id) return null;
  return specs.devices.find((d) => d.id === id) ?? null;
}

/** 노후 계수 = max(0.6, 1 − 0.1 × 연수), 연수 모름 = 0.6 (규칙 4). */
export function ageFactor(age: number | null, p: EngineParams): number {
  if (age == null) return p.age_unknown_factor;
  return Math.max(p.age_floor, 1 - p.age_per_year * age);
}

export function safeTime(h: Household, specs: SpecDb, now: ISO, params: EngineParams, weather?: Weather): SafeTime {
  const o = h.observed;
  const flags: SafeTime["flags"] = [];
  if (weather && weather.temp_c >= HEAT_BADGE_C) flags.push("heat"); // 규칙 11: 배지만, 값 불변

  const unknown = (): SafeTime => ({
    status: "unknown", s_low_min: null, s_low_engine_min: 0, grade: null,
    reference_std_min: dev?.h_std_min ?? null, ext_excluded_min: extExcluded, flags,
  });

  const dev = findDevice(specs, o.device_id);
  let extExcluded: number | null = null;
  if (!dev) return unknown(); // 규칙 10: 기기 모름

  if (dev.source === "assumed") flags.push("assumed_spec"); // 시험 19
  const margin = params.alarm_margin_min; // 규칙 6: 경보 여유는 모든 값에 똑같이 뺀다

  // 규칙 7·8: 외장배터리
  let extAdd = 0;
  if (o.ext) {
    const es = o.ext.spec_id ? specs.ext.find((e) => e.id === o.ext!.spec_id) ?? null : null;
    const verified = o.ext.verified && (es == null || es.family === dev.family);
    if (verified) {
      const base = es?.h_worst_min ?? o.ext.nominal_min ?? 0;
      const f = o.ext.charge === "full" ? 1 : o.ext.charge === "half" ? 0.5 : 0; // 모름 → 더하지 않음
      extAdd = base * f;
    } else {
      extExcluded = o.ext.nominal_min ?? es?.h_worst_min ?? null;
      flags.push("ext_excluded");
    }
  }

  // 규칙 9: 거치형 산소발생기(내장 배터리 없음)
  if (dev.h_worst_min <= 0) {
    if (o.spare_o2_min != null && o.spare_o2_min > 0) {
      const at = o.self?.at ?? o.screen?.at ?? null;
      const el = at ? Math.max(0, minutesBetween(at, now)) : 0;
      const v = Math.max(0, o.spare_o2_min * SPARE_O2_FACTOR - el - margin);
      return { status: "value", s_low_min: v, s_low_engine_min: v, grade: "C",
        reference_std_min: dev.h_std_min, ext_excluded_min: extExcluded, flags };
    }
    return { status: "zero_confirmed", s_low_min: 0, s_low_engine_min: 0, grade: "A",
      reference_std_min: dev.h_std_min, ext_excluded_min: extExcluded, flags };
  }

  // 규칙 2: 기기 화면 값(B)
  let bRaw: number | null = null, bNow: number | null = null;
  if (o.screen) {
    bRaw = o.screen.kind === "minutes" ? o.screen.value : dev.h_worst_min * (o.screen.value / 100);
    bNow = bRaw - Math.max(0, minutesBetween(o.screen.at, now));
  }
  // 규칙 3·4: 보호자 입력(C)
  let cRaw: number | null = null, cNow: number | null = null;
  if (o.self) {
    if (o.age_years == null) flags.push("age_unknown");
    cRaw = dev.h_worst_min * o.self.charge * (1 - params.self_discount) * ageFactor(o.age_years, params);
    cNow = cRaw - Math.max(0, minutesBetween(o.self.at, now));
  }

  if (bNow == null && cNow == null) return unknown(); // 규칙 10: 충전 상태 모름(시험 16)

  let chosen: number, grade: "B" | "C";
  if (bNow != null && cNow != null) {
    const rel = bRaw! > 0 ? Math.abs(bRaw! - cRaw!) / bRaw! : (cRaw! > 0 ? 1 : 0);
    if (rel > CONFLICT_REL) { // 규칙 5
      flags.push("conflict");
      if (cNow < bNow) { chosen = cNow; grade = "C"; } else { chosen = bNow; grade = "B"; }
    } else { chosen = bNow; grade = "B"; }
  } else if (bNow != null) { chosen = bNow; grade = "B"; }
  else { chosen = cNow!; grade = "C"; }

  const v = Math.max(0, chosen + extAdd - margin);
  return { status: "value", s_low_min: v, s_low_engine_min: v, grade,
    reference_std_min: dev.h_std_min, ext_excluded_min: extExcluded, flags };
}
