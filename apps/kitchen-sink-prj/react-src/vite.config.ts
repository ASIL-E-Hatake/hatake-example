import { defineConfig } from "vite";

// **プラグインは1つも要らない。** Vite の中の esbuild が `.tsx` をそのまま扱うので、
// `tsconfig.json` に `"jsx": "react-jsx"` と書けば足りる（Vue 版も同じ考え方で、
// SFC を使わないからプラグインが要らない）。
//
// `@vitejs/plugin-react` は**書きかけを差し替える仕組み**（Fast Refresh）のための
// もので、配るものを作るのには要らない。**依存を増やさない**方針そのもの。
export default defineConfig({
  build: { outDir: "dist" },
});
