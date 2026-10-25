"use client";
// 「시나리오 초기화」(구현명세 §8-1) — 확인 「저장된 승인·입력을 모두 지웁니다」 뒤 브라우저 상태를 모두 지운다(lib/state/store).
import { useState } from "react";
import { HOME } from "@/lib/copy";
import { resetAll } from "@/lib/state/store";

export default function ResetButton() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid="btn-reset"
      onClick={() => {
        if (typeof window !== "undefined" && window.confirm(HOME.resetConfirm)) {
          resetAll();
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        }
      }}
      className="rounded-md border border-[#D0D5DD] bg-white px-3 py-1.5 text-sm font-semibold text-[#344054] hover:bg-[#F9FAFB]"
    >
      {HOME.reset}
      {done ? " ✓" : ""}
    </button>
  );
}
