// 시나리오 진행(QA 수정): 복구 뒤에는 배정 재계산·복구 예측을 멈추고, 도착한 승인 전원은 공급 중으로 본다.
import { describe, expect, it } from "vitest";
import sc1 from "../data/scenarios/sc1.json";
import sc2 from "../data/scenarios/sc2.json";
import { compute, restoredInfo, type SmsL1 } from "../components/ops/scenario";
import { emptyState } from "../lib/state/store";
import type { ScenarioBundle, ScenarioState } from "../lib/types";

function l1Of(b: ScenarioBundle): SmsL1 {
  const o: SmsL1 = {};
  for (const [k, v] of Object.entries(b.precomputed.l1)) o[k] = { fields: v.fields, source: "precomputed" };
  return o;
}
const B1 = sc1 as unknown as ScenarioBundle;
const B2 = sc2 as unknown as ScenarioBundle;

describe("복구 확인", () => {
  it("sc1 22:40 실제 복구·22:49 복구 문자 → 복구됨(재난문자 기준 22:40), 바뀜 표시 없음, 계산은 20:19에 멈춤", () => {
    const l1 = l1Of(B1);
    for (const now of ["2026-08-14T22:40:00+09:00", "2026-08-14T22:49:26+09:00"]) {
      const c = compute(B1, { ...emptyState("sc1", now) }, l1);
      expect(c.restored).toEqual({ at: "2026-08-14T22:40:00+09:00", basis: "sms_time", known_at: "2026-08-14T22:40:00+09:00" });
      expect(c.changed.size).toBe(0);
      expect(c.frozen_at).toBe("2026-08-14T20:19:00+09:00");
    }
    expect(restoredInfo(B1, "2026-08-14T22:39:00+09:00", l1)).toBeNull();
  });
  it("sc2 시각 없는 복구 문자 → 수신 시각 기준", () => {
    const r = restoredInfo(B2, "2026-02-05T07:09:00+09:00", l1Of(B2));
    expect(r).toMatchObject({ at: "2026-02-05T07:08:36+09:00", basis: "sms_received" });
  });
});

describe("승인 → 다음 사건", () => {
  it("sc1 18:58 H03 승인 → 20:18:52에는 전원 도착·공급 중, 1순위 아님", () => {
    const l1 = l1Of(B1);
    const s0 = emptyState("sc1", B1.decision_points[0]);
    const rid = compute(B1, s0, l1).plan.rows.find((r) => r.hid === "H03")!.rid!;
    const s: ScenarioState = { ...s0, now: "2026-08-14T20:18:52+09:00", approvals: [{ hid: "H03", rid, approved_at: s0.now, reason: "기본" }] };
    const row = compute(B1, s, l1).plan.rows.find((r) => r.hid === "H03")!;
    expect(row.arrived).toBeDefined();
    expect(row.priority).not.toBe(1);
    expect(row.lane).toBe("main");
    expect(row.safe.s_low_engine_min).toBeGreaterThan(60);
  });
});
