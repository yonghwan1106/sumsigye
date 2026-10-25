"use client";
// 두 막대 경주 (구현명세 §8-6) — /ops·/·/race·/poster 공용.
// 값은 allocate·baseline("R1") 결과에서만 받는다(이 컴포넌트는 계산하지 않고 그리기만 한다).
// 빨간 구간 = [S_low, min(도착, R80)], 그 길이 m = max(0, min(도착, R80) − S_low). 전원 없음이면 도착 = ∞.
import { useEffect, useState } from "react";
import { COLORS, RACE, fill } from "@/lib/copy";
import { fmtMin } from "@/components/_fmt";

export interface RaceProps {
  safe_min: number;
  r80_min: number;
  arrival_rule_min: number | null;
  arrival_ours_min: number | null;
  alias: string;
  source: "scenario" | "eval";
  eval_seed?: number;
  /** "both" = 단순 규칙과 숨시계 나란히, "ours" = 숨시계 쪽만(포스터) */
  side?: "both" | "ours";
  /** 첫 상태(빈 막대 두 개 + 「어느 쪽이 먼저 끝날까?」) */
  empty?: boolean;
  /** 400개 띠 문장(이미 채운 문자열 또는 null이면 띠 없음) */
  band?: string | null;
  size?: "md" | "lg";
  animate?: boolean;
  /** 제목 숨기기(바깥에서 제목을 따로 둘 때) */
  hideTitle?: boolean;
}

function redMinutes(safe: number, r80: number, arrival: number | null): number {
  const end = arrival === null ? r80 : Math.min(arrival, r80);
  return Math.max(0, end - safe);
}

function Lane(props: {
  heading: string;
  safe: number;
  r80: number;
  arrival: number | null;
  scale: number;
  empty: boolean;
  play: boolean;
  big: boolean;
  testId: string;
  redTestId?: string;
}) {
  const { safe, r80, arrival, scale, empty, play, big } = props;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const red = redMinutes(safe, r80, arrival);
  const redStart = safe;
  const redEnd = arrival === null ? r80 : Math.min(arrival, r80);
  const okBefore = arrival !== null && arrival <= safe ? safe - arrival : null;
  const t = play ? "width 1.8s ease-out, left 1.8s ease-out, opacity 0.6s ease-in 1.6s" : "none";
  const show = play && !empty;
  const barH = big ? "h-12" : "h-8";
  const label = big ? "text-2xl" : "text-sm";
  const result = big ? "text-4xl" : "text-xl";

  return (
    <div data-testid={props.testId} className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-[#D0D5DD] bg-white p-4">
      <p className={`${big ? "text-3xl" : "text-base"} font-bold text-[#101828]`}>{props.heading}</p>

      <div className="flex flex-col gap-1">
        <p className={`${label} text-[#344054]`}>{RACE.barSafe}</p>
        <div className={`relative ${barH} w-full rounded bg-[#F2F4F7] ${big ? "mb-11" : "mb-8"}`}>
          <div className="absolute inset-y-0 left-0 rounded bg-[#1D4ED8]" style={{ width: show ? pct(safe) : "0%", transition: t }} />
          {red > 0 && (
            <div
              className="absolute inset-y-0 rounded"
              style={{
                left: pct(redStart),
                width: show ? pct(redEnd - redStart) : "0%",
                background: COLORS.stop,
                opacity: show ? 1 : 0,
                transition: t,
              }}
            />
          )}
          {arrival !== null && !empty && (
            <div className="absolute -top-2 -bottom-2 w-1 bg-[#101828]" style={{ left: pct(arrival), opacity: show ? 1 : 0, transition: t }}>
              <span className={`absolute top-full ${big ? "mt-1 text-xl" : "mt-0.5 text-sm"} ${arrival / scale < 0.1 ? "translate-x-0" : arrival / scale > 0.9 ? "-translate-x-full" : "-translate-x-1/2"} whitespace-nowrap rounded bg-[#101828] px-1.5 py-0.5 font-semibold text-white`}>
                {RACE.marker}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className={`${label} text-[#344054]`}>{RACE.barRestore}</p>
        <div className={`relative ${barH} w-full rounded bg-[#F2F4F7]`}>
          <div className="absolute inset-y-0 left-0 rounded bg-[#667085]" style={{ width: show ? pct(r80) : "0%", transition: t }} />
        </div>
      </div>

      <div className={`min-h-[2.5em] ${result} font-bold`} style={{ opacity: show ? 1 : 0, transition: play ? "opacity 0.5s ease-in 1.9s" : "none" }}>
        {empty ? null : arrival === null ? (
          <p data-testid={props.redTestId} style={{ color: COLORS.stop }}>
            {RACE.resultNone} · {fill(RACE.resultStop, { m: fmtMin(red) })}
          </p>
        ) : okBefore !== null ? (
          <p style={{ color: COLORS.ok }}>{fill(RACE.resultOk, { k: fmtMin(okBefore) })}</p>
        ) : (
          <p data-testid={props.redTestId} style={{ color: red > 0 ? COLORS.stop : COLORS.muted }}>
            {fill(RACE.resultStop, { m: fmtMin(red) })}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Race(props: RaceProps) {
  const side = props.side ?? "both";
  const empty = props.empty ?? false;
  const big = props.size === "lg";
  const animate = props.animate ?? true;
  const [play, setPlay] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const id = window.setTimeout(() => setPlay(true), 150);
    return () => window.clearTimeout(id);
  }, [animate]);

  const values = [props.safe_min, props.r80_min, props.arrival_rule_min ?? 0, props.arrival_ours_min ?? 0];
  const scale = Math.max(30, ...values.filter((v) => Number.isFinite(v))) * 1.1;
  const foot = fill(RACE.footnote, { alias: props.alias }) +
    (props.source === "eval" ? ` · ${fill(RACE.footnoteEval, { seed: props.eval_seed ?? "" })}` : "");

  return (
    <section data-testid="race-hero" className="flex w-full flex-col gap-4">
      {!props.hideTitle && (
        <h2 className={`${big ? "text-5xl" : "text-2xl"} font-bold text-[#101828]`}>{empty ? RACE.empty : RACE.title}</h2>
      )}
      {!props.hideTitle && empty && <p className={`${big ? "text-2xl" : "text-base"} text-[#475467]`}>{RACE.title}</p>}
      <div className={`flex w-full ${side === "both" ? "flex-col gap-4 md:flex-row" : "flex-col"}`}>
        {side === "both" && (
          <Lane
            heading={RACE.left}
            safe={props.safe_min}
            r80={props.r80_min}
            arrival={props.arrival_rule_min}
            scale={scale}
            empty={empty}
            play={play}
            big={big}
            testId="race-rule"
            redTestId="race-red-min"
          />
        )}
        <Lane
          heading={RACE.right}
          safe={props.safe_min}
          r80={props.r80_min}
          arrival={props.arrival_ours_min}
          scale={scale}
          empty={empty}
          play={play}
          big={big}
          testId="race-ours"
        />
      </div>
      {props.band && (
        <p data-testid="band-400" className={`${big ? "text-2xl" : "text-base"} font-semibold text-[#101828]`}>
          {props.band}
        </p>
      )}
      <p className={`${big ? "text-lg" : "text-sm"} text-[#667085]`}>{foot}</p>
    </section>
  );
}
