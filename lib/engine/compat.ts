// 하드 제약(호환 필터) — 설계서 §4-4-2. 하나라도 어기면 후보에서 빼고 사유를 남긴다.
import type { DeviceSpec, EngineParams, ExclusionReason, Resource } from "../types";
import { UNKNOWN_DEVICE_NEED_W } from "./params";

export interface CompatResult { ok: boolean; reason?: ExclusionReason; need_w?: number }

/** 기기의 요구 연속 출력(W): 피크가 있으면 피크, 없으면 산소발생기 = 정격 × 2, 그 밖 = 정격 × 1.25. 기기 모름 = 640W. */
export function needW(device: DeviceSpec | null, p: EngineParams): number {
  if (!device) return UNKNOWN_DEVICE_NEED_W;
  if (device.p_peak_w != null) return device.p_peak_w;
  const isO2 = device.id === "O2_STAT" || device.id === "O2_PORT";
  return device.p_rated_w * (isO2 ? p.o2_peak_mult : p.peak_margin);
}

export function compat(device: DeviceSpec | null, r: Resource, p: EngineParams): CompatResult {
  if (!r.available) return { ok: false, reason: "unavailable" };
  if (r.soc <= p.soc_min) return { ok: false, reason: "low_soc" };
  if (r.output === "AC_UNKNOWN") return { ok: false, reason: "waveform_unknown" };
  if (r.output === "FAMILY") {
    // 전용 배터리는 같은 계열만. 기기 모름 가구는 「모든 기기에 맞는 전원」(정현파 AC·640W 이상)만 후보.
    if (!device || device.family !== r.family) return { ok: false, reason: "connector" };
    return { ok: true };
  }
  // AC_SINE
  if (device && !device.inputs.includes("AC")) return { ok: false, reason: "input_mismatch" };
  const need = needW(device, p);
  if (r.cont_w == null || r.cont_w < need) return { ok: false, reason: "power_short", need_w: need };
  return { ok: true };
}
