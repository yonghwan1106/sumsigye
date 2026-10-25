"use client";
// 공통 머리띠 (구현명세 §8-1): 로고+꼬리표 · 합성 띠(모든 화면) · 모드 배지 · 참고용.
// /poster(고정 캔버스 캡처)에서는 그리지 않는다. /home은 휴대전화 틀 안에 합성 띠가 따로 있어 여기서는 띠를 뺀다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { COMMON } from "@/lib/copy";

function ModeBadge() {
  const [mode, setMode] = useState<"ai" | "demo" | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => alive && setMode(j?.mode === "ai" ? "ai" : "demo"))
      .catch(() => alive && setMode("demo"));
    return () => {
      alive = false;
    };
  }, []);
  if (!mode) return <span className="h-6 w-24" aria-hidden />;
  return (
    <span
      data-testid="mode-badge"
      className={`rounded-full sm:whitespace-nowrap px-2.5 py-0.5 text-sm font-semibold ${
        mode === "ai" ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#F2F4F7] text-[#344054]"
      }`}
    >
      {COMMON.modeBadge[mode]}
    </span>
  );
}

export default function SiteHeader() {
  const path = usePathname() ?? "/";
  if (path.startsWith("/poster")) return null;
  const isHome = path.startsWith("/home");
  return (
    <header className="w-full border-b border-[#EAECF0] bg-white">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5">
        <Link href="/" className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-lg font-bold text-[#101828]">{COMMON.serviceName}</span>
          <span className="text-sm font-medium text-[#475467]">| {COMMON.tagline}</span>
        </Link>
        {!isHome && <p className="min-w-0 flex-1 text-sm leading-snug text-[#475467]">{COMMON.syntheticBand}</p>}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <ModeBadge />
          <span className="text-sm text-[#667085] sm:whitespace-nowrap">{COMMON.reference}</span>
        </div>
      </div>
    </header>
  );
}
