# 機能網羅（Vue 版）

同じ [`definitions/app.yaml`](../definitions/app.yaml) を、**描く側だけ変えて**出したもの。
Flutter 版（[`flutter-src/`](../flutter-src/)）と**同じ定義・同じ API・同じ証跡の項番**で、
違うのは `@hatake-fw/material`（Flutter）か `@hatake-fw/vue3`（ブラウザ）かだけ。

**画面のコードは1行も書いていない。** 案件が書いたのは3つだけ:

| ファイル | 何を書いたか |
|---|---|
| [`src/main.ts`](src/main.ts) | 定義をどこから読むか・Repository の道・`plugin:` の中身・出す口 |
| [`src/actions.ts`](src/actions.ts) | `plugin:` と書いたボタンの中身（一括の2つだけ。保存は組み込み） |
| [`nginx.conf`](nginx.conf) | 画面と `/api` を同じ所から配る |

## 動かす

```
docker compose up
```

Flutter 版が <http://localhost:8083>、この Vue 版が <http://localhost:8084>。
**両方同時に上がる**ので、並べて見られる。役割は `?role=admin` で切り替わる。

## Release より先の枠組みで動かすとき

`package.json` は**出ている Release の tarball**を指している。まだ出ていない版で
試すときは、枠組み側で固めたものを `.local/` に置いて、そこから入れる:

```bash
# 枠組みのリポジトリで
cd typescript && npm pack --pack-destination <ここ>/.local
cd ../web/runtime && npm pack --pack-destination <ここ>/.local
cd ../http && npm pack --pack-destination <ここ>/.local
cd ../vue3 && npm pack --pack-destination <ここ>/.local
```

```bash
npm install .local/hatake-fw-*.tgz
npm run build
```

`.local/` は git に入れない（[.gitignore](.gitignore)）。**配るのは Release の URL を
指した package.json のほう**で、こちらは手元で先に試すための道。
