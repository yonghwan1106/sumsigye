// ⑦ 대표 이미지 `/poster?ratio=16x9|1x1` (구현명세 §8-6). 1920×1080 / 1080×1080 고정 캔버스, 머리띠 없음(SiteHeader가 숨긴다).
// 오른쪽(아래) Race는 숨시계 쪽만. 실제 제품·환자·뉴스 사진 없음.
import type { Metadata } from "next";
import Race from "@/components/Race";
import { heroRace } from "@/components/scenarioData";
import { COMMON, RACE } from "@/lib/copy";

export const metadata: Metadata = { title: `${COMMON.logoFull}` };

export default async function PosterPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const square = (Array.isArray(sp.ratio) ? sp.ratio[0] : sp.ratio) === "1x1";
  const W = square ? 1080 : 1920;
  const H = 1080;
  const v = heroRace();
  const race = v ? (
    <Race
      safe_min={v.safe_min}
      r80_min={v.r80_min}
      arrival_rule_min={v.arrival_rule_min}
      arrival_ours_min={v.arrival_ours_min}
      alias={v.alias}
      source={v.source}
      eval_seed={v.eval_seed}
      side="ours"
      size="lg"
      animate={false}
      band={null}
    />
  ) : null;
  return (
    <main className="flex items-start justify-start bg-white">
      <div
        data-testid="poster"
        className={`relative flex overflow-hidden bg-white ${square ? "flex-col" : "flex-row"}`}
        style={{ width: W, height: H }}
      >
        <div
          className="flex flex-col justify-center gap-6 bg-[#101828] text-white"
          style={square ? { height: H * 0.42, padding: "64px 72px" } : { width: W * 0.4, padding: "96px 88px" }}
        >
          <p className="font-extrabold leading-none tracking-tight" style={{ fontSize: square ? 128 : 150 }}>{COMMON.serviceName}</p>
          <p className="font-bold text-[#FDB022]" style={{ fontSize: square ? 44 : 52 }}>{COMMON.tagline}</p>
          <p className="leading-snug text-[#EAECF0]" style={{ fontSize: square ? 30 : 34 }}>{RACE.posterSub}</p>
        </div>
        <div className="flex flex-1 flex-col justify-center" style={{ padding: square ? "40px 64px" : "80px 88px" }}>
          {race}
        </div>
        <span className="absolute bottom-6 right-8 rounded-md bg-[#F2F4F7] px-3 py-1 text-2xl font-semibold text-[#475467]">
          {RACE.posterCorner}
        </span>
      </div>
    </main>
  );
}
