"use client";
// /ops 왼쪽 「사건」 패널(구현명세 §8-2).
import { useState } from "react";
import DistBand from "@/components/DistBand";
import restoreJson from "@/data/model/restore_model.json";
import { COLORS, OPS, fill } from "@/lib/copy";
import { fmtClock, fmtMin, fmtProb } from "@/lib/format";
import { finalize } from "@/lib/l1/validate";
import { ruleExtract } from "@/lib/l1/ruleExtract";
import { minutesBetween } from "@/lib/engine/time";
import type { L1Resolved, RestoreModelFile, ScenarioBundle, ScenarioState } from "@/lib/types";
import { CAUSE_LABEL, OPS_B } from "./copyB";
import { arrivedSms, latestEta, probBeyond, reportsUpTo, weatherAt, type Computed, type SmsL1 } from "./scenario";
import { restoredText } from "./display";

const RM = restoreJson as unknown as RestoreModelFile;

function Highlight({ text, marks }: { text: string; marks: string[] }) {
  const ms = marks.filter((m) => m && text.includes(m)).sort((a, b) => b.length - a.length);
  if (!ms.length) return <>{text}</>;
  const parts: { s: string; hit: boolean }[] = [];
  let rest = text;
  while (rest.length) {
    let best: { i: number; m: string } | null = null;
    for (const m of ms) { const i = rest.indexOf(m); if (i >= 0 && (!best || i < best.i)) best = { i, m }; }
    if (!best) { parts.push({ s: rest, hit: false }); break; }
    if (best.i > 0) parts.push({ s: rest.slice(0, best.i), hit: false });
    parts.push({ s: best.m, hit: true });
    rest = rest.slice(best.i + best.m.length);
  }
  return <>{parts.map((p, i) => (p.hit ? <mark key={i} className="rounded bg-[#FEF0C7] px-0.5 text-[#101828]">{p.s}</mark> : <span key={i}>{p.s}</span>))}</>;
}

function ExtractTable({ f }: { f: L1Resolved }) {
  const none: string = OPS.notInSms;
  let eta: string = none;
  if (f.eta_at) eta = fmtClock(f.eta_at);
  else if (f.eta_range && f.eta && f.eta.type === "duration") eta = fill(OPS.etaUnknownBase, { h: fmtMin(f.eta.minutes), a: fmtClock(f.eta_range[0]), b: fmtClock(f.eta_range[1]) });
  const rows: [string, string][] = [
    [OPS.extractCols.place, f.place_text ?? none],
    [OPS.extractCols.occurred, f.occurred_at ? fmtClock(f.occurred_at) : none],
    [OPS.extractCols.eta, eta],
    [OPS.extractCols.restored, f.restored_at ? fmtClock(f.restored_at) : none],
    [OPS.extractCols.cause, f.cause6 !== "unknown" ? CAUSE_LABEL[f.cause6] : none],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-t border-[#EAECF0]">
            <th className="w-14 py-1 pr-2 text-left font-semibold text-[#475467]">{k}</th>
            <td className={`py-1 ${v === none ? "text-[#667085]" : "text-[#101828]"}`}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Badge({ text }: { text: string }) {
  return <span className="rounded bg-[#EFF4FF] px-2 py-0.5 text-sm font-semibold text-[#1D4ED8]">{text}</span>;
}

export default function EventPanel(props: { bundle: ScenarioBundle; state: ScenarioState; smsL1: SmsL1; comp: Computed }) {
  const { bundle: b, state: s, smsL1, comp } = props;
  const arrived = arrivedSms(b, s.now);
  const reports = reportsUpTo(b, s);
  const aliasOf = (hid: string) => b.households.find((h) => h.id === hid)?.alias ?? hid;

  // 분포 띠
  const eta = latestEta(b, s.now, smsL1);
  let etaProp: { clock: string; at_min: number } | null = null;
  let etaProb: { p: string } | { p1: string; p2: string } | null = null;
  if (eta?.eta_at) {
    etaProp = { clock: fmtClock(eta.eta_at), at_min: Math.max(0, minutesBetween(s.now, eta.eta_at)) };
    etaProb = { p: fmtProb(probBeyond(comp.dist.d, s.now, eta.eta_at)) };
  } else if (eta?.eta_range) {
    etaProp = { clock: `${fmtClock(eta.eta_range[0])}~${fmtClock(eta.eta_range[1])}`, at_min: Math.max(0, minutesBetween(s.now, eta.eta_range[0])) };
    etaProb = { p1: fmtProb(probBeyond(comp.dist.d, s.now, eta.eta_range[0])), p2: fmtProb(probBeyond(comp.dist.d, s.now, eta.eta_range[1])) };
  }
  const d = RM.data;
  // E0(정확 사건 경험분포)은 진행 중(오른쪽 중도절단) 사건을 쓰지 않는다 → 캡션의 사건 수 = 정확 + 구간
  const empirical = RM.selected === "E0";
  const nAll = empirical ? d.n_exact + d.n_interval : d.n_exact + d.n_interval + d.n_right;
  const counts = nAll > 0 ? { n: nAll, n_exact: d.n_exact, n_int: d.n_interval, n_cens: d.n_right } : null;
  const captionTpl = empirical ? OPS.distCaptionEmp : OPS.distCaption;
  const w = weatherAt(b, s.now);

  // 타임라인 점
  const t0 = Date.parse(b.outage_start);
  const tEnd = Math.max(Date.parse(s.now), ...b.timeline.filter((e) => Date.parse(e.at) <= Date.parse(s.now)).map((e) => Date.parse(e.at))) + 10 * 60000;
  const X = (t: number) => 8 + ((t - t0) / Math.max(1, tEnd - t0)) * 304;
  const dots: { t: number; c: string; l: string }[] = [{ t: t0, c: COLORS.stop, l: OPS_B.timelineLabels.occurred }];
  reports.forEach((r) => dots.push({ t: Date.parse(r.at), c: "#7A5AF8", l: OPS_B.timelineLabels.report }));
  arrived.forEach((e) => dots.push({ t: Date.parse(e.at), c: "#1D4ED8", l: OPS_B.timelineLabels.sms }));
  b.timeline.filter((e) => e.type === "restored" && Date.parse(e.at) <= Date.parse(s.now)).forEach((e) => dots.push({ t: Date.parse(e.at), c: COLORS.ok, l: OPS_B.timelineLabels.restored }));
  // 이름표 줄: 가까운 점끼리 겹치지 않게 2줄로 엇갈린다(14px 글자)
  const labelRow: number[] = [];
  {
    const lastX = [-1e9, -1e9];
    let prev: { x: number; l: string } | null = null;
    dots.map((p, i) => ({ p, i })).sort((a, z) => a.p.t - z.p.t).forEach(({ p, i }) => {
      const x = X(p.t);
      // 바로 앞 이름표와 같은 낱말이고 가까우면 이름표를 한 번만 쓴다(점은 그대로)
      if (prev && prev.l === p.l && x - prev.x < 34) { labelRow[i] = -1; return; }
      const row = x - lastX[0] >= 34 ? 0 : x - lastX[1] >= 34 ? 1 : (lastX[0] <= lastX[1] ? 0 : 1);
      labelRow[i] = row; lastX[row] = x; prev = { x, l: p.l };
    });
  }

  // 붙여넣기 추출
  const [paste, setPaste] = useState("");
  const [pasteRes, setPasteRes] = useState<{ f: L1Resolved; badge: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function runExtract() {
    const text = paste.trim().slice(0, 1000);
    if (!text) return;
    setBusy(true);
    try {
      const r = await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, sent_at: s.now, org: null }) });
      const j = await r.json();
      if (!j || !j.ok || !j.fields) throw new Error("bad");
      const badge = j.source === "llm" ? OPS.badgeLive : j.source === "rule" ? OPS.badgeRule : OPS.badgePrecomputed;
      setPasteRes({ f: j.fields as L1Resolved, badge });
    } catch {
      setPasteRes({ f: finalize(ruleExtract({ text, sent_at: s.now, org: null }), { text, sent_at: s.now }), badge: OPS.badgeRule });
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="pr-24 text-base font-bold text-[#101828]">{arrived.length ? OPS.eventHeadConfirmed : OPS.eventHead}</h2>
      <ul className="flex flex-col gap-1 text-sm text-[#344054]">
        {reports.map((r) => <li key={r.hid + r.at}>{fill(OPS.reportItem, { "HH:MM": fmtClock(r.at), alias: aliasOf(r.hid) })}</li>)}
      </ul>

      {[...arrived].reverse().map((e) => {
        const l1 = smsL1[String(e.sn)];
        const marks = l1 ? Object.values(l1.fields.evidence ?? {}).filter((x): x is string => typeof x === "string") : [];
        return (
          <article key={e.sn} data-testid={`sms-card-${e.sn}`} className="flex flex-col gap-2 rounded-lg border border-[#B2CCFF] bg-[#F5F8FF] p-3">
            <div className="flex flex-wrap items-center justify-between gap-1 text-sm text-[#475467]">
              <span>{fmtClock(e.at)} · {e.org}</span>
              {l1 && <Badge text={l1.source === "precomputed" ? OPS.badgePrecomputed : OPS.badgeRule} />}
            </div>
            <p className="text-sm leading-relaxed text-[#101828]"><Highlight text={e.text} marks={marks} /></p>
            {l1 && <ExtractTable f={l1.fields} />}
          </article>
        );
      })}

      <svg viewBox="0 0 320 70" className="w-full" aria-hidden="true">
        <line x1={8} x2={312} y1={14} y2={14} stroke="#D0D5DD" strokeWidth={2} />
        {dots.map((p, i) => (
          <g key={i}>
            <circle cx={X(p.t)} cy={14} r={5} fill={p.c} />
            {labelRow[i] >= 0 && <text x={Math.min(296, Math.max(16, X(p.t)))} y={36 + labelRow[i] * 18} fontSize={15} textAnchor="middle" fill="#475467">{p.l}</text>}
          </g>
        ))}
        <line x1={X(Date.parse(s.now))} x2={X(Date.parse(s.now))} y1={2} y2={24} stroke="#101828" strokeWidth={1.5} strokeDasharray="2 2" />
      </svg>

      {comp.restored ? (
        <div data-testid="restored-box" className="flex flex-col gap-1 rounded-lg border-2 p-3" style={{ borderColor: COLORS.ok, background: "#ECFDF3" }}>
          <p className="text-lg font-bold" style={{ color: COLORS.ok }}>{restoredText(comp.restored)}</p>
          <p className="text-sm text-[#101828]">{fill(OPS.restoredDuration, { d: fmtMin(Math.max(0, minutesBetween(b.outage_start, comp.restored.at))) })}</p>
          <p className="text-sm text-[#101828]">{OPS.restoredNote}</p>
        </div>
      ) : (
        <DistBand p50_min={comp.p50} p80_min={comp.r80} p90_min={comp.p90} now={s.now} eta={etaProp} etaProb={etaProb}
          counts={counts} captionTpl={captionTpl} small={comp.dist.small} provisional={RM.provisional || b.restore_model.source === "provisional"} compact />
      )}

      <p className="rounded-lg border border-[#EAECF0] bg-white p-2 text-sm text-[#344054]">
        {w ? fill(OPS.weatherCard, { t: Math.round(w.temp_c * 10) / 10, mm: Math.round(w.precip_mm * 10) / 10, ms: Math.round(w.wind_ms * 10) / 10 }) : OPS.weatherNone}
        {w && w.temp_c >= 35 && <span className="mt-1 block font-semibold" style={{ color: COLORS.changedText }}>{OPS.weatherHeat}</span>}
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-[#EAECF0] bg-white p-2">
        <label className="text-sm font-semibold text-[#344054]" htmlFor="paste-sms">{OPS.pasteSms}</label>
        <textarea id="paste-sms" data-testid="paste-sms" maxLength={1000} rows={3} value={paste} onChange={(e) => setPaste(e.target.value)}
          className="w-full resize-y rounded border border-[#D0D5DD] p-2 text-sm" />
        <button type="button" data-testid="btn-extract" onClick={runExtract} disabled={busy || !paste.trim()}
          className="self-end rounded-md bg-[#1D4ED8] px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">{OPS.extract}</button>
        {pasteRes && (<div className="flex flex-col gap-1"><Badge text={pasteRes.badge} /><ExtractTable f={pasteRes.f} /></div>)}
      </div>
    </div>
  );
}
