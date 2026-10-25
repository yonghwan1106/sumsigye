"use client";
// /ops 가운데 「가상 배치도(실제 위치 아님)」(구현명세 §8-2). 지도 타일 없음 — SVG 직접.
import { COLORS, OPS } from "@/lib/copy";
import { areaGeometry } from "@/lib/synth/generate";
import type { DeviceId, Household, Plan, Resource, ScenarioBundle, ScenarioState } from "@/lib/types";
import { OPS_B } from "./copyB";

const AMBER = COLORS.changedText;

function probColor(row: Plan["rows"][number] | undefined): string {
  if (!row || row.safe.status === "unknown") return COLORS.muted;
  if (row.p_int0 >= 0.5) return COLORS.stop;
  if (row.p_int0 >= 0.1) return AMBER;
  return COLORS.ok;
}
function family(id: DeviceId | null): "vent" | "o2" | "other" {
  if (id === "VENT_A" || id === "VENT_B") return "vent";
  if (id === "O2_STAT" || id === "O2_PORT") return "o2";
  return "other";
}

function Marker({ x, y, kind, color, size }: { x: number; y: number; kind: "vent" | "o2" | "other"; color: string; size: number }) {
  if (kind === "vent") return <circle cx={x} cy={y} r={size} fill={color} stroke="#fff" strokeWidth={1.5} />;
  if (kind === "o2") return <polygon points={`${x},${y - size * 1.2} ${x - size * 1.1},${y + size * 0.8} ${x + size * 1.1},${y + size * 0.8}`} fill={color} stroke="#fff" strokeWidth={1.5} />;
  return <rect x={x - size * 0.9} y={y - size * 0.9} width={size * 1.8} height={size * 1.8} fill={color} stroke="#fff" strokeWidth={1.5} />;
}

export default function MapPanel(props: { bundle: ScenarioBundle; state: ScenarioState; plan: Plan; households: Household[]; restored?: boolean }) {
  const { bundle: b, state: s, plan, households, restored } = props;
  const A = b.region.area_km;
  const W = 600, H = 600, pad = 24;
  const sc = (W - 2 * pad) / A;
  const X = (km: number) => pad + km * sc;
  const Y = (km: number) => pad + km * sc;
  const geos = areaGeometry(b.region.areas, A);
  const byHid = new Map(plan.rows.map((r) => [r.hid, r] as const));
  const approved = new Map(s.approvals.map((a) => [a.hid, a.rid] as const));
  const many = households.length > 12;
  const size = many ? 6 : 9;

  // 거점별 자원 묶음
  const bases = new Map<string, { x: number; y: number; label: string; res: Resource[] }>();
  for (const r of b.resources) {
    const k = `${r.x_km},${r.y_km},${r.base_label}`;
    const g = bases.get(k) ?? { x: r.x_km, y: r.y_km, label: r.base_label, res: [] };
    g.res.push(r); bases.set(k, g);
  }
  const resById = new Map(b.resources.map((r) => [r.id, r] as const));

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <h2 className="pr-24 text-base font-bold text-[#101828]">{OPS.mapTitle}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[calc(100vh-220px)] min-h-[260px] rounded-lg border border-[#EAECF0] bg-[#FCFCFD]">
        {geos.map((g) => (
          <g key={g.name}>
            <circle cx={X(g.cx)} cy={Y(g.cy)} r={g.r * sc} fill="#F2F4F7" stroke="#98A2B3" strokeDasharray="6 4" />
            <text x={X(g.cx)} y={Y(g.cy - g.r) + 18} textAnchor="middle" fontSize={22} fontWeight={700} fill="#475467">{g.name}</text>
          </g>
        ))}
        {/* 배정 선: 승인 전 = 점선, 승인 후 = 실선 */}
        {plan.rows.filter((r) => r.rid && (!restored || approved.get(r.hid) === r.rid)).map((r) => {
          const h = households.find((x) => x.id === r.hid);
          const res = resById.get(r.rid!);
          if (!h || !res) return null;
          const ok = approved.get(r.hid) === r.rid;
          return <line key={`l-${r.hid}`} x1={X(res.x_km)} y1={Y(res.y_km)} x2={X(h.x_km)} y2={Y(h.y_km)} stroke={ok ? "#1D4ED8" : "#475467"}
            strokeWidth={ok ? 3 : 2} strokeDasharray={ok ? undefined : "6 5"} markerEnd="url(#arrow)" data-line={ok ? "approved" : "proposed"} />;
        })}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475467" />
          </marker>
        </defs>
        {[...bases.values()].map((g) => (
          <g key={`b-${g.label}-${g.x}-${g.y}`}>
            <rect x={X(g.x) - 13} y={Y(g.y) - 13} width={26} height={26} rx={4} fill="#fff" stroke="#1D4ED8" strokeWidth={2} />
            <text x={X(g.x)} y={Y(g.y) + 6} textAnchor="middle" fontSize={20} fontWeight={700} fill="#1D4ED8">{g.res.length}</text>
            <text x={X(g.x)} y={Y(g.y) + 32} textAnchor="middle" fontSize={20} fill="#1D4ED8">{g.label}</text>
            <text x={X(g.x)} y={Y(g.y) + 52} textAnchor="middle" fontSize={20} fill="#475467">{g.res.map((r) => r.id).join(" ")}</text>
          </g>
        ))}
        {households.map((h) => {
          const row = byHid.get(h.id);
          return (
            <g key={h.id} data-hid={h.id}>
              <Marker x={X(h.x_km)} y={Y(h.y_km)} kind={family(h.observed.device_id)} color={restored ? COLORS.ok : probColor(row)} size={size} />
              <text x={X(h.x_km) + size + 3} y={Y(h.y_km) + 4} fontSize={20} fontWeight={700} fill="#101828">{h.alias}</text>
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#344054]">
        <li>{OPS_B.legendDevice.vent}</li><li>{OPS_B.legendDevice.o2}</li><li>{OPS_B.legendDevice.other}</li>
        <li><span style={{ color: COLORS.stop }}>■</span> {OPS_B.legendProb.high}</li>
        <li><span style={{ color: AMBER }}>■</span> {OPS_B.legendProb.mid}</li>
        <li><span style={{ color: COLORS.ok }}>■</span> {OPS_B.legendProb.low}</li>
        <li><span style={{ color: COLORS.muted }}>■</span> {OPS_B.legendProb.unknown}</li>
        <li>{OPS_B.legendLines.proposed}</li><li>{OPS_B.legendLines.approved}</li>
      </ul>
    </div>
  );
}
