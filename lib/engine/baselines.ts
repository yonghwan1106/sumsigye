// 비교 기준선 (구현명세 §6-6 baseline, 설계서 §4-4-7) — C 소유. 모두 observed만 본다.
// R1 단순 규칙: S_low(engine) 오름차순으로 가장 빨리 닿는 호환 자원
// R2 가까운 순: 「가장 가까운 호환 자원 도착」 오름차순으로 가장 빨리 닿는 호환 자원
// R3 호환 무시: S_low 오름차순, 기기 호환을 보지 않고 가장 가까운 자원(가용·잔량만 봄, 위반 수는 buildPlan이 센다)
// A1 고정 2시간: allocate와 같은 배정기, 남은 복구 = 120분 고정 / ORACLE: 같은 배정기, 남은 복구 = 참값
import type { AllocInput, Method, Plan } from "../types";
import { allocate, buildPlan, nowMs, prepare, type Prepared } from "./allocate";

export const A1_FIXED_MIN = 120;

function byKey<T>(xs: T[], key: (x: T) => number, id: (x: T) => string): T[] {
  return [...xs].sort((a, b) => {
    const d = key(a) - key(b);
    if (d !== 0) return d;
    const ia = id(a), ib = id(b);
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}

/** 정해진 순서로 가구마다 남은 자원 중 가장 빨리 닿는 후보를 고른다. */
function greedy(order: Prepared[], ok: (c: Prepared["cands"][number]) => boolean): Map<string, string | null> {
  const used = new Set<string>();
  const assign = new Map<string, string | null>();
  for (const x of order) {
    const cands = x.cands.filter((c) => ok(c) && !used.has(c.r.id));
    if (cands.length === 0) {
      assign.set(x.h.id, null);
      continue;
    }
    const best = byKey(cands, (c) => c.arrival, (c) => c.r.id)[0];
    used.add(best.r.id);
    assign.set(x.h.id, best.r.id);
  }
  return assign;
}

export function baseline(method: Method, input: AllocInput, opts: { truthRemaining_min?: number } = {}): Plan {
  if (method === "ours") return allocate(input);
  if (method === "A1") {
    const p = allocate({ ...input, restore: { kind: "fixed", remaining_min: A1_FIXED_MIN } });
    return { ...p, method: "A1" };
  }
  if (method === "ORACLE") {
    if (opts.truthRemaining_min == null) throw new Error("ORACLE needs truthRemaining_min");
    const p = allocate({ ...input, restore: { kind: "oracle", remaining_min: Math.max(0, opts.truthRemaining_min) } });
    return { ...p, method: "ORACLE" };
  }
  const t0 = nowMs();
  const prep = prepare(input);
  const sLow = (x: Prepared) => x.safe.s_low_engine_min;
  const hid = (x: Prepared) => x.h.id;
  let assign: Map<string, string | null>;
  if (method === "R1") {
    assign = greedy(byKey(prep, sLow, hid), (c) => c.c.ok);
  } else if (method === "R2") {
    const nearest = (x: Prepared) => {
      const a = x.cands.filter((c) => c.c.ok).map((c) => c.arrival);
      return a.length ? Math.min(...a) : Number.POSITIVE_INFINITY;
    };
    assign = greedy(byKey(prep, nearest, hid), (c) => c.c.ok);
  } else if (method === "R3") {
    const usable = (c: Prepared["cands"][number]) => c.r.available && c.r.soc > input.params.soc_min;
    assign = greedy(byKey(prep, sLow, hid), usable);
  } else {
    throw new Error(`baseline: unsupported method ${method}`);
  }
  return buildPlan(method, input, prep, assign, t0);
}

/** 외부 배정(LLM 단독 등)을 Plan으로 만든다. 없는 자원·중복 자원은 미배정으로 돌리고 개수를 돌려준다. */
export function planFromAssignment(
  method: Method,
  input: AllocInput,
  pairs: { household: string; resource: string | null }[],
): { plan: Plan; dropped: number } {
  const t0 = nowMs();
  const prep = prepare(input);
  const rids = new Set(input.resources.map((r) => r.id));
  const hids = new Set(input.households.map((h) => h.id));
  const used = new Set<string>();
  const assign = new Map<string, string | null>();
  let dropped = 0;
  for (const p of pairs) {
    if (!hids.has(p.household) || assign.has(p.household)) {
      dropped++;
      continue;
    }
    if (p.resource == null) {
      assign.set(p.household, null);
      continue;
    }
    if (!rids.has(p.resource) || used.has(p.resource)) {
      dropped++;
      assign.set(p.household, null);
      continue;
    }
    used.add(p.resource);
    assign.set(p.household, p.resource);
  }
  return { plan: buildPlan(method, input, prep, assign, t0), dropped };
}
