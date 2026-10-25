// L1 고정 시험 10건(구현명세 §4-3 표, 원문 그대로 코퍼스에서 읽는다) + 날짜 보정 단위 시험.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { L1Resolved, SmsRow } from "../lib/types";
import { ruleExtract } from "../lib/l1/ruleExtract";
import { finalize } from "../lib/l1/validate";
import { futureClock, pastClock } from "../lib/l1/dates";
import { mulberry32 } from "../scripts/_rng";

const corpus = JSON.parse(readFileSync(join(__dirname, "..", "data", "sms", "corpus.json"), "utf8")) as { items: SmsRow[] };
const bySn = new Map(corpus.items.map((r) => [r.sn, r]));

function run(sn: number): L1Resolved {
  const row = bySn.get(sn);
  if (!row) throw new Error(`fixture ${sn} not in corpus`);
  expect(row.split).toBe("dev");
  return finalize(ruleExtract(row), row);
}
const hm = (iso: string | null) => (iso ? iso.slice(0, 16) : null);

describe("l1 rule fixtures (§4-3)", () => {
  it("266510 마포 발생 + 3시간 소요(기준 시각 모름) → 범위", () => {
    const f = run(266510);
    expect(f.relevant).toBe(true);
    expect(f.kind).toBe("occurrence");
    expect(hm(f.occurred_at)).toBe("2026-08-14T18:52");
    expect(f.eta).toEqual({ type: "duration", minutes: 180, base: "unknown" });
    expect(f.eta_at).toBeNull();
    expect(f.eta_range && f.eta_range.map(hm)).toEqual(["2026-08-14T21:52", "2026-08-14T23:18"]);
    expect(f.cause6).toBe("equipment");
  });
  it("266511 마포 복구 18:50 → 22:40", () => {
    const f = run(266511);
    expect(f.relevant).toBe(true);
    expect(f.kind).toBe("restoration");
    expect(f.occurred_clock).toBe("18:50");
    expect(f.restored_clock).toBe("22:40");
    expect(hm(f.restored_at)).toBe("2026-08-14T22:40");
  });
  it("254509 안성 발생 03:20, 지역 목록", () => {
    const f = run(254509);
    expect(f.relevant).toBe(true);
    expect(f.kind).toBe("occurrence");
    expect(hm(f.occurred_at)).toBe("2026-02-05T03:20");
    for (const a of ["고삼", "대덕", "양성면"]) expect(f.areas).toContain(a);
  });
  it("254516 안성 복구(시각 없음)", () => {
    const f = run(254516);
    expect(f.relevant).toBe(true);
    expect(f.kind).toBe("restoration");
    expect(f.occurred_clock).toBe("03:20");
    expect(f.restored_clock).toBeNull();
  });
  it("266838 유성 발생 14:31 + 예상 18:00(전날 아님) + 화재", () => {
    const f = run(266838);
    expect(f.relevant).toBe(true);
    expect(["occurrence", "eta_update"]).toContain(f.kind);
    expect(hm(f.occurred_at)).toBe("2026-08-18T14:31");
    expect(f.eta).toEqual({ type: "absolute", clock: "18:00" });
    expect(hm(f.eta_at)).toBe("2026-08-18T18:00");
    expect(f.cause6).toBe("fire");
  });
  it("266843 유성 지연 안내 19:00", () => {
    const f = run(266843);
    expect(f.relevant).toBe(true);
    expect(f.kind).toBe("eta_update");
    expect(f.occurred_clock).toBeNull();
    expect(f.eta && f.eta.type).toBe("absolute");
    expect(hm(f.eta_at)).toBe("2026-08-18T19:00");
  });
  it("266844 유성 복구(시각 없음)", () => {
    const f = run(266844);
    expect(f.relevant).toBe(true);
    expect(f.kind).toBe("restoration");
    expect(f.restored_clock).toBeNull();
  });
  it("250936 동작 「3시까지」 → 15:00, 차량", () => {
    const f = run(250936);
    expect(f.relevant).toBe(true);
    expect(f.eta && f.eta.type).toBe("absolute");
    expect(hm(f.eta_at)).toBe("2025-12-12T15:00");
    expect(f.cause6).toBe("vehicle");
  });
  it("269705 은평 「현재」 발생 → occurred null", () => {
    const f = run(269705);
    expect(f.relevant).toBe(true);
    expect(f.kind).toBe("occurrence");
    expect(f.occurred_clock).toBeNull();
    expect(f.occurred_at).toBeNull();
  });
  it("269706 은평 15:39부로 복전", () => {
    const f = run(269706);
    expect(f.relevant).toBe(true);
    expect(f.kind).toBe("restoration");
    expect(f.restored_clock).toBe("15:39");
  });
});

describe("l1 dates", () => {
  it("발생 시각이 발송보다 늦으면 전날", () => {
    expect(pastClock("23:50", "2026-08-15T00:10:00+09:00")).toBe("2026-08-14T23:50:00+09:00");
  });
  it("예고 24시 → 다음 날 0시", () => {
    expect(futureClock("00:00", "2024-01-14T20:22:00+09:00")).toBe("2024-01-15T00:00:00+09:00");
  });
  it("오전 10시 예고는 발송 08:22 뒤 10:00", () => {
    expect(futureClock("10:00", "2023-12-12T08:22:00+09:00")).toBe("2023-12-12T10:00:00+09:00");
  });
});

describe("rng", () => {
  it("scripts/_rng.ts = lib/synth/rng.ts mulberry32 (B 파일이 있을 때)", async () => {
    const p = join(__dirname, "..", "lib", "synth", "rng.ts");
    if (!existsSync(p)) return;
    const mod = (await import("../lib/synth/rng")) as Record<string, unknown>;
    const fb = mod.mulberry32 as ((s: number) => () => number) | undefined;
    if (typeof fb !== "function") return;
    const a = mulberry32(20261026), b = fb(20261026);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});
