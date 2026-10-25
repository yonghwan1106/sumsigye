"use client";
// /lab 3. 비상전원 배정 — 방법 비교표(소규모/광역/전체 탭). 값은 l4_results.json 그대로.
import { useState } from "react";
import type { L4Results } from "@/lib/types";
import { LAB_PAGE, fill } from "@/lib/copy";
import { fmtMin } from "@/components/_fmt";

const n2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
export default function L4Table({ l4, temp }: { l4: L4Results; temp: boolean }) {
  const [scope, setScope] = useState<"small" | "wide" | "all">("all");
  const t = (s: string) => (temp ? `${s} ${LAB_PAGE.measuringTemp}` : s);
  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" className="flex gap-1">
        {(["small", "wide", "all"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={scope === k}
            onClick={() => setScope(k)}
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${scope === k ? "border-[#1D4ED8] bg-[#EFF4FF] text-[#1D4ED8]" : "border-[#D0D5DD] bg-white text-[#344054]"}`}
          >
            {LAB_PAGE.l4Tabs[k]}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#D0D5DD] text-left text-[#475467]">
              {LAB_PAGE.l4Cols.map((c) => <th key={c} className="px-2 py-1.5 font-semibold">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {l4.methods.map((m) => {
              const a = m[scope];
              const ours = m.id === "ours";
              return (
                <tr key={m.id} className={`border-b border-[#EAECF0] ${ours ? "bg-[#EFF4FF] font-semibold" : ""}`}>
                  <td className="px-2 py-1.5">{m.label}</td>
                  <td className="px-2 py-1.5">{t(`${fill(LAB_PAGE.unitHouse, { v: n2(a.interrupted_mean) })} (${fill(LAB_PAGE.ci, { lo: n2(a.ci[0]), hi: n2(a.ci[1]) })})`)}</td>
                  <td className="px-2 py-1.5">{fmtMin(a.ei_mean)}</td>
                  <td className="px-2 py-1.5">{n2(a.violations_mean)}</td>
                  <td className="px-2 py-1.5">{n2(a.energy_short_mean)}</td>
                  <td className="px-2 py-1.5">{Math.round(a.unknown_share * 100)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
