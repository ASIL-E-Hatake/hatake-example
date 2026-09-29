import { defineConfig } from "vite";

// **Vue の SFC を使わない**ので、プラグインは1つも要らない（描画関数で書いてある
// 枠組みをそのまま使う）。案件が足すのはここだけ。
export default defineConfig({
  build: { outDir: "dist" },
});
