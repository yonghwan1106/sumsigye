// ⑤ 데이터·원칙 `/about` (구현명세 §8-5). 가정값 표는 엔진 기본값(DEFAULT_PARAMS)을 그대로 읽는다.
import type { Metadata } from "next";
import fetchLog from "@/data/sms/fetch_log.json";
import { DEFAULT_PARAMS } from "@/lib/types";
import { ABOUT, ABOUT_PAGE, COMMON, GUARDIAN, LAB_PAGE, fill } from "@/lib/copy";

export const metadata: Metadata = { title: `${ABOUT_PAGE.title} · ${COMMON.logoFull}` };

function Table({ cols, rows }: { cols: readonly string[]; rows: readonly (readonly (string | number)[])[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#D0D5DD] text-left text-[#475467]">
            {cols.map((c) => <th key={c} className="px-2 py-1.5 font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[#EAECF0] align-top">
              {r.map((v, j) => <td key={j} className="px-2 py-1.5 text-[#101828]">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AboutPage() {
  const log = fetchLog as unknown as { n_unique: number; fetched_at: string };
  const [p1, p2, p3, p4] = ABOUT.paragraphs;
  return (
    <main className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col gap-6 px-6 py-8">
      <h1 className="text-4xl font-extrabold text-[#101828]">{ABOUT_PAGE.title}</h1>
      <section className="flex flex-col gap-3 text-[17px] leading-relaxed text-[#101828]">
        <p>{p1}</p>
        <p>{p2}</p>
        <p>{p3}</p>
        <p>
          {p4}{" "}
          {ABOUT_PAGE.overseasLinks.map((l, i) => (
            <span key={l.url}>
              {i > 0 ? " · " : ""}
              <a href={l.url} target="_blank" rel="noreferrer" className="text-[#1D4ED8] underline">{l.label}</a>
            </span>
          ))}
        </p>
        <p className="text-[15px] text-[#475467]">{GUARDIAN.bottomLine}</p>
        <p className="text-[15px] font-semibold text-[#344054]">{ABOUT.implNote}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-[#101828]">{ABOUT_PAGE.principlesTitle}</h2>
        <Table cols={ABOUT_PAGE.principlesCols} rows={ABOUT_PAGE.principles} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-[#101828]">{ABOUT_PAGE.paramsTitle}</h2>
        <Table
          cols={ABOUT_PAGE.paramsCols}
          rows={Object.entries(DEFAULT_PARAMS).map(([k, v]) => [ABOUT_PAGE.paramsDesc[k] ?? k, String(v)])}
        />
        <h3 className="mt-2 text-lg font-semibold text-[#101828]">{ABOUT_PAGE.synthTitle}</h3>
        <ul className="list-disc pl-5 text-[15px] leading-relaxed text-[#101828]">
          {ABOUT_PAGE.synth.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-[#101828]">{ABOUT_PAGE.sourcesTitle}</h2>
        <Table
          cols={LAB_PAGE.sourcesCols}
          rows={LAB_PAGE.sources.map((r) => r.map((c) => fill(c, { n: log.n_unique, collected: log.fetched_at.slice(0, 10) })))}
        />
      </section>
    </main>
  );
}
