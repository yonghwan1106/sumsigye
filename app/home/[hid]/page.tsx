// ③ 보호자 화면 /home/[hid]?s=sc1[&frame=1] (구현명세 §8-3).
import type { Metadata } from "next";
import HomeClient from "@/components/home/HomeClient";
import { loadScenario, parseScenarioId } from "@/components/ops/loadScenario";
import { COMMON, GUARDIAN } from "@/lib/copy";

export const metadata: Metadata = { title: `${GUARDIAN.registerTitle} · ${COMMON.logoFull}` };

export default async function HomePage(props: { params: Promise<{ hid: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { hid } = await props.params;
  const sp = await props.searchParams;
  const id = parseScenarioId(sp.s);
  const frame = (Array.isArray(sp.frame) ? sp.frame[0] : sp.frame) === "1";
  const { bundle, smsL1 } = loadScenario(id);
  const safeHid = /^H\d{2}$/.test(hid) ? hid : "H01";
  return <HomeClient key={`${id}-${safeHid}`} bundle={bundle} smsL1={smsL1} hid={safeHid} frame={frame} />;
}
