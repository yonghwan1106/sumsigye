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

// 글자 상자 겹침 피하기(배치도 이름표) — 한글은 글자 크기만큼, 그 밖은 0.62배로 너비를 어림한다.
type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** 겹치지 않는 첫 후보, 없으면 겹친 넓이가 가장 작은 후보(화면 밖 후보는 큰 벌점) */
function choose<C>(cands: C[], boxOf: (c: C) => Box, taken: Box[], W: number, H: number): C {
  let best = cands[0], bestCost = Infinity;
  for (const c of cands) {
    const b = boxOf(c);
    const out = b.x0 < 0 || b.x1 > W || b.y0 < 0 || b.y1 > H;
    const cost = (out ? 1e6 : 0) + taken.reduce((acc, t) => acc + overlapArea(t, b), 0);
    if (cost === 0) return c;
    if (cost < bestCost) { best = c; bestCost = cost; }
  }
  return best;
}
function textW(t: string, fs: number): number {
  let w = 0;
  for (const ch of t) w += /[ㄱ-힝]/.test(ch) ? fs : fs * 0.62;
  return w;
}
type Placed = { x: number; y: number; anchor: "start" | "middle" | "end" };
/** 집 이름표 자리: 오른쪽 → 왼쪽 → 위 → 아래 → 오른쪽 위·아래 순으로, 앞서 놓인 상자와 겹치지 않는 첫 자리 */
function placeLabels(pts: { id: string; x: number; y: number; text: string }[], size: number, fs: number, W: number, H: number, fixed: Box[]): Map<string, Placed> {
  const taken: Box[] = [...fixed];
  for (const p of pts) taken.push({ x0: p.x - size - 1, y0: p.y - size * 1.2 - 1, x1: p.x + size + 1, y1: p.y + size + 1 });
  const out = new Map<string, Placed>();
  const order = [...pts].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of order) {
    const w = textW(p.text, fs), asc = fs * 0.78, desc = fs * 0.22, g = 3;
    const cands: Placed[] = [
      { x: p.x + size + g, y: p.y + asc / 2 - 1, anchor: "start" },
      { x: p.x - size - g, y: p.y + asc / 2 - 1, anchor: "end" },
      { x: p.x, y: p.y - size * 1.2 - g - desc, anchor: "middle" },
      { x: p.x, y: p.y + size + g + asc, anchor: "middle" },
      { x: p.x + size + g, y: p.y - size - desc, anchor: "start" },
      { x: p.x + size + g, y: p.y + size + asc, anchor: "start" },
      { x: p.x - size - g, y: p.y - size - desc, anchor: "end" },
      { x: p.x - size - g, y: p.y + size + asc, anchor: "end" },
    ];
    const boxOf = (c: Placed): Box => {
      const x0 = c.anchor === "start" ? c.x : c.anchor === "end" ? c.x - w : c.x - w / 2;
      return { x0, y0: c.y - asc, x1: x0 + w, y1: c.y + desc };
    };
    const pick = choose(cands, boxOf, taken, W, H);
    taken.push(boxOf(pick));
    out.set(p.id, pick);
  }
  return out;
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
    // 가구가 많으면 이름표를 줄인다: 「(가상 위치)」는 제목 「가상 배치도(실제 위치 아님)」과 겹치는 말이라 뺀다
    const label = many ? r.base_label.replace(/\(가상[^)]*\)/, "").trim() : r.base_label;
    const g = bases.get(k) ?? { x: r.x_km, y: r.y_km, label, res: [] };
    g.res.push(r); bases.set(k, g);
  }
  const resById = new Map(b.resources.map((r) => [r.id, r] as const));
  const FS = 20;
  const fixedBoxes: Box[] = [];
  for (const g of geos) {
    const w = textW(g.name, 22);
    fixedBoxes.push({ x0: X(g.cx) - w / 2, y0: Y(g.cy - g.r) + 18 - 18, x1: X(g.cx) + w / 2, y1: Y(g.cy - g.r) + 18 + 5 });
  }
  // 거점 이름표(2줄): 아래 → 위 → 오른쪽 → 왼쪽 중 다른 거점 이름표와 겹치지 않는 첫 자리
  const baseList = [...bases.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const g of baseList) fixedBoxes.push({ x0: X(g.x) - 14, y0: Y(g.y) - 14, x1: X(g.x) + 14, y1: Y(g.y) + 14 });
  // 집 표지와 그 오른쪽 기본 이름표 자리도 피한다(거점 이름표가 집을 덮지 않게)
  const hhBoxes: Box[] = households.map((h) => ({ x0: X(h.x_km) - size - 2, y0: Y(h.y_km) - size * 1.2 - 2, x1: X(h.x_km) + size + 2 + textW(h.alias, FS) * 0.5, y1: Y(h.y_km) + size + 2 }));
  const baseObstacles = (): Box[] => [...fixedBoxes, ...hhBoxes];
  const baseAt = new Map<typeof baseList[number], { x: number; y1: number; y2: number; anchor: "start" | "middle" | "end" }>();
  for (const g of baseList) {
    const ids = g.res.map((r) => r.id).join(" ");
    const w = Math.max(textW(g.label, FS), textW(ids, FS));
    const bx = X(g.x), by = Y(g.y);
    const cands = [
      { x: bx, y1: by + 32, y2: by + 52, anchor: "middle" as const },
      { x: bx, y1: by - 40, y2: by - 20, anchor: "middle" as const },
      { x: bx + 17, y1: by - 2, y2: by + 18, anchor: "start" as const },
      { x: bx - 17, y1: by - 2, y2: by + 18, anchor: "end" as const },
      { x: bx - 14, y1: by + 32, y2: by + 52, anchor: "end" as const },
      { x: bx + 14, y1: by + 32, y2: by + 52, anchor: "start" as const },
      { x: bx - 14, y1: by - 40, y2: by - 20, anchor: "end" as const },
      { x: bx + 14, y1: by - 40, y2: by - 20, anchor: "start" as const },
      { x: bx, y1: by + 74, y2: by + 94, anchor: "middle" as const },
      { x: bx, y1: by - 62, y2: by - 42, anchor: "middle" as const },
    ];
    const boxOf = (c: (typeof cands)[number]): Box => {
      const x0 = c.anchor === "start" ? c.x : c.anchor === "end" ? c.x - w : c.x - w / 2;
      return { x0, y0: c.y1 - 16, x1: x0 + w, y1: c.y2 + 5 };
    };
    const pick = choose(cands, boxOf, baseObstacles(), W, H);
    fixedBoxes.push(boxOf(pick));
    baseAt.set(g, pick);
  }
  const labelAt = placeLabels(households.map((h) => ({ id: h.id, x: X(h.x_km), y: Y(h.y_km), text: h.alias })), size, FS, W, H, fixedBoxes);

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
        {baseList.map((g) => (
          <g key={`b-${g.label}-${g.x}-${g.y}`}>
            <rect x={X(g.x) - 13} y={Y(g.y) - 13} width={26} height={26} rx={4} fill="#fff" stroke="#1D4ED8" strokeWidth={2} />
            <text x={X(g.x)} y={Y(g.y) + 6} textAnchor="middle" fontSize={20} fontWeight={700} fill="#1D4ED8">{g.res.length}</text>
            {(() => {
              const l = baseAt.get(g) ?? { x: X(g.x), y1: Y(g.y) + 32, y2: Y(g.y) + 52, anchor: "middle" as const };
              return (
                <>
                  <text x={l.x} y={l.y1} textAnchor={l.anchor} fontSize={20} fill="#1D4ED8" stroke="#FCFCFD" strokeWidth={4} paintOrder="stroke">{g.label}</text>
                  <text x={l.x} y={l.y2} textAnchor={l.anchor} fontSize={20} fill="#475467" stroke="#FCFCFD" strokeWidth={4} paintOrder="stroke">{g.res.map((r) => r.id).join(" ")}</text>
                </>
              );
            })()}
          </g>
        ))}
        {households.map((h) => {
          const row = byHid.get(h.id);
          return (
            <g key={h.id} data-hid={h.id}>
              <Marker x={X(h.x_km)} y={Y(h.y_km)} kind={family(h.observed.device_id)} color={restored ? COLORS.ok : probColor(row)} size={size} />
              {(() => {
                const l = labelAt.get(h.id) ?? { x: X(h.x_km) + size + 3, y: Y(h.y_km) + 4, anchor: "start" as const };
                return <text x={l.x} y={l.y} textAnchor={l.anchor} fontSize={FS} fontWeight={700} fill="#101828" stroke="#FCFCFD" strokeWidth={4} paintOrder="stroke">{h.alias}</text>;
              })()}
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
