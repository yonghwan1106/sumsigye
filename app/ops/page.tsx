// ② 운영자 화면 /ops?s=sc1|sc2|sc3 (구현명세 §8-2). 시나리오 묶음은 서버에서 읽어 클라이언트에 넘긴다.
import type { Metadata } from "next";
import OpsClient from "@/components/ops/OpsClient";
import { loadScenario, parseScenarioId } from "@/components/ops/loadScenario";
import { COMMON, OPS } from "@/lib/copy";

export const metadata: Metadata = { title: `${OPS.priorityTitle} · ${COMMON.logoFull}` };

export default async function OpsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const id = parseScenarioId(sp.s);
  const { bundle, smsL1, stub } = loadScenario(id);
  return <OpsClient key={id} bundle={bundle} smsL1={smsL1} stub={stub} />;
}
