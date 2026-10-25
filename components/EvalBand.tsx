// 평가 띠 3개 (구현명세 §8-4) — /·/ops 위 띠 공용. 누르면 /lab 해당 절로 간다.
// 값은 data/eval/*.json에서만(components/evalText.ts). 확정 전에는 「측정 중」.
import Link from "next/link";
import { l1Band, l2Band, l4Band } from "@/components/evalText";

export default function EvalBand(props: { compact?: boolean; className?: string }) {
  const items = [l1Band(), l2Band(), l4Band()];
  const anchor = { l1: "#lab-l1", l2: "#lab-l2", l4: "#lab-l4" } as const;
  return (
    <ul className={`flex w-full flex-wrap gap-2 ${props.className ?? ""}`}>
      {items.map((it) => (
        <li key={it.key} className="min-w-0 flex-1 basis-[260px]">
          <Link
            href={`/lab${anchor[it.key]}`}
            data-testid={`eval-band-${it.key}`}
            className={`block h-full rounded-lg border px-3 py-2 ${props.compact ? "text-sm" : "text-[15px]"} leading-snug hover:bg-[#F9FAFB] ${
              it.measuring ? "border-[#D0D5DD] text-[#475467]" : "border-[#1D4ED8]/40 text-[#101828]"
            }`}
          >
            {it.text}
          </Link>
        </li>
      ))}
    </ul>
  );
}
