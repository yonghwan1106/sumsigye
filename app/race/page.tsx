// ⑥ 두 막대 경주 캡처 `/race?s=sc1[&state=empty]` (구현명세 §8-6). 값은 엔진 계산 결과(components/scenarioData.ts)에서만.
import type { Metadata } from "next";
import Race from "@/components/Race";
import { raceBand } from "@/components/evalText";
import { heroRace, parseId } from "@/components/scenarioData";
import { COMMON, RACE } from "@/lib/copy";

export const metadata: Metadata = { title: `${RACE.title} · ${COMMON.logoFull}` };

export default async function RacePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const id = parseId(sp.s);
  const empty = (Array.isArray(sp.state) ? sp.state[0] : sp.state) === "empty";
  const v = heroRace(id);
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center gap-4 px-8 py-6">
      {v ? (
        <Race
          safe_min={v.safe_min}
          r80_min={v.r80_min}
          arrival_rule_min={v.arrival_rule_min}
          arrival_ours_min={v.arrival_ours_min}
          alias={v.alias}
          source={v.source}
          eval_seed={v.eval_seed}
          empty={empty}
          band={empty ? null : raceBand()}
        />
      ) : (
        <p className="text-xl text-[#475467]">{RACE.resultNone}</p>
      )}
    </main>
  );
}
