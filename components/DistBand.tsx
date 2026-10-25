// 복구시간 분포 띠 (구현명세 §8-2 「복구시간 분포 띠」) — /ops·/lab 공용.
// 분위수(남은 복구시간, 분)는 호출하는 쪽이 lib/engine/survival.ts로 계산해 넘긴다. 이 컴포넌트는 그리기만 한다.
import { COLORS, COMMON, OPS, fill } from "@/lib/copy";
import { fmtClockPlus, fmtMin } from "@/components/_fmt";

export interface DistBandProps {
  /** 판단 시각 기준 남은 복구시간 분위수(분) */
  p50_min: number;
  p80_min: number;
  p90_min: number;
  /** 판단 시각(있으면 눈금에 시각도 적는다) */
  now?: string;
  /** 기관 예고 참고선: 판단 시각에서 몇 분 뒤인지 + 표시 시각 */
  eta?: { clock: string; at_min: number } | null;
  /** 「예고 시각을 넘길 확률」 표시 문자열(이미 fmtProb로 만든 값). base unknown이면 p1·p2 둘 다 */
  etaProb?: { p: string } | { p1: string; p2: string } | null;
  /** 사건 수(캡션). null이면 캡션에 「측정 중」 */
  counts?: { n: number; n_exact: number; n_int: number; n_cens: number } | null;
  /** 칸 표본 적음 → 보수값(P90) 배지 */
  small?: boolean;
  /** 임시 모형이면 「측정 중(임시 값)」 */
  provisional?: boolean;
  compact?: boolean;
}

const BAND = "#1D4ED8";

export default function DistBand(props: DistBandProps) {
  const { p50_min: p50, p80_min: p80, p90_min: p90 } = props;
  const etaAt = props.eta ? props.eta.at_min : 0;
  const maxMin = Math.max(60, p90 * 1.15, etaAt * 1.1);
  const W = 600;
  const H = 46;
  const x = (m: number) => Math.max(0, Math.min(W, (m / maxMin) * W));
  const label = (m: number) => (props.now ? `${fmtClockPlus(props.now, m)}(${fmtMin(m)} 뒤)` : fmtMin(m));

  return (
    <div data-testid="dist-band" className="flex flex-col gap-2 rounded-lg border border-[#D0D5DD] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {props.provisional && (
          <span className="rounded bg-[#F2F4F7] px-2 py-0.5 text-sm font-semibold text-[#475467]">{COMMON.measuringProvisional}</span>
        )}
        {props.small && (
          <span className="rounded px-2 py-0.5 text-sm font-semibold" style={{ color: COLORS.changedText, background: COLORS.changedBg }}>
            {OPS.smallCellBadge}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={OPS.distCaption}>
        <rect x={0} y={12} width={W} height={20} rx={4} fill="#F2F4F7" />
        <rect x={0} y={12} width={x(p90)} height={20} rx={4} fill={BAND} opacity={0.16} />
        <rect x={0} y={12} width={x(p80)} height={20} rx={4} fill={BAND} opacity={0.3} />
        <rect x={0} y={12} width={x(p50)} height={20} rx={4} fill={BAND} opacity={0.55} />
        {[p50, p80, p90].map((m, i) => (
          <line key={i} x1={x(m)} x2={x(m)} y1={6} y2={38} stroke="#101828" strokeWidth={i === 1 ? 2.5 : 1.5} />
        ))}
        {props.eta && (
          <g>
            <line x1={x(etaAt)} x2={x(etaAt)} y1={2} y2={44} stroke={COLORS.changedText} strokeWidth={2} strokeDasharray="4 3" />
          </g>
        )}
      </svg>
      <ul className={`flex flex-wrap gap-x-4 gap-y-1 ${props.compact ? "text-sm" : "text-[15px]"} text-[#101828]`}>
        <li>
          <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: BAND, opacity: 0.55 }} />
          {fill(OPS.distTicks.p50, { P50: label(p50) })}
        </li>
        <li className="font-semibold">
          <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: BAND, opacity: 0.3 }} />
          {fill(OPS.distTicks.p80, { P80: label(p80) })}
        </li>
        <li>
          <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: BAND, opacity: 0.16 }} />
          {fill(OPS.distTicks.p90, { P90: label(p90) })}
        </li>
        {props.eta && (
          <li style={{ color: COLORS.changedText }}>
            <span className="mr-1 inline-block h-0 w-4 border-t-2 border-dashed align-middle" style={{ borderColor: COLORS.changedText }} />
            {fill(OPS.etaLine, { "HH:MM": props.eta.clock })}
          </li>
        )}
      </ul>
      {props.etaProb && (
        <p data-testid="eta-prob" className="text-sm text-[#344054]">
          {"p" in props.etaProb
            ? fill(OPS.etaProb, { p: props.etaProb.p })
            : fill(OPS.etaProb, { p: fill(OPS.etaProbUnknownBase, { p1: props.etaProb.p1, p2: props.etaProb.p2 }) })}
        </p>
      )}
      <p className="text-sm text-[#475467]">
        {props.counts
          ? fill(OPS.distCaption, {
              n: props.counts.n,
              n_exact: props.counts.n_exact,
              n_int: props.counts.n_int,
              n_cens: props.counts.n_cens,
            })
          : OPS.distCaptionMeasuring}
      </p>
    </div>
  );
}
