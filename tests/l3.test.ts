// L3 단위 시험 20건(구현명세 §5-3). 100% 통과가 완료 판정.
import { describe, expect, it } from "vitest";
import devicesJson from "../data/specs/devices.json";
import extJson from "../data/specs/ext_batteries.json";
import { safeTime, type SpecDb } from "../lib/engine/safeTime";
import { DEFAULT_PARAMS as P } from "../lib/engine/params";
import type { Household, HouseholdObserved } from "../lib/types";

const specs = { devices: devicesJson.devices, ext: extJson.ext } as unknown as SpecDb;
const T0 = "2026-08-14T18:58:00+09:00";
const T60 = "2026-08-14T19:58:00+09:00";

function hh(o: Partial<HouseholdObserved>): Household {
  return {
    id: "H99", alias: "H99", x_km: 0, y_km: 0, area: "서교동",
    observed: { device_id: "VENT_A", device_match: "manual", age_years: 0, screen: null, self: null, ext: null, spare_o2_min: null, ...o },
  };
}
const st = (o: Partial<HouseholdObserved>, now = T0, w: { precip_mm: number; wind_ms: number; temp_c: number } | null = null) =>
  safeTime(hh(o), specs, now, P, w);
const scr = (value: number, kind: "minutes" | "percent" = "minutes") => ({ kind, value, at: T0 });
const self = (charge: number) => ({ charge, at: T0 });

describe("L3 잔여안전시간 하한 20건", () => {
  it("1 B 시간만(A계열 190분) → 180", () => {
    const s = st({ screen: scr(190) });
    expect(s.status).toBe("value"); expect(s.grade).toBe("B"); expect(s.s_low_min).toBeCloseTo(180, 9);
  });
  it("2 B %(A계열 50%) → H_worst×0.5−10", () => {
    expect(st({ screen: scr(50, "percent") }).s_low_min).toBeCloseTo(240 * 0.5 - 10, 9);
  });
  it("3 C만(q 0.8, 연수 0) → 240×0.8×0.85−10", () => {
    const s = st({ self: self(0.8), age_years: 0 });
    expect(s.grade).toBe("C"); expect(s.s_low_min).toBeCloseTo(240 * 0.8 * 0.85 - 10, 9);
  });
  it("4 C + 연수 3 → ×0.7", () => {
    expect(st({ self: self(0.8), age_years: 3 }).s_low_min).toBeCloseTo(240 * 0.8 * 0.85 * 0.7 - 10, 9);
  });
  it("5 C + 연수 6 → 하한 0.6", () => {
    expect(st({ self: self(0.8), age_years: 6 }).s_low_min).toBeCloseTo(240 * 0.8 * 0.85 * 0.6 - 10, 9);
  });
  it("6 C + 연수 모름 → ×0.6", () => {
    const s = st({ self: self(0.8), age_years: null });
    expect(s.s_low_min).toBeCloseTo(240 * 0.8 * 0.85 * 0.6 - 10, 9); expect(s.flags).toContain("age_unknown");
  });
  it("7 B 있고 C 30% 넘게 다름 → 작은 값 + conflict", () => {
    // B 200분, C = 240×0.5×0.85 = 102분 → B 기준 49% 차이
    const s = st({ screen: scr(200), self: self(0.5), age_years: 0 });
    expect(s.flags).toContain("conflict"); expect(s.s_low_min).toBeCloseTo(240 * 0.5 * 0.85 - 10, 9);
  });
  it("8 B·C 차이 25% → B 값, conflict 없음", () => {
    // C = 240×0.75×0.85 = 153분, B = 204분 → |204−153|/204 = 0.25
    const s = st({ screen: scr(204), self: self(0.75), age_years: 0 });
    expect(s.flags).not.toContain("conflict"); expect(s.grade).toBe("B"); expect(s.s_low_min).toBeCloseTo(194, 9);
  });
  it("9 검증 외장 완충 → +H_worst_ext", () => {
    const s = st({ screen: scr(190), ext: { spec_id: "EXT_VENT_A", verified: true, charge: "full", nominal_min: null } });
    expect(s.s_low_min).toBeCloseTo(190 + 240 - 10, 9);
  });
  it("10 검증 외장 절반 → +0.5×", () => {
    const s = st({ screen: scr(190), ext: { spec_id: "EXT_VENT_A", verified: true, charge: "half", nominal_min: null } });
    expect(s.s_low_min).toBeCloseTo(190 + 120 - 10, 9);
  });
  it("11 검증 외장 충전 모름 → +0", () => {
    const s = st({ screen: scr(190), ext: { spec_id: "EXT_VENT_A", verified: true, charge: "unknown", nominal_min: null } });
    expect(s.s_low_min).toBeCloseTo(180, 9);
  });
  it("12 미검증 외장 → +0, ext_excluded_min 표시", () => {
    const s = st({ screen: scr(190), ext: { spec_id: null, verified: false, charge: "full", nominal_min: 300 } });
    expect(s.s_low_min).toBeCloseTo(180, 9); expect(s.ext_excluded_min).toBe(300); expect(s.flags).toContain("ext_excluded");
  });
  it("13 거치형 산소발생기 예비통 없음 → zero_confirmed 0", () => {
    const s = st({ device_id: "O2_STAT" });
    expect(s.status).toBe("zero_confirmed"); expect(s.s_low_min).toBe(0); expect(s.s_low_engine_min).toBe(0);
  });
  it("14 거치형 + 예비통 120분 → 102−10=92(C)", () => {
    const s = st({ device_id: "O2_STAT", spare_o2_min: 120 });
    expect(s.status).toBe("value"); expect(s.grade).toBe("C"); expect(s.s_low_min).toBeCloseTo(92, 9);
  });
  it("15 기기 모름 → unknown, engine 0", () => {
    const s = st({ device_id: null, device_match: "unknown", screen: scr(190) });
    expect(s.status).toBe("unknown"); expect(s.s_low_min).toBeNull(); expect(s.s_low_engine_min).toBe(0);
  });
  it("16 충전 정보 없음(기기 앎) → unknown", () => {
    const s = st({});
    expect(s.status).toBe("unknown"); expect(s.s_low_engine_min).toBe(0);
  });
  it("17 경과 60분 뒤 → 관측값 − 60", () => {
    expect(st({ screen: scr(190) }, T60).s_low_min).toBeCloseTo(180 - 60, 9);
  });
  it("18 경과가 값보다 큼 → 0(음수 없음)", () => {
    const s = st({ screen: scr(40) }, T60);
    expect(s.s_low_min).toBe(0); expect(s.status).toBe("value");
  });
  it("19 가정값 기기(석션기) → flags assumed_spec", () => {
    const s = st({ device_id: "SUCTION", device_match: "assumed", screen: scr(40) });
    expect(s.flags).toContain("assumed_spec"); expect(s.s_low_min).toBeCloseTo(30, 9);
  });
  it("20 기온 36℃ → flags heat, 값 불변", () => {
    const a = st({ screen: scr(190) }, T0, { precip_mm: 0, wind_ms: 1, temp_c: 36 });
    const b = st({ screen: scr(190) }, T0, null);
    expect(a.flags).toContain("heat"); expect(a.s_low_min).toBe(b.s_low_min);
  });
});
