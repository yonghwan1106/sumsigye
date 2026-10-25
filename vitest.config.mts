import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// "@/..." 경로 별칭(tsconfig paths와 같음). 다른 시험은 상대 경로를 써도 된다.
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
