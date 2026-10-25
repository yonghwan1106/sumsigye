// 헝가리안(최소 비용 완전 배정, O(n³)). 입력 n × m(n ≤ m) 정수 행렬 → 행부족분은 0행을 더해 정방으로 푼다.
// 반환: 원래 행 i에 배정된 열 번호.
export function hungarian(costs: number[][]): number[] {
  const n0 = costs.length;
  if (n0 === 0) return [];
  const m = costs[0].length;
  if (m < n0) throw new Error("hungarian: columns must be >= rows");
  const n = m; // 정방으로
  const a = (i: number, j: number) => (i <= n0 ? costs[i - 1][j - 1] : 0);
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = a(i0, j) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array<number>(n0).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] >= 1 && p[j] <= n0) ans[p[j] - 1] = j - 1;
  return ans;
}
