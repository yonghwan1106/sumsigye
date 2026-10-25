// mulberry32 — 구현명세 §4-2가 가리키는 `lib/synth/rng.ts`(B 소유)와 같은 표준 알고리즘.
// A 묶음 스크립트가 B 파일이 생기기 전에 돌아야 해서 같은 식을 여기에 둔다.
// TODO(B): lib/synth/rng.ts의 mulberry32와 출력이 같은지 tests/l1.test.ts가 대조한다(파일이 생기면).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
