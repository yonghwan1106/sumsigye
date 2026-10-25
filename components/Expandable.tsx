"use client";
// [크게 보기] 겹침 확대 (구현명세 §8-0·§8-2) — 공용.
// 같은 DOM 노드를 겹침으로 옮겨 키운다(내용을 두 번 그리지 않으므로 data-testid가 겹치지 않는다).
// 확대 배율 1.35~1.6, 내용은 화면 위 78% 안(아래 22%는 자막 자리로 비움). 「닫기」 버튼·Esc로 닫는다.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { OPS } from "@/lib/copy";

export interface ExpandableProps {
  /** 버튼 data-testid (예: "btn-expand-event") */
  testId: string;
  /** 패널 data-testid (예: "panel-event") — 감싸는 div에 붙는다 */
  panelTestId?: string;
  title?: string;
  children: ReactNode;
  className?: string;
  minScale?: number;
  maxScale?: number;
}

export default function Expandable(props: ExpandableProps) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1.35);
  const [placeholderH, setPlaceholderH] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const minS = props.minScale ?? 1.35;
  const maxS = props.maxScale ?? 1.6;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // 열 때 원래 자리 높이를 남겨 레이아웃이 흔들리지 않게 하고, 화면 위 78%·가로 92%에 맞는 배율을 고른다.
  useLayoutEffect(() => {
    if (!open || !innerRef.current) return;
    const el = innerRef.current;
    const w = el.scrollWidth || 1;
    const h = el.scrollHeight || 1;
    const fit = Math.min((window.innerWidth * 0.92) / w, (window.innerHeight * 0.78 - 56) / h);
    setScale(Math.max(minS, Math.min(maxS, fit)));
  }, [open, minS, maxS]);

  const toggleOpen = () => {
    if (!open && boxRef.current) setPlaceholderH(boxRef.current.offsetHeight);
    setOpen((v) => !v);
  };

  return (
    <>
      {open && <div aria-hidden style={{ height: placeholderH ?? 0 }} />}
      <div
        ref={boxRef}
        data-testid={props.panelTestId}
        className={open ? "fixed inset-0 z-50 flex flex-col items-center bg-white/95" : `relative ${props.className ?? ""}`}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? props.title : undefined}
      >
        <div className={open ? "flex w-full justify-end px-6 pt-3" : "absolute right-2 top-2 z-10"}>
          <button
            type="button"
            data-testid={props.testId}
            onClick={toggleOpen}
            className="rounded-md border border-[#D0D5DD] bg-white px-3 py-1 text-sm font-semibold text-[#344054] hover:bg-[#F9FAFB]"
          >
            {open ? OPS.close : OPS.expand}
          </button>
        </div>
        <div
          className={open ? "w-full overflow-auto" : ""}
          style={open ? { maxHeight: "calc(78vh - 56px)" } : undefined}
        >
          <div
            ref={innerRef}
            style={
              open
                ? { transform: `scale(${scale})`, transformOrigin: "top center", width: `${100 / scale}%`, margin: "0 auto" }
                : undefined
            }
          >
            {props.children}
          </div>
        </div>
      </div>
    </>
  );
}
