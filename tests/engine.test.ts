// L4 엔진 시험(구현명세 §5-4).
import { describe, expect, it } from "vitest";
import devicesJson from "../data/specs/devices.json";
import extJson from "../data/specs/ext_batteries.json";
import { allocate, type AllocDebug } from "../lib/engine/allocate";
import { compat } from "../lib/engine/compat";
import { cost, INFEASIBLE } from "../lib/engine/cost";
import { hungarian } from "../lib/engine/hungarian";
import { DEFAULT_PARAMS as P } from "../lib/engine/params";
import { pickShowcase } from "../lib/engine/showcase";
import type { AllocInput, DeviceId, Household, HouseholdObserved, Resource, RestoreDist } from "../lib/types";
import { mulberry32 } from "../lib/synth/rng";
import { evalConfig, generate } from "../lib/synth/generate";

const specs = { devices: devicesJson.devices, ext: extJson.ext } as unknown as AllocInput["specs"];
const NOW = "2026-08-14T18:58:00+09:00";
const D: RestoreDist = { kind: "lognormal", mu: 0.6419, sigma: 0.7344, elapsed_min: 6, small_cell: false };

function hh(id: string, x: number, y: number, o: Partial<HouseholdObserved>): Household {
  return { id, alias: id, x_km: x, y_km: y, area: "서교동",
    observed: { device_id: "VENT_A", device_match: "manual", age_years: 1, screen: null, self: null, ext: null, spare_o2_min: null, ...o } };
}
const screen = (value: number) => ({ kind: "minutes" as const, value, at: NOW });
function res(id: string, type: Resource["type"], x: number, y: number, extra: Partial<Resource> = {}): Resource {
  const base: Record<Resource["type"], Partial<Resource>> = {
    PS_L: { output: "AC_SINE", cont_w: 1000, energy_wh: 1000 },
    PS_S: { output: "AC_SINE", cont_w: 300, energy_wh: 300 },
    ESS: { output: "AC_SINE", cont_w: 3000, energy_wh: 5000 },
    RB: { output: "FAMILY", family: "VENT_A", cont_w: null, energy_wh: null, rb_minutes: 240 },
    GEN: { output: "AC_UNKNOWN", cont_w: null, energy_wh: null },
  };
  return { id, type, label: type, base_label: "구청(가상 위치)", x_km: x, y_km: y, available: true, soc: 1, ...base[type], ...extra } as Resource;
}
function input(households: Household[], resources: Resource[], over: Partial<AllocInput> = {}): AllocInput {
  return { households, resources, specs, now: NOW, urban: true, restore: D, weather: null, fixed: [], params: P, ...over };
}

// 전수탐색: 각 행이 서로 다른 자원 열 하나 또는 「자원 없음」(가상열)을 고르는 모든 경우
function brute(m: number[][], R: number): number {
  const H = m.length;
  let best = Infinity;
  const used = new Array<boolean>(R).fill(false);
  const rec = (i: number, acc: number) => {
    if (acc >= best) return;
    if (i === H) { best = acc; return; }
    rec(i + 1, acc + m[i][R + i]); // 가상열(모든 가상열 값이 같다)
    for (let j = 0; j < R; j++) {
      if (used[j] || m[i][j] >= INFEASIBLE) continue;
      used[j] = true; rec(i + 1, acc + m[i][j]); used[j] = false;
    }
  };
  rec(0, 0);
  return best;
}

describe("헝가리안 = 전수탐색", () => {
  it("무작위 300건(가구 1~7, 자원 0~4, 호환 30% 불가) 총비용 100% 일치, 10¹⁴ 칸 선택 0건", () => {
    const rnd = mulberry32(20261026);
    let same = 0, infPicks = 0;
    for (let k = 0; k < 300; k++) {
      const H = 1 + Math.floor(rnd() * 7), R = Math.floor(rnd() * 5);
      const m: number[][] = [];
      for (let i = 0; i < H; i++) {
        const s = rnd() < 0.15 ? 0 : rnd() * 300;
        const none = cost({ s_low: s, arrival: null, supply: null }, D).int_cost;
        const line: number[] = [];
        for (let j = 0; j < R; j++) {
          line.push(rnd() < 0.3 ? INFEASIBLE : cost({ s_low: s, arrival: 10 + rnd() * 90, supply: rnd() * 600 }, D).int_cost);
        }
        for (let j = 0; j < H; j++) line.push(none);
        m.push(line);
      }
      const sol = hungarian(m);
      const tot = sol.reduce((a, j, i) => a + m[i][j], 0);
      sol.forEach((j, i) => { if (m[i][j] >= INFEASIBLE) infPicks++; });
      if (tot === brute(m, R)) same++;
    }
    expect(same).toBe(300);
    expect(infPicks).toBe(0);
  });

  it("allocate 실제 입력(합성 평가 세트 50건)에서도 고른 칸에 10¹⁴ 0건", () => {
    let inf = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const cfg = evalConfig(seed, "small");
      const g = generate(cfg, specs);
      const dbg: AllocDebug[] = [];
      allocate(input(g.households, g.resources, { urban: cfg.urban }), dbg);
      for (const x of dbg) x.picks.forEach((j, i) => { if (x.matrix[i][j] >= INFEASIBLE) inf++; });
    }
    expect(inf).toBe(0);
  });
});

describe("사전식 비용", () => {
  it("P_int 합이 작은 해를 EI가 아무리 커도 고른다", () => {
    // H1: 200분 버팀, 자원이 가면 멈춤 확률이 크게 준다. H2: 「모름」(0분) — 자원이 가도 멈춤 확률 1 그대로, 멈춤 시간만 크게 준다.
    const H1 = hh("H01", 0.5, 0, { screen: screen(210) });
    const H2 = hh("H02", 0.2, 0, { device_id: null, device_match: "unknown" });
    const R1 = res("R01", "ESS", 0, 0);
    const inp = input([H1, H2], [R1]);
    // 구성 확인: H2에 주면 EI 감소가 H1에 줄 때보다 훨씬 크다
    const p = allocate(inp);
    const r1 = p.rows.find((r) => r.hid === "H01")!, r2 = p.rows.find((r) => r.hid === "H02")!;
    const eiGainH2 = r2.ei0_min - cost({ s_low: 0, arrival: 10 + 0.2 * 1.3 / 25 * 60, supply: 5000 * 0.85 / 320 * 60 }, D).ei_min;
    const eiGainH1 = r1.ei0_min - r1.ei_min;
    expect(eiGainH2).toBeGreaterThan(eiGainH1);
    expect(r1.rid).toBe("R01");
    expect(r2.rid).toBeNull();
  });
});

describe("우선순위·레인", () => {
  it("자원 없는 거치형(0분) 가구가 표 1순위 + 119 레인", () => {
    const hs = [
      hh("H01", 0, 0, { device_id: "O2_STAT" }),
      hh("H02", 1, 0, { screen: screen(60) }),
      hh("H03", 1, 1, { screen: screen(300) }),
      hh("H04", 0, 1, { device_id: null, device_match: "unknown" }),
    ];
    // 산소발생기(640W 필요)에 맞는 자원 없음: PS_S(300W)·GEN(파형 미확인)·RB(A계열 전용)
    const rs = [res("R01", "PS_S", 0.5, 0.5), res("R02", "GEN", 0.2, 0.2), res("R03", "RB", 0.3, 0.3)];
    const p = allocate(input(hs, rs));
    const first = p.rows[0];
    expect(first.hid).toBe("H01");
    expect(first.priority).toBe(1);
    expect(first.lane).toBe("119");
    expect(first.lane_reason).toBe("no_compatible");
    const ex = first.excluded;
    expect(ex.find((e) => e.rid === "R01")).toMatchObject({ reason: "power_short", need_w: 640 });
    expect(ex.find((e) => e.rid === "R02")?.reason).toBe("waveform_unknown");
    expect(ex.find((e) => e.rid === "R03")?.reason).toBe("connector");
    expect(p.rows.find((r) => r.hid === "H04")!.lane).toBe("manual");
  });
});

describe("승인 고정", () => {
  it("승인한 (가구, 자원)이 재계산 뒤에도 그대로, 그 자원은 다른 가구에 안 감", () => {
    const hs = [hh("H01", 0, 0, { screen: screen(70) }), hh("H02", 2, 2, { screen: screen(400) })];
    const rs = [res("R01", "PS_L", 0.1, 0.1)];
    const free = allocate(input(hs, rs));
    expect(free.rows.find((r) => r.hid === "H01")!.rid).toBe("R01"); // 풀이 기본값은 H01
    const fixedInp = input(hs, rs, { fixed: [{ hid: "H02", rid: "R01", approved_at: NOW }], now: "2026-08-14T19:10:00+09:00" });
    const p = allocate(fixedInp);
    const h2 = p.rows.find((r) => r.hid === "H02")!, h1 = p.rows.find((r) => r.hid === "H01")!;
    expect(h2.rid).toBe("R01"); expect(h2.fixed).toBe(true);
    expect(h1.rid).toBeNull();
  });
});

describe("호환 제약", () => {
  it("발전기 파형 미확인 제외 · 잔량 20% 이하 제외 · 사용 불가 제외", () => {
    const vent = specs.devices.find((d) => d.id === "VENT_A")!;
    expect(compat(vent, res("G", "GEN", 0, 0), P)).toMatchObject({ ok: false, reason: "waveform_unknown" });
    expect(compat(vent, res("L", "PS_L", 0, 0, { soc: 0.2 }), P)).toMatchObject({ ok: false, reason: "low_soc" });
    expect(compat(vent, res("U", "PS_L", 0, 0, { available: false }), P)).toMatchObject({ ok: false, reason: "unavailable" });
    expect(compat(vent, res("S", "PS_S", 0, 0), P).ok).toBe(true);
    expect(compat(null, res("S", "PS_S", 0, 0), P)).toMatchObject({ ok: false, reason: "power_short", need_w: 640 });
    expect(compat(null, res("B", "RB", 0, 0), P)).toMatchObject({ ok: false, reason: "connector" });
  });
});

describe("쇼케이스", () => {
  it("규칙과 숨시계 배정이 다른 가구 중 빨간 분 차이가 가장 큰 가구", () => {
    const hs = [hh("H01", 0, 0, { screen: screen(100) })];
    const rs = [res("R01", "PS_L", 0.1, 0), res("R02", "PS_L", 2.9, 2.9)];
    const ours = allocate(input(hs, rs));
    expect(ours.rows[0].rid).toBe("R01");
    const r1 = { ...ours, method: "R1" as const, rows: ours.rows.map((r) => ({ ...r, rid: "R02", arrival_min: 200 })) };
    expect(pickShowcase(ours, r1, D)).toBe("H01");
    expect(pickShowcase(ours, ours, D)).toBeNull();
  });
});

describe("속도(참고값)", () => {
  it("광역 50×15 allocate 평균 시간 기록", () => {
    const g = generate({ ...evalConfig(1001, "wide"), n_households: 50, resources: { PS_L: 6, PS_S: 3, ESS: 3, RB: 2, GEN: 1 } }, specs);
    const N = 10;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) allocate(input(g.households, g.resources, { urban: false }));
    const ms = (performance.now() - t0) / N;
    console.log(`[speed] wide 50x15 allocate avg ${ms.toFixed(1)} ms`);
    expect(g.households.length).toBe(50);
    expect(g.resources.length).toBe(15);
  });
});

void ({} as DeviceId);
