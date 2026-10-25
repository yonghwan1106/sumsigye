"use client";
// 기기 화면 그림(SVG, 구현명세 §8-1) — 실제 제품 사진이 아닌 직접 그린 예시 화면.
// 「남은 시간 3:10」이 1초마다 1분씩 줄고, 0:10에 닿으면 3:10으로 돌아간다(자정을 넘지 않게 반복).
import { useEffect, useState } from "react";
import { HOME } from "@/lib/copy";

const START = 190; // 3:10
const END = 10;

export default function DeviceIllustration({ width = 320 }: { width?: number }) {
  const [m, setM] = useState(START);
  useEffect(() => {
    const id = window.setInterval(() => setM((v) => (v - 1 < END ? START : v - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);
  const label = HOME.deviceIllustration.line2.replace("3:10", `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
  return (
    <figure data-testid="device-illustration" className="relative m-0" style={{ width }}>
      <svg viewBox="0 0 320 220" className="w-full" role="img" aria-label={`${HOME.deviceIllustration.line1} ${label}`}>
        <rect x="6" y="6" width="308" height="208" rx="22" fill="#1D2939" />
        <rect x="24" y="24" width="272" height="150" rx="10" fill="#0B1220" />
        <g transform="translate(44 50)">
          <rect x="0" y="0" width="46" height="22" rx="3" fill="none" stroke="#FDB022" strokeWidth="3" />
          <rect x="46" y="7" width="5" height="8" rx="1" fill="#FDB022" />
          <rect x="4" y="4" width={Math.max(2, (38 * m) / START)} height="14" rx="1.5" fill="#FDB022" />
        </g>
        <text x="104" y="68" fill="#FEF0C7" fontSize="17" fontWeight="600">{HOME.deviceIllustration.line1}</text>
        <text x="44" y="132" fill="#FFFFFF" fontSize="40" fontWeight="700" style={{ fontVariantNumeric: "tabular-nums" }}>{label}</text>
        <circle cx="70" cy="196" r="7" fill="#475467" />
        <circle cx="160" cy="196" r="7" fill="#475467" />
        <circle cx="250" cy="196" r="7" fill="#475467" />
      </svg>
      <figcaption className="absolute right-3 top-2 rounded bg-white/85 px-1.5 text-sm font-medium text-[#475467]">
        {HOME.deviceIllustration.corner}
      </figcaption>
    </figure>
  );
}
