// ④ AI 성능 `/lab` (구현명세 §8-4). 모든 숫자는 data/eval/*.json(+ 수집 기록)에서 읽는다. 불리한 칸도 지우지 않는다.
import type { Metadata } from "next";
import fetchLog from "@/data/sms/fetch_log.json";
import l4Sens from "@/data/eval/l4_sensitivity.json";
import type { L4Sensitivity, WilsonCov } from "@/lib/types";
import { COMMON, HOME, LAB, LAB_PAGE, fill } from "@/lib/copy";
import EvalBand from "@/components/EvalBand";
import EventsPlot from "@/components/lab/EventsPlot";
import L4Table from "@/components/lab/L4Table";
import { L1, L2, L4, L1_MIN_REVIEWED, l4ScopeNote } from "@/components/evalText";
import { fmtMin } from "@/components/_fmt";
import { ALLOC_MAX_TOKENS } from "@/lib/llm/allocPrompt";

export const metadata: Metadata = { title: `${LAB_PAGE.title} · ${COMMON.logoFull}` };

const pct = (r: number | null | undefined) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const n2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
const cov = (c: WilsonCov | null) => (c ? `${c.a}/${c.n} (${Math.round(c.lo * 100)}~${Math.round(c.hi * 100)}%)` : "—");
const GH = HOME.githubUrl;
const EVAL_FILES = ["l1_results.json", "l2_results.json", "l4_results.json", "l4_sensitivity.json", "l4_sets_meta.json"];

function Table({ cols, rows, testId }: { cols: readonly string[]; rows: (string | number)[][]; testId?: string }) {
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#D0D5DD] text-left text-[#475467]">
            {cols.map((c) => <th key={c} className="px-2 py-1.5 font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[#EAECF0]">
              {r.map((v, j) => <td key={j} className="px-2 py-1.5 text-[#101828]">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} data-testid={id} className="flex scroll-mt-16 flex-col gap-3 rounded-2xl border border-[#D0D5DD] bg-white p-5">
      <h2 className="text-2xl font-bold text-[#101828]">{title}</h2>
      {children}
    </section>
  );
}

export default function LabPage() {
  const log = fetchLog as unknown as { n_unique: number; fetched_at: string };
  const sens = l4Sens as unknown as L4Sensitivity & { provisional?: boolean };
  const g = L1.meta.reviewed_n;
  const reviewed = g >= (L1.meta.min_reviewed ?? L1_MIN_REVIEWED);
  const l2Temp = L2.status !== "final";
  const l4Temp = L4.status !== "final" || L4.provisional;
  const tempMark = (s: string, temp: boolean) => (temp ? `${s} ${LAB_PAGE.measuringTemp}` : s);

  // L2
  const lr = (m: string) => L2.lr_tests.find((t) => t.model === m && t.vs === "M0");
  const lrNight = lr("M1");
  const lrCause = lr("M2");
  const notConfirmed = (lrNight?.p ?? 1) >= 0.05 && (lrCause?.p ?? 1) >= 0.05;
  const nInt = L2.interval_coverage.hit + L2.interval_coverage.miss + L2.interval_coverage.undetermined;

  // L2 해석: 선택 모형의 분위 오차가 단순 기준선보다 크면 그대로 적는다
  const sel = L2.loo.find((r) => r.id === L2.selected);
  const bl = (id: string) => L2.loo.find((r) => r.id === id);
  const b0 = bl("B0"), b1 = bl("B1"), b2 = bl("B2");
  const baseMin = Math.min(...[b0, b1, b2].filter((x) => !!x).map((x) => x!.pinball.mean));
  const l2Interpret = sel && b0 && b1 && b2 && sel.cov80 && sel.p80_mean_h != null && sel.pinball.mean > baseMin
    ? fill(LAB.l2Interpret, {
        m: LAB_PAGE.l2Labels[sel.id] ?? sel.id, mv: fmtMin(sel.pinball.mean * 60),
        b0: fmtMin(b0.pinball.mean * 60), b1: fmtMin(b1.pinball.mean * 60), b2: fmtMin(b2.pinball.mean * 60), n2: b2.n,
        w: fmtMin(sel.p80_mean_h * 60), a: sel.cov80.a, n: sel.cov80.n,
      })
    : null;

  // L4
  const d = (a: string, b: string, scope: string) => L4.diffs.find((x) => x.a === a && x.b === b && x.scope === scope);
  const ladder = d("A1", "ours", "all");
  const mOf = (id: string) => L4.methods.find((m) => m.id === id);
  const oursM = mOf("ours"), r1M = mOf("R1");
  const scopeNote = l4ScopeNote(L4);
  const nonOracle = L4.methods.filter((m) => m.id !== "ORACLE");
  const lowestAll = (k: "energy_short_mean" | "unknown_share") => !!oursM && nonOracle.every((m) => m.id === "ours" || oursM.all[k] < m.all[k]);
  const l4Interpret: string[] = [];
  if (scopeNote) l4Interpret.push(fill(LAB.l4Scope, { scope: scopeNote }));
  if (ladder && ladder.ci[1] < 0) l4Interpret.push(fill(LAB.l4Ladder, { d: n2(-ladder.mean) }));
  if (oursM && r1M && oursM.all.ei_mean > r1M.all.ei_mean) l4Interpret.push(fill(LAB.l4Lex, { o: fmtMin(oursM.all.ei_mean), r: fmtMin(r1M.all.ei_mean) }));
  if (oursM && lowestAll("energy_short_mean") && lowestAll("unknown_share")) {
    l4Interpret.push(fill(LAB.l4Conservative, { e: n2(oursM.all.energy_short_mean), u: pct(oursM.all.unknown_share) }));
  }
  const diffRow = (a: string, b: string) => [
    LAB_PAGE.diffLabels[`${a}-${b}`],
    ...(["small", "wide", "all"] as const).map((s) => {
      const x = d(a, b, s);
      return x ? tempMark(`${n2(x.mean)}곳 (${fill(LAB_PAGE.ci, { lo: n2(x.ci[0]), hi: n2(x.ci[1]) })})`, l4Temp) : "—";
    }),
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-6 py-8">
      <h1 className="text-4xl font-extrabold text-[#101828]">{LAB_PAGE.title}</h1>
      <p className="text-base text-[#475467]">{LAB_PAGE.intro}</p>
      <EvalBand />

      {/* 1. 재난문자 읽기 */}
      <Section id="lab-l1" title={LAB_PAGE.s1}>
        {reviewed ? (
          <>
            <Table
              cols={LAB_PAGE.l1Cols}
              rows={L1.rows.map((r) => [
                LAB_PAGE.systems[r.system] ?? r.system, pct(r.relevant_f1), pct(r.kind_acc),
                `${pct(r.time_exact.rate)} (${r.time_exact.n})`, `${pct(r.null_correct.rate)} (${r.null_correct.n})`,
                pct(r.eta_base_acc), pct(r.cause6_acc), pct(r.cause3_acc),
                r.link_p == null ? "—" : `${pct(r.link_p)} / ${pct(r.link_r)}`,
              ])}
            />
            <p className="text-[15px] text-[#101828]">{fill(LAB.labelSentence, { g })}</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-[#B54708]">{L1.meta.label_line ?? LAB.preReviewTitle}</p>
            <p className="text-[15px] text-[#344054]">{LAB.labelFallback}</p>
            {L1.vs_rule && (
              <>
                <Table
                  cols={LAB_PAGE.l1VsRuleCols}
                  rows={L1.vs_rule.rows.map((r) => [
                    LAB_PAGE.systems[r.system] ?? r.system, r.n, pct(r.relevant_agree_f1), pct(r.kind_agree),
                    `${pct(r.time_agree.rate)} (${r.time_agree.n})`, `${pct(r.null_agree.rate)} (${r.null_agree.n})`,
                    pct(r.eta_base_agree), pct(r.cause6_agree), pct(r.cause3_agree),
                  ])}
                />
                <p className="text-sm text-[#475467]">{LAB_PAGE.l1VsRuleNote}</p>
              </>
            )}
          </>
        )}
        <h3 className="text-base font-semibold text-[#101828]">{LAB_PAGE.l1AutoTitle}</h3>
        <Table
          cols={LAB_PAGE.l1AutoCols}
          rows={L1.auto_checks.map((a) => [LAB_PAGE.systems[a.system] ?? a.system, a.n ?? "—", pct(a.evidence_in_text), pct(a.time_format_ok)])}
        />
      </Section>

      {/* 2. 복구시간 분포 */}
      <Section id="lab-l2" title={LAB_PAGE.s2}>
        {L2.loo.length === 0 ? (
          <p className="text-base text-[#475467]">{COMMON.measuring}</p>
        ) : (
          <>
            <Table
              cols={LAB_PAGE.l2Cols}
              rows={L2.loo.map((r) => [
                LAB_PAGE.l2Labels[r.id] ?? r.label, r.n, tempMark(fmtMin(r.pinball.mean * 60), l2Temp),
                r.p80_mean_h == null ? "—" : fmtMin(r.p80_mean_h * 60), cov(r.cov80), cov(r.cov90),
              ])}
            />
            <p className="text-[15px] font-semibold text-[#101828]">{fill(LAB.selectedModel, { M: LAB_PAGE.l2Labels[L2.selected] ?? L2.selected })}</p>
            <p className="text-[15px] text-[#101828]">
              {fill(LAB.lrLine, {
                c1: lrNight ? n2(lrNight.chi2) : "—", p1: lrNight ? n2(lrNight.p) : "—",
                c2: lrCause ? n2(lrCause.chi2) : "—", p2: lrCause ? n2(lrCause.p) : "—",
              })}
              {notConfirmed ? ` — ${LAB.lrNotConfirmed}` : ""}
            </p>
            <p className="text-[15px] text-[#101828]">
              {fill(LAB_PAGE.intervalLine, { n: nInt, hit: L2.interval_coverage.hit, miss: L2.interval_coverage.miss, und: L2.interval_coverage.undetermined })}
            </p>
            {l2Interpret && <p data-testid="lab-l2-interpret" className="rounded-lg border border-[#FEC84B] bg-[#FFFAEB] p-3 text-[15px] text-[#101828]">{l2Interpret}</p>}
            <EventsPlot l2={L2} />
            <p className="text-[15px] text-[#101828]">
              {fill(LAB.reviewLine, { n0: L2.review.n_before, n1: L2.review.n_after, k: L2.review.excluded })}
              {L2.reviewed ? "" : ` · ${LAB_PAGE.preReview}`}
            </p>
            <h3 className="text-base font-semibold text-[#101828]">{LAB_PAGE.timeSplitTitle}</h3>
            <p className="text-sm text-[#475467]">{fill(LAB_PAGE.timeSplitN, { train: L2.time_split.train_n, test: L2.time_split.test_n })}</p>
            <Table
              cols={LAB_PAGE.timeSplitCols}
              rows={L2.time_split.rows.map((r) => [LAB_PAGE.l2Labels[r.id] ?? r.id, fmtMin(r.pinball_mean * 60), cov(r.cov80)])}
            />
            <p className="text-sm text-[#475467]">{LAB.scenarioHoldout}</p>
            <p className="text-sm text-[#475467]">{LAB_PAGE.bias}</p>
          </>
        )}
      </Section>

      {/* 3. 비상전원 배정 */}
      <Section id="lab-l4" title={LAB_PAGE.s3}>
        {L4.methods.length === 0 ? (
          <p className="text-base text-[#475467]">{COMMON.measuring}</p>
        ) : (
          <>
            <L4Table l4={L4} temp={l4Temp} />
            {ladder && (
              <p className="text-[15px] font-semibold text-[#101828]">
                {tempMark(fill(LAB.ladder, { d: n2(ladder.mean), lo: n2(ladder.ci[0]), hi: n2(ladder.ci[1]) }), l4Temp)}
              </p>
            )}
            {l4Interpret.length > 0 && (
              <ul data-testid="lab-l4-interpret" className="flex flex-col gap-1 rounded-lg border border-[#FEC84B] bg-[#FFFAEB] p-3 text-[15px] text-[#101828]">
                {l4Interpret.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
            <h3 className="text-base font-semibold text-[#101828]">{LAB_PAGE.diffTitle}</h3>
            <Table cols={LAB_PAGE.diffCols} rows={[diffRow("R1", "ours"), diffRow("A1", "ours"), diffRow("ours", "ORACLE")]} />
            <p className="text-sm text-[#475467]">{fill(LAB_PAGE.computeLine, { ms: n2(L4.compute_ms_wide) })}</p>
          </>
        )}
        <div data-testid="lab-llm" className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-[#101828]">{LAB_PAGE.llmTitle}</h3>
          {L4.llm ? (
            <Table
              cols={LAB_PAGE.llmCols}
              rows={L4.llm.rows.map((r) => [
                LAB.methods[r.id as keyof typeof LAB.methods] ?? r.id, r.n, r.parse_fail,
                `${n2(r.interrupted_mean)}곳 (${fill(LAB_PAGE.ci, { lo: n2(r.ci[0]), hi: n2(r.ci[1]) })})`, r.violations_total,
              ])}
            />
          ) : (
            <p className="text-[15px] text-[#475467]">{LAB_PAGE.llmPending}</p>
          )}
          {L4.llm && (
            <p className="text-sm text-[#475467]">{fill(LAB_PAGE.llmFailNote, { t: ALLOC_MAX_TOKENS.toLocaleString("ko-KR") })}</p>
          )}
          {L4.llm?.ok_only?.filter((o) => o.n < L4.llm!.subset_seeds.length).map((o) => (
            <p key={o.id} data-testid={`lab-llm-okonly-${o.id}`} className="text-[15px] text-[#101828]">
              {fill(LAB_PAGE.llmOkOnly, { model: o.id === "LLM_SONNET" ? "claude-sonnet-5" : o.id === "LLM_HAIKU" ? "claude-haiku-5-5" : o.id, n: o.n, llm: n2(o.llm), ours: n2(o.ours), r1: n2(o.r1) })}
            </p>
          ))}
          <a href={`${GH}/blob/main/prompts/llm_alloc_baseline.md`} target="_blank" rel="noreferrer" className="text-sm text-[#1D4ED8] underline">
            {LAB_PAGE.promptLink}
          </a>
        </div>
        <div data-testid="lab-sensitivity" className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-[#101828]">{LAB_PAGE.sensTitle}</h3>
          {sens.rows.length ? (
            <Table
              cols={LAB_PAGE.sensCols}
              rows={sens.rows.map((r) => [
                r.label, `${n2(r.ours)}곳`, `${n2(r.r1)}곳`,
                tempMark(`${n2(r.diff)}곳 (${fill(LAB_PAGE.ci, { lo: n2(r.ci[0]), hi: n2(r.ci[1]) })})`, sens.status !== "final" || !!sens.provisional),
              ])}
            />
          ) : (
            <p className="text-[15px] text-[#475467]">{COMMON.measuring}</p>
          )}
        </div>
        <ul className="list-disc pl-5 text-sm text-[#475467]">
          <li>{LAB_PAGE.limits[0]}</li>
          <li>{LAB_PAGE.limits[3]}</li>
        </ul>
      </Section>

      {/* 4. 데이터 출처 */}
      <Section id="lab-sources" title={LAB_PAGE.s4}>
        <Table
          cols={LAB_PAGE.sourcesCols}
          rows={LAB_PAGE.sources.map((r) => r.map((c) => fill(c, { n: log.n_unique, collected: log.fetched_at.slice(0, 10) })))}
        />
      </Section>

      {/* 5. 한계 */}
      <Section id="lab-limits" title={LAB_PAGE.s5}>
        <ol className="list-decimal pl-5 text-[15px] leading-relaxed text-[#101828]">
          {LAB_PAGE.limits.map((l) => <li key={l}>{l}</li>)}
        </ol>
      </Section>

      {/* 6. 코드·자료 */}
      <Section id="lab-code" title={LAB_PAGE.s6}>
        <a href={GH} target="_blank" rel="noreferrer" className="text-[15px] text-[#1D4ED8] underline">{LAB_PAGE.repoLink}</a>
        <p className="text-sm font-semibold text-[#475467]">{LAB_PAGE.dataLinks}</p>
        <ul className="flex flex-wrap gap-3 text-sm">
          {EVAL_FILES.map((f) => (
            <li key={f}>
              <a href={`${GH}/blob/main/data/eval/${f}`} target="_blank" rel="noreferrer" className="text-[#1D4ED8] underline">data/eval/{f}</a>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
