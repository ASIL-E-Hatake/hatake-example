# 工程ごとに何を用意するか（機能網羅）

**この案件は納品物の見本ではありません。** 紙も最小限で、
[1本目](../../master-maintenance-prj/docs/README.md) のような
「客先に出す一式」は狙っていません。

| 紙 | 誰が作るか |
|---|---|
| [案件の説明](1-要件定義/案件の説明.md) | **人**（なぜこの見本を作るか） |
| [2-設計/](2-設計/) | **道具**（定義から生成。`node tools/build-design-docs.mjs`） |
| `出力-*.txt` | **道具**（`bash tools/refresh-docs.sh`） |
| [4-テスト/](4-テスト/) | **道具**（`bash tools/run-tests.sh`） |

## 版を上げたときに見る所

この案件の本題です。**`--check` が出した差分が、そのまま移行で見るべき所**になります。

| 何が変わったか | 出す道具 |
|---|---|
| 解析結果・人に見せる文言 | `node tools/build-design-docs.mjs --check` |
| 読み返し・助言・残っている問い | `bash tools/refresh-docs.sh --check` |
| 値の計算と検証／画面の見た目 | `bash tools/run-tests.sh` |

**「まだビルドが通る」だけでは確認になりません。** 何が変わったかが出ないからです。

## 網羅できているか

フレームワーク側の台帳で数えます（この案件の紙ではなく、あちらの道具）。

```bash
node tool/check-coverage.mjs --check
```
