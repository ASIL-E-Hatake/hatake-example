# 機能網羅（React 版）

同じ [`definitions/app.yaml`](../definitions/app.yaml) を、**描く側だけ変えて**出したもの。
Flutter 版（[`flutter-src/`](../flutter-src/)）・Vue 版（[`vue-src/`](../vue-src/)）と
**同じ定義・同じ API・同じ証跡の項番**で、違うのは Renderer だけ。

**画面のコードは1行も書いていない。** 案件が書いたのは4つだけ:

| ファイル | 何を書いたか |
|---|---|
| [`src/main.tsx`](src/main.tsx) | 定義をどこから読むか・Repository の道・`plugin:` の中身・出す口 |
| [`src/actions.ts`](src/actions.ts) | `plugin:` と書いたボタンの中身 |
| [`src/sinks.ts`](src/sinks.ts) | CSV と印刷の出し先 |
| [`nginx.conf`](nginx.conf) | 画面と `/api` を同じ所から配る |

**`actions.ts` と `sinks.ts` は Vue 版と1文字も違わない**（`diff` が通る）。どちらも
枠組みの型（`ActionHandler` / `ExportSink`）しか見ていないので、描く側が変わっても
業務の側は書き直さずに済む —— それがこの見本で確かめたいこと。

違うのは `main.tsx` だけで、そこも**数えるだけの小窓**のぶん（React は「変わった」と
言われないと描き直さないので `useSyncExternalStore` で繋ぐ）。業務には要らない所。

## 足していないもの

- **`@vitejs/plugin-react` を入れていない。** Vite の中の esbuild が `.tsx` を
  そのまま扱うので、`tsconfig.json` に `"jsx": "react-jsx"` と書けば足りる。
  あのプラグインは**書きかけを差し替える仕組み**のためのもので、配るものを作るのに
  は要らない（**依存を増やさない**方針そのもの）。
- **UI ライブラリを入れていない。** 見た目は `@hatake-fw/runtime/hatake.css`
  （素の CSS）で、案件は CSS 変数かクラス名で上書きする。Vue 版と**同じクラス名**を
  出すので、見た目を作り直さずに Renderer を差し替えられる。

## 動かす

```
docker compose up
```

<http://localhost:8085>（Vue 版は 8084、Flutter 版は 8083）。役割は `?role=admin`。

## Release より先の枠組みで動かすとき

`package.json` は**出ている Release の tarball**を指している。まだ出ていない版で
試すときは、枠組み側で固めたものを `.local/` に置いて、そこから入れる:

```bash
# 枠組みのリポジトリで
cd typescript && npm pack --pack-destination <ここ>/.local
cd ../web/runtime && npm pack --pack-destination <ここ>/.local
cd ../http && npm pack --pack-destination <ここ>/.local
cd ../react19 && npm pack --pack-destination <ここ>/.local
```

```bash
npm install .local/hatake-fw-*.tgz
npm run build
```

`.local/` は git に入れない（[.gitignore](.gitignore)）。**配るのは Release の URL を
指した package.json のほう**で、こちらは手元で先に試すための道。
