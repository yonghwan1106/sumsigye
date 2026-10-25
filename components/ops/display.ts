// 엔진 출력 → 화면 표시 문자열(/ops·/home·운영자 메모 facts 공용). 숫자는 lib/format.ts 규칙만 쓴다.
import { GUARDIAN, OPS, fill } from "@/lib/copy";
import { fmtMin, fmtProb, fmtSignedMin } from "@/lib/format";
import type { DeviceId, PlanRow, Resource, SafeTime } from "@/lib/types";
import { OPS_B } from "./copyB";
import { SPECS } from "./scenario";

export function deviceLabel(id: DeviceId | null): string {
  if (!id) return OPS_B.unknownValue;
  return SPECS.devices.find((d) => d.id === id)?.label ?? OPS_B.unknownValue;
}

/** 기기 등록 목록 문구(참고 사양 포함). */
export function deviceOption(id: DeviceId | "unknown"): string {
  return GUARDIAN.deviceOptions[id];
}

export function safeText(s: SafeTime): string {
  if (s.status === "unknown") return OPS_B.unknownValue;
  if (s.status === "zero_confirmed") return OPS_B.zeroConfirmed;
  return fmtMin(s.s_low_min ?? 0);
}

export function gradeBadges(s: SafeTime): string[] {
  const out: string[] = [];
  if (s.grade === "A") out.push(OPS.grades.A);
  if (s.grade === "B") out.push(OPS.grades.B);
  if (s.grade === "C") out.push(OPS.grades.C);
  if (s.flags.includes("assumed_spec")) out.push(OPS.grades.assumed);
  return out;
}

export function resourceText(r: Resource | undefined | null): string {
  if (!r) return OPS_B.noResource;
  return `${r.label}(${r.base_label})`;
}

export function arrivalText(row: PlanRow, res: Resource[]): string {
  if (!row.rid || row.arrival_min == null) return OPS_B.noResource;
  const r = res.find((x) => x.id === row.rid);
  return fill(OPS_B.arrivalLine, { r: resourceText(r), t: fmtMin(row.arrival_min) });
}

export function exclusionText(e: PlanRow["excluded"][number], res: Resource[]): string {
  const r = res.find((x) => x.id === e.rid);
  const why = e.reason === "power_short" ? fill(OPS.exclusion.power_short, { w: Math.round(e.need_w ?? 0) }) : OPS.exclusion[e.reason];
  return `${resourceText(r)}: ${why}`;
}

/** 운영자 메모(/api/brief) facts 한 행 — 엔진이 만든 표시 문자열만. */
export function factRow(row: PlanRow, alias: string, device: DeviceId | null, res: Resource[]) {
  const r = row.rid ? res.find((x) => x.id === row.rid) : null;
  return {
    alias, device: deviceLabel(device), safe: safeText(row.safe), prob: fmtProb(row.p_int0), margin: fmtSignedMin(row.margin_min),
    resource: r ? resourceText(r) : null, arrival: row.arrival_min != null && r ? fmtMin(row.arrival_min) : null,
    lane: row.lane, excluded: row.excluded.map((e) => exclusionText(e, res)),
  };
}
