// 첫 화면 `/` — C1a 자리표시. 본 화면은 C5b가 구현명세 §8-1대로 만든다.
import { COMMON, HOME } from "@/lib/copy";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <p className="rounded bg-[#F2F4F7] px-3 py-2 text-sm text-[#475467]">{COMMON.syntheticBand}</p>
      <h1 className="text-5xl font-bold">
        {COMMON.serviceName} <span className="text-2xl font-medium text-[#475467]">{COMMON.tagline}</span>
      </h1>
      <p data-testid="hero-oneliner" className="text-xl leading-relaxed">{HOME.heroOneliner}</p>
      <p className="text-base text-[#475467]">{HOME.implNote}</p>
      <p className="text-sm text-[#667085]">{COMMON.reference}</p>
    </main>
  );
}
