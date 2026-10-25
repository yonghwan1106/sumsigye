// ① 첫 화면 `/` (구현명세 §8-1). 숫자는 모두 저장소의 산출 파일(수집 기록·모형·평가 JSON·시나리오)에서 읽는다.
import Link from "next/link";
import fetchLog from "@/data/sms/fetch_log.json";
import restoreModel from "@/data/model/restore_model.json";
import type { RestoreModelFile } from "@/lib/types";
import { COMMON, HOME, fill } from "@/lib/copy";
import Race from "@/components/Race";
import EvalBand from "@/components/EvalBand";
import DeviceIllustration from "@/components/DeviceIllustration";
import ResetButton from "@/components/ResetButton";
import { raceBand } from "@/components/evalText";
import { BUNDLES, heroRace, type ScenarioId } from "@/components/scenarioData";

const day = (iso: string) => iso.slice(0, 10);

function Highlight({ text, marks }: { text: string; marks: readonly string[] }) {
  const parts: { t: string; m: boolean }[] = [];
  let rest = text;
  while (rest.length) {
    let best: { i: number; s: string } | null = null;
    for (const s of marks) {
      const i = rest.indexOf(s);
      if (i >= 0 && (!best || i < best.i)) best = { i, s };
    }
    if (!best) {
      parts.push({ t: rest, m: false });
      break;
    }
    if (best.i > 0) parts.push({ t: rest.slice(0, best.i), m: false });
    parts.push({ t: best.s, m: true });
    rest = rest.slice(best.i + best.s.length);
  }
  return (
    <>
      {parts.map((p, i) =>
        p.m ? (
          <mark key={i} className="rounded bg-[#FEF0C7] px-0.5 text-[#101828]">{p.t}</mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}

export default function Home() {
  const log = fetchLog as unknown as { n_unique: number; first_sent: string; last_sent: string; fetched_at: string };
  const model = restoreModel as unknown as RestoreModelFile;
  const sc1 = BUNDLES.sc1;
  const mapoSms = sc1.timeline.filter((e): e is Extract<typeof e, { type: "sms" }> => e.type === "sms");
  const race = heroRace();
  const corpusLine = fill(HOME.factCorpus, {
    N: log.n_unique,
    first: day(log.first_sent),
    last: day(log.last_sent),
    collected: day(log.fetched_at),
    n_exact: model.provisional ? COMMON.measuring : model.data.n_exact,
    n_int: model.provisional ? COMMON.measuring : model.data.n_interval,
  });

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-10 px-6 py-8">
      {/* 히어로 */}
      <section className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <h1 className="flex flex-wrap items-baseline gap-3 text-6xl font-extrabold tracking-tight text-[#101828]">
            {HOME.heroTitle}
            <span className="text-2xl font-semibold text-[#475467]">{COMMON.tagline}</span>
          </h1>
          <p data-testid="hero-oneliner" className="max-w-[44rem] text-2xl font-medium leading-relaxed text-[#101828]">
            {HOME.heroOneliner}
          </p>
          <p className="text-base text-[#475467]">{HOME.implNote}</p>
        </div>
        <DeviceIllustration width={320} />
      </section>

      {/* 실제로 있었던 일 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-[#101828]">{HOME.factsTitle}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <article data-testid="fact-doksan" className="flex flex-col gap-2 rounded-xl border border-[#D0D5DD] bg-white p-4">
            <p className="text-base font-semibold leading-relaxed text-[#101828]">{HOME.factDoksan.line1}</p>
            <p className="text-[15px] text-[#B54708]">{HOME.factDoksan.line2}</p>
            <p className="mt-auto text-sm text-[#475467]">
              {HOME.sourceLabel}{" "}
              <a href={HOME.doksanUrl} target="_blank" rel="noreferrer" className="underline">
                {HOME.factDoksan.source}
              </a>
            </p>
          </article>
          <article data-testid="fact-mapo" className="flex flex-col gap-2 rounded-xl border border-[#D0D5DD] bg-white p-4">
            <p className="text-base font-semibold leading-relaxed text-[#101828]">{HOME.factMapo.line1}</p>
            <p className="text-sm font-semibold text-[#475467]">{HOME.mapoSmsLabel}</p>
            {mapoSms.map((e) => (
              <p key={e.sn} className="rounded bg-[#F9FAFB] p-2 text-sm leading-relaxed text-[#344054]">
                <span className="mr-1 font-semibold">{e.at.slice(11, 16)}</span>
                <Highlight text={e.text} marks={HOME.factMapo.highlights} />
              </p>
            ))}
            <p className="mt-auto text-sm text-[#475467]">{HOME.sourceLabel} {HOME.factMapo.source}</p>
          </article>
          <article data-testid="fact-corpus" className="flex flex-col gap-2 rounded-xl border border-[#D0D5DD] bg-white p-4">
            <p className="text-base font-semibold leading-relaxed text-[#101828]">{corpusLine}</p>
          </article>
        </div>
      </section>

      {/* 두 막대 경주 */}
      {race && (
        <section className="rounded-2xl border border-[#D0D5DD] bg-[#F9FAFB] p-5">
          <Race
            safe_min={race.safe_min}
            r80_min={race.r80_min}
            arrival_rule_min={race.arrival_rule_min}
            arrival_ours_min={race.arrival_ours_min}
            alias={race.alias}
            source={race.source}
            eval_seed={race.eval_seed}
            band={raceBand()}
          />
        </section>
      )}

      {/* 가상 인물·시나리오 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-[#101828]">{HOME.scenariosTitle}</h2>
        <p className="rounded-lg border border-[#D0D5DD] bg-white px-4 py-3 text-base text-[#101828]">{HOME.personaCard}</p>
        <div className="grid gap-3 md:grid-cols-3">
          {(["sc1", "sc2", "sc3"] as ScenarioId[]).map((id) => (
            <article key={id} data-testid={`scenario-card-${id}`} className="flex flex-col gap-2 rounded-xl border border-[#D0D5DD] bg-white p-4">
              <p className="text-lg font-bold text-[#101828]">{HOME.scenarioCards[id].title}</p>
              <p className="text-[15px] text-[#475467]">{HOME.scenarioCards[id].line}</p>
              <Link
                href={`/ops?s=${id}`}
                className="mt-auto self-start rounded-md bg-[#1D4ED8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#1E40AF]"
              >
                {HOME.toOps}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* 평가 띠 */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-bold text-[#101828]">{HOME.evalTitle}</h2>
          <div className="flex items-center gap-3">
            <Link href="/lab" className="text-sm font-semibold text-[#1D4ED8] underline">{HOME.labLink}</Link>
            <Link href="/about" className="text-sm font-semibold text-[#1D4ED8] underline">{HOME.aboutLink}</Link>
            <ResetButton />
          </div>
        </div>
        <EvalBand />
      </section>

      {/* 끝 띠 */}
      <section className="flex flex-col items-center gap-4 rounded-2xl bg-[#101828] px-6 py-10 text-center text-white">
        <p className="text-4xl font-extrabold">{HOME.endBig}</p>
        <p className="text-base text-[#D0D5DD]">{HOME.endLimit}</p>
        <div className="flex w-full flex-wrap items-center justify-center gap-6">
          <a href={HOME.urlFull} className="font-extrabold tracking-tight" style={{ fontSize: "clamp(28px, 5.2vw, 64px)" }}>
            {HOME.url}
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qr.svg" alt={HOME.qrAlt} width={132} height={132} className="rounded bg-white p-2" />
        </div>
        <a href={HOME.githubUrl} target="_blank" rel="noreferrer" className="text-sm text-[#D0D5DD] underline">
          {HOME.githubLabel}
        </a>
      </section>
    </main>
  );
}
