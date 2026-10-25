"use client";
// 운영자 화면 /ops(구현명세 §8-2): 위 띠 · 3단(사건 340px · 배치도 가변 · 우선순위 440px) · 아래 비교.
// 상태는 lib/state/store(localStorage + BroadcastChannel) — /home 입력이 다른 탭에서도 즉시 반영된다.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import EvalBand from "@/components/EvalBand";
import Expandable from "@/components/Expandable";
import Race from "@/components/Race";
import { raceBand } from "@/components/evalText";
import { OPS, HOME, fill } from "@/lib/copy";
import { fmtClock, fmtMin } from "@/lib/format";
import { toKstIso } from "@/lib/engine/time";
import { redMinutes } from "@/lib/engine/showcase";
import { load, reset, save, subscribe } from "@/lib/state/store";
import type { ScenarioBundle, ScenarioState } from "@/lib/types";
import { OPS_B } from "./copyB";
import EventPanel from "./EventPanel";
import MapPanel from "./MapPanel";
import PriorityPanel from "./PriorityPanel";
import { arrivedSms, compute, type SmsL1 } from "./scenario";
import { emptyStateFor, timeRange } from "./stateInit";

export default function OpsClient(props: { bundle: ScenarioBundle; smsL1: SmsL1; stub: boolean }) {
  const { bundle: b, smsL1 } = props;
  const [state, setState] = useState<ScenarioState>(() => emptyStateFor(b));

  useEffect(() => {
    const s0 = load(b.id);
    if (s0) setState(s0);
    return subscribe(b.id, (s) => setState(s ?? emptyStateFor(b)));
  }, [b]);

  const ref = useRef(state);
  ref.current = state;
  const update = (fn: (s: ScenarioState) => ScenarioState) => {
    const next = fn(ref.current);
    // 지나간 문자는 본 것으로 기록
    const seen = arrivedSms(b, next.now).map((e) => e.sn);
    const saved = save(b.id, { ...next, seen_sms: Array.from(new Set([...next.seen_sms, ...seen])) });
    ref.current = saved;
    setState(saved);
  };

  const comp = useMemo(() => compute(b, state, smsL1), [b, state, smsL1]);
  const range = timeRange(b);
  const nowMs = Date.parse(state.now);
  const elapsed = Math.max(0, (nowMs - Date.parse(b.outage_start)) / 60000);
  const nextEvent = b.timeline.map((e) => e.at).filter((t) => Date.parse(t) > nowMs).sort((x, y) => Date.parse(x) - Date.parse(y))[0];

  const setNow = (t: string) => update((s) => ({ ...s, now: t }));
  const onReset = () => {
    if (typeof window !== "undefined" && !window.confirm(HOME.resetConfirm)) return;
    reset(b.id);
    setState(emptyStateFor(b));
  };

  // 비교: 쇼케이스 가구(엔진이 고른 가구)
  const showHid = b.showcase.hid;
  const oRow = showHid ? comp.plan.rows.find((r) => r.hid === showHid) : undefined;
  const rRow = showHid ? comp.r1.rows.find((r) => r.hid === showHid) : undefined;
  const showH = showHid ? comp.households.find((h) => h.id === showHid) : undefined;
  const stopCount = (rows: typeof comp.plan.rows) => rows.filter((r) => redMinutes(r, comp.r80) > 0).length;

  return (
    <main className="flex w-full flex-col gap-2 bg-[#F9FAFB] px-3 py-2 text-[#101828]">
      <EvalBand compact />
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#EAECF0] bg-white px-3 py-2">
        <span data-testid="ops-now" className="whitespace-nowrap text-sm font-bold">
          {fill(OPS.slider, { "HH:MM": fmtClock(state.now), 경과: fmtMin(elapsed) })}
        </span>
        <input data-testid="ops-slider" type="range" min={range.min} max={range.max} step={60000} value={Math.min(range.max, Math.max(range.min, nowMs))}
          onChange={(e) => setNow(toKstIso(Number(e.target.value)))} className="min-w-[200px] flex-1" aria-label={OPS.slider} />
        <button type="button" data-testid="btn-next-event" disabled={!nextEvent} onClick={() => nextEvent && setNow(nextEvent)}
          className="rounded-md bg-[#1D4ED8] px-3 py-1 text-sm font-semibold text-white disabled:opacity-40">{OPS.nextEvent}</button>
        <button type="button" data-testid="btn-reset" onClick={onReset} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-1 text-sm font-semibold">{OPS.reset}</button>
        {props.stub && <span className="rounded bg-[#F2F4F7] px-2 py-0.5 text-xs text-[#475467]">{OPS_B.stubBadge}</span>}
        <span className="text-xs text-[#475467]">{b.title}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[340px_minmax(0,1fr)_440px]">
        <Expandable testId="btn-expand-event" panelTestId="panel-event" title={OPS.eventHead} className="rounded-lg border border-[#EAECF0] bg-white lg:h-[calc(100vh-150px)] lg:overflow-y-auto">
          <EventPanel bundle={b} state={state} smsL1={smsL1} comp={comp} />
        </Expandable>
        <Expandable testId="btn-expand-map" panelTestId="panel-map" title={OPS.mapTitle} className="rounded-lg border border-[#EAECF0] bg-white lg:h-[calc(100vh-150px)] lg:overflow-hidden">
          <MapPanel bundle={b} state={state} plan={comp.plan} households={comp.households} />
          <p className="px-3 pb-2 text-xs text-[#475467]">
            {comp.households.map((h) => (
              <Link key={h.id} href={`/home/${h.id}?s=${b.id}&frame=1`} className="mr-2 underline" target="_blank">{OPS_B.homeLink} {h.alias}</Link>
            ))}
          </p>
        </Expandable>
        <Expandable testId="btn-expand-priority" panelTestId="panel-priority" title={OPS.priorityTitle} className="rounded-lg border border-[#EAECF0] bg-white lg:h-[calc(100vh-150px)] lg:overflow-y-auto">
          <PriorityPanel bundle={b} state={state} plan={comp.plan} households={comp.households} changed={comp.changed} update={update} />
        </Expandable>
      </div>

      <Expandable testId="btn-expand-compare" panelTestId="panel-compare" title={OPS.compareTitle} className="rounded-lg border border-[#EAECF0] bg-white">
        <div className="flex flex-col gap-3 p-3">
          <h2 className="pr-24 text-base font-bold">{OPS.compareTitle}</h2>
          <p className="text-lg font-bold">{fill(OPS.compareBig, { r: stopCount(comp.r1.rows), o: stopCount(comp.plan.rows) })}</p>
          {oRow && rRow && showH ? (
            <Race safe_min={oRow.safe.s_low_engine_min} r80_min={comp.r80} arrival_rule_min={rRow.arrival_min} arrival_ours_min={oRow.arrival_min}
              alias={showH.alias} source={b.showcase.source} eval_seed={b.showcase.eval_seed} band={raceBand()} />
          ) : (
            <p data-testid="band-400" className="text-base font-semibold">{raceBand()}</p>
          )}
        </div>
      </Expandable>
    </main>
  );
}
