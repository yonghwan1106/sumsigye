"use client";
// ③ 보호자 화면 /home/[hid]?s=sc1[&frame=1] (구현명세 §8-3). 390px 폭 기준, 글자 16px 이상.
// 입력은 브라우저 상태(lib/state/store)에만 저장 — 같은 브라우저의 /ops 탭에 BroadcastChannel로 바로 반영된다. 개인정보 입력칸 없음.
import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, COMMON, GUARDIAN, HOME, fill } from "@/lib/copy";
import { OPS_B } from "@/components/ops/copyB";
import { fmtClockPlus, fmtMin, parseHm } from "@/lib/format";
import { load, reset, save, subscribe } from "@/lib/state/store";
import type { DeviceId, HouseholdObserved, ScenarioBundle, ScenarioState } from "@/lib/types";
import { compute, SPECS, type SmsL1 } from "@/components/ops/scenario";
import { emptyStateFor } from "@/components/ops/stateInit";
import { resourceText, safeText } from "@/components/ops/display";

const DEVICE_IDS: (DeviceId | "unknown")[] = ["VENT_A", "VENT_B", "O2_STAT", "O2_PORT", "SUCTION", "COUGH", "unknown"];

/** 모델명 입력: 소문자·공백 정리 후 별칭 포함 검사(구현명세 §6-7). */
export function matchModel(text: string): DeviceId | null {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const d of SPECS.devices) for (const a of d.aliases) if (t.includes(a.toLowerCase()) || (a.length >= 4 && a.toLowerCase().includes(t) && t.length >= 4)) return d.id;
  return null;
}

/** 고정 체크리스트 5항목(구현명세 §8-3). LLM 응답이 없을 때 원문 그대로. */
export function checklist(device: DeviceId | null): string[] {
  const c = GUARDIAN.checklist;
  const o2 = device === "O2_STAT" || device === "O2_PORT";
  return [device === "VENT_A" ? c.c1VentA : c.c1, c.c2, o2 ? c.c3O2 : c.c3, c.c4, c.c5];
}

export default function HomeClient(props: { bundle: ScenarioBundle; smsL1: SmsL1; hid: string; frame: boolean }) {
  const { bundle: b, smsL1, hid, frame } = props;
  const [state, setState] = useState<ScenarioState>(() => emptyStateFor(b));
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => {
    const s0 = load(b.id);
    if (s0) setState(s0);
    return subscribe(b.id, (s) => setState(s ?? emptyStateFor(b)));
  }, [b]);
  const update = (fn: (s: ScenarioState) => ScenarioState) => {
    const saved = save(b.id, fn(ref.current));
    ref.current = saved;
    setState(saved);
  };
  const setObs = (o: Partial<HouseholdObserved>) => update((s) => ({ ...s, overrides: { ...s.overrides, [hid]: { ...(s.overrides[hid] ?? {}), ...o } } }));

  const comp = useMemo(() => compute(b, state, smsL1), [b, state, smsL1]);
  const h = comp.households.find((x) => x.id === hid);
  const row = comp.plan.rows.find((r) => r.hid === hid);

  const [model, setModel] = useState("");
  const [hm, setHm] = useState("");
  const [pct, setPct] = useState("");
  const [inputErr, setInputErr] = useState(false);
  const [guide, setGuide] = useState<string[] | null>(null);

  const dev = h?.observed.device_id ?? null;
  const spec = dev ? SPECS.devices.find((d) => d.id === dev) ?? null : null;
  const reported = state.reports.some((r) => r.hid === hid) || b.timeline.some((e) => e.type === "report" && e.hid === hid && Date.parse(e.at) <= Date.parse(state.now));
  const approval = state.approvals.find((a) => a.hid === hid);
  const status: "pending" | "approved" | "none" = approval ? "approved" : row && row.rid ? "pending" : "none";
  const res = approval ? b.resources.find((r) => r.id === approval.rid) : null;
  const arrivalMin = approval && row && row.arrival_min != null ? row.arrival_min : null;
  const safeStr = row ? safeText(row.safe) : "";

  // 행동지침(지금 할 일): /api/guide → 실패하면 체크리스트 원문
  useEffect(() => {
    let alive = true;
    const body = { device_id: dev, safe: safeStr, status, arrival: arrivalMin != null ? fmtMin(arrivalMin) : null };
    fetch("/api/guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .then((j) => { if (alive) setGuide(Array.isArray(j?.lines) && j.lines.length === 5 ? (j.lines as string[]) : null); })
      .catch(() => { if (alive) setGuide(null); });
    return () => { alive = false; };
  }, [dev, safeStr, status, arrivalMin]);

  if (!h || !row) return <main className="p-4 text-base">{fill(GUARDIAN.head, { alias: hid })}</main>;

  const selectDevice = (v: DeviceId | "unknown") => {
    if (v === "unknown") { setObs({ device_id: null, device_match: "unknown" }); return; }
    const sp = SPECS.devices.find((d) => d.id === v)!;
    const ext = h.observed.ext;
    // 기기를 바꾸면 검증 외장배터리는 그 계열 목록에서 다시 찾는다
    let nextExt = ext;
    if (ext && ext.verified) {
      const es = SPECS.ext.find((e) => e.family === sp.family);
      nextExt = es ? { ...ext, spec_id: es.id, nominal_min: es.h_worst_min } : { spec_id: null, verified: false, charge: "unknown", nominal_min: null };
    }
    setObs({ device_id: sp.id, device_match: sp.source === "assumed" ? "assumed" : "manual", ext: nextExt });
  };
  const extKind: "none" | "verified" | "other" = !h.observed.ext ? "none" : h.observed.ext.verified ? "verified" : "other";
  const extSpec = spec ? SPECS.ext.find((e) => e.family === spec.family) ?? null : null;
  const setExt = (k: "none" | "verified" | "other") => {
    if (k === "none") setObs({ ext: null });
    else if (k === "verified" && extSpec) setObs({ ext: { spec_id: extSpec.id, verified: true, charge: h.observed.ext?.charge ?? "unknown", nominal_min: extSpec.h_worst_min } });
    else setObs({ ext: { spec_id: null, verified: false, charge: "unknown", nominal_min: null } });
  };
  const submit = () => {
    const m = hm.trim() ? parseHm(hm) : null;
    const p = pct.trim() ? Number(pct) : null;
    if (m != null) { setObs({ screen: { kind: "minutes", value: m, at: ref.current.now } }); setInputErr(false); return; }
    if (p != null && Number.isFinite(p) && p >= 0 && p <= 100) { setObs({ screen: { kind: "percent", value: p, at: ref.current.now } }); setInputErr(false); return; }
    setInputErr(true);
  };

  const matchText = !spec ? GUARDIAN.match.unknown
    : spec.source === "assumed" ? GUARDIAN.match.assumed
    : fill(GUARDIAN.match.manual, { h: fmtMin(spec.h_worst_min) });
  const lines = guide ?? checklist(dev);

  const body = (
    <div className="flex flex-col gap-4 p-4 text-base text-[#101828]">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{fill(GUARDIAN.head, { alias: h.alias })}</h1>
        <p className="rounded bg-[#F2F4F7] px-2 py-1 text-sm text-[#475467]" style={{ fontSize: 14 }}>{COMMON.syntheticBand}</p>
      </header>

      <section data-testid="home-register" className="flex flex-col gap-2 rounded-xl border border-[#D0D5DD] p-3">
        <h2 className="text-lg font-bold">{GUARDIAN.registerTitle}</h2>
        <label className="flex flex-col gap-1">{GUARDIAN.selectDevice}
          <select data-testid="home-device-select" value={dev ?? "unknown"} onChange={(e) => selectDevice(e.target.value as DeviceId | "unknown")}
            className="rounded-lg border border-[#D0D5DD] p-2 text-base">
            {DEVICE_IDS.map((d) => <option key={d} value={d}>{GUARDIAN.deviceOptions[d]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">{GUARDIAN.modelInput}
          <input data-testid="home-model-input" value={model} onChange={(e) => { setModel(e.target.value); const m = matchModel(e.target.value); if (m) selectDevice(m); }}
            className="rounded-lg border border-[#D0D5DD] p-2 text-base" autoComplete="off" />
        </label>
        <p className="font-semibold" style={{ color: spec && spec.source !== "assumed" ? COLORS.ok : COLORS.muted }}>{matchText}</p>
        <fieldset className="flex flex-col gap-1">
          <legend className="font-semibold">{GUARDIAN.extTitle}</legend>
          {(["none", "verified", "other"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name="ext" checked={extKind === k} disabled={k === "verified" && !extSpec} onChange={() => setExt(k)} /> {GUARDIAN.extOptions[k]}
            </label>
          ))}
          {extKind === "other" && <p style={{ color: COLORS.muted }}>{GUARDIAN.extUnverified}</p>}
          {extKind === "verified" && (
            <div className="flex flex-col gap-1">
              <span>{GUARDIAN.extCharge}</span>
              <div className="flex gap-2">
                {(["full", "half", "unknown"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setObs({ ext: { ...h.observed.ext!, charge: c } })}
                    className={`rounded-lg border px-3 py-1 ${h.observed.ext?.charge === c ? "border-[#1D4ED8] bg-[#EFF4FF] font-semibold" : "border-[#D0D5DD]"}`}>{GUARDIAN.extChargeOptions[c]}</button>
                ))}
              </div>
            </div>
          )}
        </fieldset>
      </section>

      <section className="flex flex-col gap-2">
        <button type="button" data-testid="home-report"
          onClick={() => update((s) => ({ ...s, reports: s.reports.some((r) => r.hid === hid) ? s.reports : [...s.reports, { hid, at: s.now }] }))}
          className="rounded-xl px-4 py-4 text-xl font-bold text-white disabled:opacity-60" style={{ background: COLORS.stop }}>{GUARDIAN.report}</button>
        {reported && <p className="font-semibold" style={{ color: COLORS.ok }}>{GUARDIAN.reported}</p>}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-[#D0D5DD] p-3">
        <label className="flex flex-col gap-1">{GUARDIAN.remainingInput}
          <input data-testid="home-remaining-input" value={hm} onChange={(e) => setHm(e.target.value)} placeholder="3:10" inputMode="numeric" className="rounded-lg border border-[#D0D5DD] p-2 text-base" />
        </label>
        <label className="flex flex-col gap-1">{GUARDIAN.percentInput}
          <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" className="rounded-lg border border-[#D0D5DD] p-2 text-base" />
        </label>
        <div className="flex gap-2">
          <button type="button" data-testid="home-submit" onClick={submit} className="flex-1 rounded-lg bg-[#1D4ED8] px-3 py-2 font-semibold text-white">{OPS_B.homeSubmit}</button>
          <button type="button" onClick={() => setObs({ screen: null, self: null })} className="rounded-lg border border-[#D0D5DD] px-3 py-2">{GUARDIAN.unknownBtn}</button>
        </div>
        {inputErr && <p style={{ color: COLORS.stop }}>{OPS_B.phoneBad}</p>}
        <p className="text-[#475467]">{GUARDIAN.inputHint}</p>
      </section>

      <section data-testid="home-card" className="flex flex-col gap-1 rounded-xl border-2 border-[#1D4ED8] bg-[#F5F8FF] p-3">
        {row.safe.status === "unknown" ? (
          <p className="font-semibold">{GUARDIAN.cardUnknown}</p>
        ) : (
          <>
            <p className="text-lg font-bold">{fill(GUARDIAN.cardNeedAt, { "HH:MM": fmtClockPlus(state.now, row.safe.s_low_engine_min) })}</p>
            <p>{fill(GUARDIAN.cardSafe, { safe: safeText(row.safe) })}</p>
          </>
        )}
      </section>

      <section data-testid="home-guide" className="flex flex-col gap-1 rounded-xl border border-[#D0D5DD] p-3">
        <h2 className="text-lg font-bold">{GUARDIAN.guideTitle}</h2>
        <ol className="flex list-decimal flex-col gap-1 pl-5">{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </section>

      <section data-testid="home-status" className="rounded-xl border border-[#D0D5DD] p-3 font-semibold">
        {status === "approved" ? fill(GUARDIAN.support.approved, { 자원: resourceText(res), t: fmtMin(arrivalMin ?? 0) })
          : status === "pending" ? GUARDIAN.support.pending : GUARDIAN.support.none}
      </section>

      <p className="text-[#475467]">{GUARDIAN.bottomLine}</p>
      <button type="button" data-testid="btn-reset" onClick={() => { if (typeof window !== "undefined" && !window.confirm(HOME.resetConfirm)) return; reset(b.id); setState(emptyStateFor(b)); }}
        className="self-start rounded-lg border border-[#D0D5DD] px-3 py-1 text-[#344054]">{HOME.reset}</button>
    </div>
  );

  if (!frame) return <main className="mx-auto w-full max-w-[390px] bg-white">{body}</main>;
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#E4E7EC] py-4">
      <div className="h-[680px] w-[390px] overflow-y-auto rounded-[36px] border-[10px] border-[#101828] bg-white shadow-xl">{body}</div>
    </main>
  );
}
