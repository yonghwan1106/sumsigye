// 도착·공급 시간(가정값) — 설계서 §4-4-3.
import type { DeviceSpec, EngineParams, Household, Resource } from "../types";
import { UNKNOWN_DEVICE_RATED_W } from "./params";

export type WeatherNow = { precip_mm: number; wind_ms: number; temp_c: number } | null | undefined;

export function weatherFactor(w: WeatherNow, p: EngineParams): number {
  if (!w) return 1;
  let f = 1;
  if (w.precip_mm > 0) f *= p.rain_factor;
  if (w.wind_ms >= p.wind_threshold_ms) f *= p.wind_factor;
  return f;
}

/** 도착 a(분) = 출동 준비 + 직선거리 × 1.3 ÷ 속도 × 60 × 기상 계수. */
export function arrival(h: Pick<Household, "x_km" | "y_km">, r: Pick<Resource, "x_km" | "y_km">, urban: boolean, weather: WeatherNow, p: EngineParams): number {
  const dist = Math.hypot(h.x_km - r.x_km, h.y_km - r.y_km);
  const v = urban ? p.speed_urban_kmh : p.speed_rural_kmh;
  return p.prep_min + (dist * p.road_factor / v) * 60 * weatherFactor(weather, p);
}

/** 공급 C(분): 정현파 AC = 에너지 × 잔량 × 0.85 ÷ 정격 전력 × 60(기기 모름 = 320W), 전용 배터리 = rb_minutes × 잔량. */
export function supply(device: DeviceSpec | null, r: Resource, p: EngineParams): number {
  if (r.output === "AC_SINE") {
    const w = device ? device.p_rated_w : UNKNOWN_DEVICE_RATED_W;
    if (!r.energy_wh || w <= 0) return 0;
    return r.energy_wh * r.soc * p.conv_eff / w * 60;
  }
  if (r.output === "FAMILY") return (r.rb_minutes ?? 0) * r.soc;
  return 0;
}
