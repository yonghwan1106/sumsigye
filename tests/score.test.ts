// 참값 채점·기준선 시험 (C 소유) — scoreTruth 식(구현명세 §6-6)과 R1·R3 규칙.
import { describe, expect, it } from "vitest";
import devicesJson from "../data/specs/devices.json";
import extJson from "../data/specs/ext_batteries.json";
import type { AllocInput, DeviceSpec, ExtBatterySpec, Household, Resource } from "../lib/types";
import { DEFAULT_PARAMS } from "../lib/engine/params";
import { scoreTruth } from "../lib/engine/score";
import { baseline } from "../lib/engine/baselines";
import { allocate } from "../lib/engine/allocate";

const specs = { devices: devicesJson.devices as unknown as DeviceSpec[], ext: extJson.ext as unknown as ExtBatterySpec[] };
const NOW = "2026-08-14T18:58:00+09:00";

function hh(id: string, x: number, minutes: number | null, dev: Household["observed"]["device_id"], truthBattery: number, truthDev = dev ?? "VENT_A"): Household {
  return {
    id, alias: id, x_km: x, y_km: 0, area: "가상",
    observed: {
      device_id: dev, device_match: dev ? "manual" : "unknown", age_years: 1,
      screen: minutes == null ? null : { kind: "minutes", value: minutes, at: NOW }, self: null, ext: null, spare_o2_min: null,
    },
    truth: { device_id: truthDev!, battery_min: truthBattery, ext_usable_min: 0, spare_o2_min: 0 },
  };
}
const PS_L = (id: string, x: number, avail = true): Resource => ({
  id, type: "PS_L", label: "휴대용 전원(대)", base_label: "가상", x_km: x, y_km: 0, available: avail, soc: 1,
  output: "AC_SINE", cont_w: 1000, energy_wh: 1000,
});
const GEN = (id: string, x: number): Resource => ({
  id, type: "GEN", label: "소방서 발전기", base_label: "가상", x_km: x, y_km: 0, available: true, soc: 1, output: "AC_UNKNOWN", cont_w: null, energy_wh: null,
});

function input(households: Household[], resources: Resource[]): AllocInput {
  return { households, resources, specs, now: NOW, urban: true, restore: { kind: "lognormal", mu: 1, sigma: 0.6, elapsed_min: 10, small_cell: false }, weather: null, fixed: [], params: DEFAULT_PARAMS };
}

describe("scoreTruth", () => {
  it("자원 없음 → max(0, R − Tb)", () => {
    const inp = input([hh("H01", 0, 60, "VENT_A", 60)], []);
    const s = scoreTruth(allocate(inp), inp, 200);
    expect(s.interruption_min).toBeCloseTo(140, 6);
    expect(s.interrupted).toBe(1);
  });
  it("a ≤ Tb → max(0, R − (Tb + C)), 에너지 부족 집계", () => {
    const inp = input([hh("H01", 0, 120, "VENT_A", 120)], [PS_L("R01", 0)]);
    const plan = baseline("R1", inp);
    expect(plan.rows[0].rid).toBe("R01");
    // a = 출동 준비 10분(거리 0), C = 1000 × 1 × 0.85 ÷ 90 × 60 = 566.7분
    const C = (1000 * 0.85) / 90 * 60;
    const s1 = scoreTruth(plan, inp, 300);
    expect(s1.interruption_min).toBe(0);
    const s2 = scoreTruth(plan, inp, 1000);
    expect(s2.interruption_min).toBeCloseTo(1000 - (120 + C), 6);
    expect(s2.energy_short).toBe(1);
  });
  it("a > Tb → (min(R,a) − Tb) + (R − (a + C))⁺", () => {
    const inp = input([hh("H01", 0, 5, "VENT_A", 5)], [PS_L("R01", 0)]);
    const s = scoreTruth(baseline("R1", inp), inp, 60);
    expect(s.interruption_min).toBeCloseTo(10 - 5, 6); // a = 10분, R = 60 < a + C
  });
  it("truth 기기와 호환 안 되는 배정 → 보호 없음 + 위반", () => {
    // 관측은 A계열 인공호흡기, 참값은 거치형 산소발생기(피크 640W) — PS_S(300W)는 참값 기기와 호환 안 됨
    const ps_s: Resource = { ...PS_L("R01", 0), type: "PS_S", cont_w: 300, energy_wh: 300 };
    const inp = input([hh("H01", 0, 30, "VENT_A", 0, "O2_STAT")], [ps_s]);
    const s = scoreTruth(baseline("R1", inp), inp, 90);
    expect(s.violations).toBe(1);
    expect(s.interruption_min).toBeCloseTo(90, 6);
  });
});

describe("기준선", () => {
  it("R1은 S_low 짧은 집부터 가장 빨리 닿는 호환 자원, 발전기는 보내지 않는다", () => {
    const inp = input([hh("H01", 1, 200, "VENT_A", 200), hh("H02", 2, 40, "VENT_A", 40)], [GEN("R01", 2), PS_L("R02", 2)]);
    const p = baseline("R1", inp);
    const byId = Object.fromEntries(p.rows.map((r) => [r.hid, r.rid]));
    expect(byId.H02).toBe("R02");
    expect(byId.H01).toBeNull();
    expect(p.violations).toBe(0);
  });
  it("R3는 호환을 무시하고 가장 가까운 자원 → 위반이 기록된다", () => {
    const inp = input([hh("H01", 0, 40, "VENT_A", 40)], [GEN("R01", 0), PS_L("R02", 3)]);
    const p = baseline("R3", inp);
    expect(p.rows[0].rid).toBe("R01");
    expect(p.violations).toBe(1);
  });
  it("A1·ORACLE은 같은 배정기에 복구 분포만 바꾼다", () => {
    const inp = input([hh("H01", 0, 40, "VENT_A", 40)], [PS_L("R01", 0)]);
    expect(baseline("A1", inp).method).toBe("A1");
    expect(baseline("ORACLE", inp, { truthRemaining_min: 30 }).method).toBe("ORACLE");
  });
});
