// /lab 2. 사건 표시 그림(SVG): 점 = 정확 관측, 막대 = 구간(복구 시각 없음), 화살표 = 진행 중(오른쪽 중도절단) + 선택 모형 곡선 S(t).
// 값은 l2_results.json의 events_plot·curve 그대로. 12시간 넘는 값은 오른쪽 끝에 붙여 화살표로 표시.
import type { L2Results } from "@/lib/types";
import { LAB_PAGE, fill } from "@/lib/copy";

const MAX_H = 12;

export default function EventsPlot({ l2 }: { l2: L2Results }) {
  const order = { exact: 0, interval: 1, right: 2 } as Record<string, number>;
  const ev = l2.events_plot
    .filter((e) => e.outcome in order)
    .sort((a, b) => order[a.outcome] - order[b.outcome] || (a.t_h ?? a.lower_h ?? 0) - (b.t_h ?? b.lower_h ?? 0));
  const W = 760, L = 44, R = 16, T = 12, rowH = 2.6;
  const H = T + ev.length * rowH + 34;
  const plotW = W - L - R;
  const x = (h: number) => L + (Math.min(h, MAX_H) / MAX_H) * plotW;
  const yRow = (i: number) => T + i * rowH + rowH / 2;
  const yS = (s: number) => T + (1 - s) * (ev.length * rowH);
  const curve = l2.curve.filter((c) => c.t_h <= MAX_H).map((c) => `${x(c.t_h)},${yS(c.s)}`).join(" ");
  return (
    <figure className="m-0 flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[760px]" role="img" aria-label={LAB_PAGE.plotTitle}>
        <rect x={L} y={T} width={plotW} height={ev.length * rowH} fill="#F9FAFB" />
        {Array.from({ length: MAX_H / 2 + 1 }, (_, i) => i * 2).map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={T} y2={T + ev.length * rowH} stroke="#EAECF0" />
            <text x={x(h)} y={H - 18} fontSize="11" textAnchor="middle" fill="#475467">{fill(LAB_PAGE.plotHour, { h })}</text>
          </g>
        ))}
        <text x={L + plotW / 2} y={H - 4} fontSize="11" textAnchor="middle" fill="#475467">{LAB_PAGE.plotAxis}</text>
        {ev.map((e, i) => {
          const y = yRow(i);
          if (e.outcome === "exact" && e.t_h != null) return <circle key={e.event_id} cx={x(e.t_h)} cy={y} r={2.6} fill="#101828" />;
          if (e.outcome === "interval" && e.lower_h != null && e.upper_h != null)
            return <line key={e.event_id} x1={x(e.lower_h)} x2={x(e.upper_h)} y1={y} y2={y} stroke="#1D4ED8" strokeWidth={2.6} />;
          if (e.outcome === "right" && e.lower_h != null)
            return (
              <g key={e.event_id}>
                <line x1={x(0)} x2={x(e.lower_h)} y1={y} y2={y} stroke="#98A2B3" strokeWidth={1} />
                <path d={`M${x(e.lower_h)},${y - 1.8} L${x(e.lower_h) + 4},${y} L${x(e.lower_h)},${y + 1.8} Z`} fill="#667085" />
              </g>
            );
          return null;
        })}
        <polyline points={curve} fill="none" stroke="#D92D20" strokeWidth={2} />
      </svg>
      <figcaption className="text-sm text-[#475467]">{LAB_PAGE.plotTitle}</figcaption>
    </figure>
  );
}
