// 시나리오의 첫 상태(판단 시점 1)와 상태 읽기·쓰기 도우미.
import { emptyState } from "@/lib/state/store";
import type { ScenarioBundle, ScenarioState } from "@/lib/types";

export function emptyStateFor(b: ScenarioBundle): ScenarioState {
  return emptyState(b.id, b.decision_points[0] ?? b.outage_start);
}

/** 슬라이더 범위: 첫 신고(없으면 정전 시작) ~ 마지막 사건. */
export function timeRange(b: ScenarioBundle): { min: number; max: number } {
  const ts = b.timeline.map((e) => Date.parse(e.at));
  const first = b.timeline.find((e) => e.type === "report")?.at ?? b.outage_start;
  return { min: Date.parse(first), max: Math.max(...ts, ...b.decision_points.map((d) => Date.parse(d))) };
}
