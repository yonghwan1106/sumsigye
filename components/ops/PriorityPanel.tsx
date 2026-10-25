"use client";
// /ops 오른쪽 「대응 우선순위·배정」(구현명세 §8-2). 레인 ① 119 연계 검토 ② 수동확인 필요 ③ 표(대응 우선순위 순).
// 결정은 한 행씩: 승인 · 변경 ▾(호환 후보만) · 보류. 「모두 승인」 버튼은 두지 않는다.
import { useState } from "react";
import { COLORS, COMMON, GUARDIAN, OPS, fill } from "@/lib/copy";
import { fmtClock, fmtMin, fmtProb, fmtSignedMin, parseHm } from "@/lib/format";
import type { DeviceId, Household, HouseholdObserved, Plan, PlanRow, Resource, ScenarioBundle, ScenarioState } from "@/lib/types";
import { OPS_B } from "./copyB";
import { arrivalText, deviceLabel, exclusionText, factRow, gradeBadges, safeText } from "./display";
import { SPECS, stateHash } from "./scenario";

type Update = (fn: (s: ScenarioState) => ScenarioState) => void;
const DEVICE_IDS: (DeviceId | "unknown")[] = ["VENT_A", "VENT_B", "O2_STAT", "O2_PORT", "SUCTION", "COUGH", "unknown"];

function Chip({ text, tone = "gray" }: { text: string; tone?: "gray" | "blue" | "yellow" | "red" | "green" }) {
  const st: Record<string, React.CSSProperties> = {
    gray: { background: "#F2F4F7", color: "#344054" }, blue: { background: "#EFF4FF", color: "#1D4ED8" },
    yellow: { background: COLORS.changedBg, color: COLORS.changedText }, red: { background: "#FEE4E2", color: COLORS.stop },
    green: { background: "#DCFAE6", color: COLORS.ok },
  };
  return <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold" style={st[tone]}>{text}</span>;
}

function PhoneForm({ h, onSave, onCancel }: { h: Household; onSave: (o: Partial<HouseholdObserved>) => void; onCancel: () => void }) {
  const [dev, setDev] = useState<DeviceId | "unknown">(h.observed.device_id ?? "unknown");
  const [hm, setHm] = useState("");
  const [pct, setPct] = useState("");
  const [err, setErr] = useState(false);
  function save() {
    const m = hm.trim() ? parseHm(hm) : null;
    const p = pct.trim() ? Number(pct) : null;
    const okP = p != null && Number.isFinite(p) && p >= 0 && p <= 100;
    if (m == null && !okP) { setErr(true); return; }
    const spec = dev === "unknown" ? null : SPECS.devices.find((d) => d.id === dev) ?? null;
    onSave({
      device_id: spec ? spec.id : null,
      device_match: spec ? (spec.source === "assumed" ? "assumed" : "manual") : "unknown",
      screen: m != null ? { kind: "minutes", value: m, at: "" } : { kind: "percent", value: p!, at: "" },
      self: null,
    });
  }
  return (
    <div className="mt-2 flex flex-col gap-2 rounded border border-[#D0D5DD] bg-white p-2 text-sm">
      <label className="flex flex-col gap-1">{OPS_B.phoneDevice}
        <select value={dev} onChange={(e) => setDev(e.target.value as DeviceId | "unknown")} className="rounded border border-[#D0D5DD] p-1">
          {DEVICE_IDS.map((d) => <option key={d} value={d}>{GUARDIAN.deviceOptions[d]}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">{OPS_B.phoneMinutes}
          <input value={hm} onChange={(e) => setHm(e.target.value)} placeholder="1:30" inputMode="numeric" className="rounded border border-[#D0D5DD] p-1" />
        </label>
        <label className="flex w-24 flex-col gap-1">{OPS_B.phonePercent}
          <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" className="rounded border border-[#D0D5DD] p-1" />
        </label>
      </div>
      {err && <p style={{ color: COLORS.stop }}>{OPS_B.phoneBad}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded border border-[#D0D5DD] px-2 py-1">{OPS_B.phoneCancel}</button>
        <button type="button" onClick={save} className="rounded bg-[#1D4ED8] px-2 py-1 font-semibold text-white">{OPS_B.phoneSave}</button>
      </div>
    </div>
  );
}

function Brief({ bundle, state, row, h, plan, changedAliases }: { bundle: ScenarioBundle; state: ScenarioState; row: PlanRow; h: Household; plan: Plan; changedAliases: string[] }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || lines) return;
    try {
      const facts = { rows: [factRow(row, h.alias, h.observed.device_id, bundle.resources)], changed: changedAliases, now: fmtClock(state.now) };
      const hash = await stateHash(bundle, state);
      const r = await fetch("/api/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario_id: bundle.id, state_hash: hash, facts }) });
      const j = await r.json();
      setLines(Array.isArray(j?.lines) ? (j.lines as string[]).slice(0, 3) : []);
    } catch { setLines([]); }
  }
  void plan;
  return (
    <div className="mt-1">
      <button type="button" onClick={toggle} className="text-xs font-semibold text-[#1D4ED8] underline">{open ? "▾" : "▸"} {OPS.whyTitle}</button>
      {open && (
        <ul data-testid={`brief-${row.hid}`} className="mt-1 flex flex-col gap-0.5 text-xs text-[#344054]">
          {(lines ?? []).map((l, i) => <li key={i}>{l} <Chip text={COMMON.referenceTag} /></li>)}
          {lines && lines.length === 0 && <li><Chip text={COMMON.referenceTag} /></li>}
        </ul>
      )}
    </div>
  );
}

function Row(props: { bundle: ScenarioBundle; state: ScenarioState; plan: Plan; row: PlanRow; h: Household; changed: boolean; changedAliases: string[]; update: Update }) {
  const { bundle: b, state: s, row, h, changed, update } = props;
  const [showMore, setShowMore] = useState(false);
  const [phone, setPhone] = useState(false);
  const [pick, setPick] = useState(false);
  const approval = s.approvals.find((a) => a.hid === row.hid);
  const held = s.holds.includes(row.hid);
  const res = b.resources;
  const usedByOthers = new Set(s.approvals.filter((a) => a.hid !== row.hid).map((a) => a.rid));
  const okCands = res.filter((r) => !row.excluded.some((e) => e.rid === r.id) && !usedByOthers.has(r.id));

  let status: { text: string; tone: "gray" | "blue" | "yellow" | "green" };
  if (approval) status = { text: fill(OPS.status.approved, { "HH:MM": fmtClock(approval.approved_at) }), tone: "green" };
  else if (held) status = { text: OPS.status.held, tone: "gray" };
  else if (changed) status = { text: OPS.status.reapprove, tone: "yellow" };
  else status = { text: OPS.status.proposed, tone: "blue" };

  const approve = (rid: string, reason: "기본" | "다른 호환 자원") => update((x) => ({
    ...x, holds: x.holds.filter((k) => k !== row.hid),
    approvals: [...x.approvals.filter((a) => a.hid !== row.hid && a.rid !== rid), { hid: row.hid, rid, approved_at: x.now, reason }],
  }));
  const hold = () => update((x) => ({ ...x, holds: x.holds.includes(row.hid) ? x.holds : [...x.holds, row.hid], approvals: x.approvals.filter((a) => a.hid !== row.hid) }));
  const saveOverride = (o: Partial<HouseholdObserved>) => update((x) => {
    const screen = o.screen ? { ...o.screen, at: x.now } : o.screen;
    return { ...x, overrides: { ...x.overrides, [row.hid]: { ...(x.overrides[row.hid] ?? {}), ...o, screen } } };
  });
  const card119 = s.card119_approved.includes(row.hid);

  return (
    <div data-testid={`row-${row.hid}`} className="rounded-lg border p-2" style={{ borderColor: changed ? COLORS.changedText : "#EAECF0", background: changed ? COLORS.changedBg : "#fff" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-[#101828] px-1.5 text-sm font-bold text-white">{row.priority}</span>
        <span className="text-sm font-bold text-[#101828]">{h.alias}</span>
        <span className="text-sm text-[#344054]">{deviceLabel(h.observed.device_id)}</span>
        {gradeBadges(row.safe).map((g) => <Chip key={g} text={g} />)}
        {changed && <Chip text={OPS_B.changed} tone="yellow" />}
        <span className="ml-auto"><Chip text={status.text} tone={status.tone} /></span>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[13px] leading-snug">
        <dt className="text-[#475467]">{OPS.tableHead[3]}</dt>
        <dd className="font-semibold" style={{ color: row.safe.status === "unknown" ? COLORS.muted : "#101828" }}>{safeText(row.safe)}</dd>
        <dt className="text-[#475467]">{OPS.tableHead[4]}</dt><dd>{fmtProb(row.p_int0)}</dd>
        <dt className="text-[#475467]">{OPS.tableHead[5]}</dt><dd>{fmtSignedMin(row.margin_min)}</dd>
        <dt className="text-[#475467]">{OPS.tableHead[6]}</dt><dd>{arrivalText(row, res)}</dd>
        <dt className="text-[#475467]">{OPS.tableHead[7]}</dt><dd>{fill(OPS_B.eiArrow, { a: fmtMin(row.ei0_min), b: fmtMin(row.ei_min) })}</dd>
      </dl>
      {row.safe.ext_excluded_min != null && (
        <p className="text-xs" style={{ color: COLORS.muted }}>{fill(OPS.extExcluded, { h: fmtMin(row.safe.ext_excluded_min) })}</p>
      )}
      {row.lane === "manual" && <p className="text-xs text-[#475467]">{OPS.manualNote}</p>}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" data-testid={`btn-approve-${row.hid}`} disabled={!row.rid || !!approval} onClick={() => row.rid && approve(row.rid, "기본")}
          className="rounded bg-[#1D4ED8] px-2 py-1 text-xs font-semibold text-white disabled:opacity-40">{OPS.btnApprove}</button>
        <div className="relative">
          <button type="button" data-testid={`btn-change-${row.hid}`} disabled={okCands.length === 0} onClick={() => setPick((v) => !v)}
            className="rounded border border-[#D0D5DD] bg-white px-2 py-1 text-xs font-semibold disabled:opacity-40">{OPS.btnChange}</button>
          {pick && (
            <ul className="absolute left-0 top-7 z-20 w-64 rounded border border-[#D0D5DD] bg-white p-1 text-xs shadow">
              <li className="px-1 py-0.5 text-[#475467]">{OPS_B.changePick}</li>
              {okCands.map((r) => (
                <li key={r.id}><button type="button" className="w-full rounded px-1 py-1 text-left hover:bg-[#F2F4F7]" onClick={() => { setPick(false); approve(r.id, r.id === row.rid ? "기본" : "다른 호환 자원"); }}>{r.id} · {r.label}({r.base_label})</button></li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" data-testid={`btn-hold-${row.hid}`} onClick={hold} className="rounded border border-[#D0D5DD] bg-white px-2 py-1 text-xs font-semibold">{OPS.btnHold}</button>
        {row.lane === "manual" && (
          <button type="button" data-testid={`btn-phone-${row.hid}`} onClick={() => setPhone((v) => !v)} className="rounded border border-[#B54708] bg-white px-2 py-1 text-xs font-semibold text-[#B54708]">{OPS.btnPhone}</button>
        )}
        {row.lane === "119" && (
          <button type="button" data-testid={`btn-119-${row.hid}`} disabled={card119}
            onClick={() => update((x) => ({ ...x, card119_approved: x.card119_approved.includes(row.hid) ? x.card119_approved : [...x.card119_approved, row.hid] }))}
            className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" style={{ background: COLORS.stop }}>{OPS.btn119}</button>
        )}
        <button type="button" onClick={() => setShowMore((v) => !v)} className="ml-auto text-xs text-[#475467] underline">{showMore ? "▾" : "▸"} {OPS_B.excludedHead}</button>
      </div>
      {phone && <PhoneForm h={h} onCancel={() => setPhone(false)} onSave={(o) => { setPhone(false); saveOverride(o); }} />}
      {card119 && (
        <div data-testid={`card119-${row.hid}`} className="mt-2 rounded border-2 p-2 text-sm" style={{ borderColor: COLORS.stop }}>
          <p className="font-bold" style={{ color: COLORS.stop }}>{OPS.card119Title}</p>
          <p>{fill(OPS.card119Lines[0], { area: h.area })}</p>
          <p>{fill(OPS.card119Lines[1], { device: deviceLabel(h.observed.device_id) })}</p>
          <p>{fill(OPS.card119Lines[2], { safe: safeText(row.safe) })}</p>
        </div>
      )}
      {showMore && (
        <div className="mt-1 text-xs text-[#475467]">
          <ul className="flex flex-col gap-0.5">{row.excluded.map((e) => <li key={e.rid}>{exclusionText(e, res)}</li>)}</ul>
          {row.supply_min != null && <p className="mt-1">{fill(OPS_B.supplyLine, { t: fmtMin(row.supply_min) })} · {OPS.supplyFootnote}</p>}
        </div>
      )}
      <Brief bundle={b} state={s} row={row} h={h} plan={props.plan} changedAliases={props.changedAliases} />
    </div>
  );
}

export default function PriorityPanel(props: { bundle: ScenarioBundle; state: ScenarioState; plan: Plan; households: Household[]; changed: Set<string>; update: Update }) {
  const { plan, households, changed } = props;
  const hOf = (hid: string) => households.find((h) => h.id === hid)!;
  const lane119 = plan.rows.filter((r) => r.lane === "119");
  const laneManual = plan.rows.filter((r) => r.lane === "manual");
  const main = plan.rows.filter((r) => r.lane === "main");
  const changedAliases = [...changed].map((hid) => hOf(hid)?.alias ?? hid);
  const R = (r: PlanRow) => <Row key={r.hid} {...props} row={r} h={hOf(r.hid)} changed={changed.has(r.hid)} changedAliases={changedAliases} />;
  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="pr-24 text-base font-bold text-[#101828]">{OPS.priorityTitle}</h2>
      <section data-testid="lane-119" className="rounded-lg border-2 p-2" style={{ borderColor: COLORS.stop }}>
        <h3 className="mb-1 text-sm font-bold" style={{ color: COLORS.stop }}>{OPS.lane119}</h3>
        <div className="flex flex-col gap-2">
          {lane119.map((r) => (
            <div key={r.hid} className="flex flex-col gap-1">
              <Chip text={r.lane_reason === "late_arrival" ? OPS.lane119Reason.late_arrival : OPS.lane119Reason.no_compatible} tone="red" />
              {R(r)}
            </div>
          ))}
        </div>
      </section>
      <section data-testid="lane-manual" className="rounded-lg border-2 p-2" style={{ borderColor: COLORS.changedText }}>
        <h3 className="mb-1 text-sm font-bold" style={{ color: COLORS.changedText }}>{OPS.laneManual}</h3>
        <div className="flex flex-col gap-2">
          {laneManual.map((r) => (
            <div key={r.hid} className="flex flex-col gap-1">
              <Chip text={r.lane_reason === "conflict" ? OPS.laneManualReason.conflict : OPS.laneManualReason.unknown} tone="yellow" />
              {R(r)}
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-1">
        <p className="text-xs text-[#475467]">{OPS.tableHead.join(" · ")}</p>
        <div className="flex flex-col gap-2">{main.map(R)}</div>
      </section>
    </div>
  );
}

export type { Resource };
