# 機能網羅（kitchen sink）— 移行確認用

> **これは納品物の見本ではありません。** 業務らしさが要る見本は別に2本あります
> （[マスタメンテ](../master-maintenance-prj/) / [受注入力](../order-entry-prj/)）。
> こちらの役目は2つだけです。

| | |
|---|---|
| **① 1.0 の前に全部いちど動かす** | 一度も動かしたことのないキーを凍らせるのが、いちばん高くつく間違いなので |
| **② 版を上げたときの影響を1か所で見る** | 出力を固定してあるので、`hatake.version` を上げて回すと**差分がそのまま移行手順書**になる |
| **③ Renderer を差し替えても案件が変わらないことを示す** | **同じ定義**を Flutter・Vue・React の3つで描いて、同じ項番の証跡を並べる |

## 網羅できているか（機械が数える）

```bash
cd ../../../dsl-ui/typescript
node tool/check-coverage.mjs --from ../spec/examples/*.yaml \
  ../../hatake-example/apps/*/definitions/app.yaml
```

```
(ノード, キー) は 270 組。書かれている 270 ／ 除外 0 ／ **まだ一度も書かれていない 0**（100.0%）
```

**キー名ではなく (ノード, キー) の組で数えます。** `roles` は
項目・列・ボタン・メニュー・カード・画面の6か所に書けるので、1か所で書いても
残り5か所を試したことにはならないからです。

0.9.23 で増えた 15 組（画面の `roles`・`search.fixed`・絞り込みの `defaultValue`・
`optionsSource.copy`・列の `optionsSource` など）は、受注入力とこの見本で埋めました。

## 動かす

```bash
docker compose up
```

**同じ定義を3つの Renderer で描いたものが、同時に上がります。**

| | 画面 | 描いているもの |
|---|---|---|
| Flutter | <http://localhost:8083> | [`flutter-src/`](flutter-src/) |
| Vue | <http://localhost:8084> | [`vue-src/`](vue-src/) |
| React | <http://localhost:8085> | [`react-src/`](react-src/) |

API は <http://localhost:3003>（3つとも**同じ API・同じ定義**を見ます）。

3つとも**画面のコードは1行も書いていません**。案件が書いたのは4つだけで、
うち `actions.ts` と `sinks.ts` は **Vue 版と React 版で1文字も違いません**
（`diff vue-src/src/actions.ts react-src/src/actions.ts` が通ります）。

| ファイル | 何を書いたか |
|---|---|
| `src/main.*` | 定義をどこから読むか・Repository の道・`plugin:` の中身・出す口 |
| `src/actions.ts` | `plugin:` と書いたボタンの中身（一括の2つだけ。保存は組み込み） |
| `src/sinks.ts` | CSV と印刷の出し先 |
| `nginx.conf` | 画面と `/api` を同じ所から配る |

DB は要りません（決め打ちの値を返すモック）。**認証も持ちません** ──
役割は URL で切り替えます:

| URL | 見えるもの |
|---|---|
| `?role=tester` | 一括は押せる。持ち出し（CSV・印刷）と「見せる相手で変わる」の新規登録は出ない |
| `?role=admin` | 全部。区切りも大きい（5 → 8） |

8画面とも画面の `roles` は `[tester, admin]`（どちらも開ける）。閉じると「tester には
何が出ないか」の証跡が撮れなくなるので、**画面の門が実際に効く所は受注入力**で見ます
（ダッシュボードは管理者だけ）。

（どの口でも同じです。例: <http://localhost:8085/?role=admin>）

## 画面は「確かめたいこと」で分けてある

業務で分けると、落ちたときにどこが悪いか分かりません。

| 画面 | 確かめたいこと |
|---|---|
| 条件の組み合わせ | `all` / `any` / `not` と**入れ子**、`defaultValue` |
| 押す前に聞く | `prompt` / `batchSize` / `enabledWhen` / `open: tab` / `onSuccess.page`、いつも掛ける条件（`search.fixed`＝しまったものは出さない） |
| 選択肢の連動 | `optionsSource.parentKey` / `limit` / `copy`、名前を引く列（列の `optionsSource`）、検索欄の `defaultValue`、`pagination.enabled: false` |
| 畳み込み | `computed.sort` / `limit` / `overflow`、詳細のボタン |
| ステップ入力 | ウィザードの `actions`、条件で飛ばすステップ |
| 帳票（降順） | `report.sort.ascending: false`、持ち出しは `roles` |
| 見せる相手で変わる | 列・ボタン・項目の `roles`（新規登録も admin だけ）、`readOnlyWhen` / `requiredWhen` |
| カードの盛り合わせ | ダッシュボードのカード3種と `span`、カードごとの `roles`・固定条件 |

## 3つの Renderer が同じものを出しているか（機械が突き合わせる）

`bash tools/run-tests.sh screen` が、同じ項番の証跡を Renderer の数だけ撮って、
さらに**印（`data-hatake`）・クラス名・字**を突き合わせます。

| 紙 | 中身 |
|---|---|
| `docs/4-テスト/出力-画面テスト結果.md` | Flutter 版（座標で押す） |
| `docs/4-テスト/出力-画面テスト結果-Vue.md` | Vue 版 |
| `docs/4-テスト/出力-画面テスト結果-React.md` | React 版 |
| `docs/4-テスト/出力-Renderer比較.md` | **Vue と React の突き合わせ**（10 画面） |

スクリーンショットは証拠ですが、比べる相手としては弱いものです（余白が 1px
動いただけで「違う」になるし、中身が違っても見た目が似ていれば気づけない）。
突き合わせるのは**契約になっている3つ**——印・クラス名・字——で、ここが揃って
いなければ、載せ替えた案件の CSS と画面の試験が黙って壊れます。

## 版を上げるとき（本題）

```bash
# 1. pin を上げる
vi flutter-src/pubspec.yaml node-src/package.json

# 2. 作り直して、差分を見る
node tools/build-design-docs.mjs --check     # 人に見せる文言が変わったか
bash tools/refresh-docs.sh --check           # 読み返し・助言・問いが変わったか
bash tools/run-tests.sh                      # 値と画面が変わったか
```

**`--check` が出した差分が、そのまま移行で見るべき所です。**
「まだビルドが通る」だけでは、何が変わったか分かりません。

## この見本で見つけたもの

作って動かした初回で、フレームワークの不具合が**2件**出ました。
どちらも `hatake check` は警告0・助言0で通していたものです。

| | 何が起きていたか |
|---|---|
| 1 | 詳細画面が **`id` という名前の引数しか**鍵として読まなかった（`params: { itemCode: … }` では開いても空。API を1本も投げない） |
| 2 | `key: [a, b]`（複合キーのつもり）が**検証 exit 0 で素通り**していた |

→ 0.9.3 で直り、助言2つ（`navigate-without-key-param` / `detail-page-in-menu`）も
足しました。複合キーはそのあと **0.9.7 で入りました**（`key: [orderNo, lineNo]`）。
この見本の画面はどれも鍵が1つなので、書いていません。

0.9.23 に上げたときにも、この見本のモックで1件見つけています（枠組みではなく
こちらの作りの穴）:

| | 何が起きていたか |
|---|---|
| 3 | 書き込みの口が**いつも combo_form の入力枠**で受けていた＝選択肢の連動の画面から保存すると、名前もグループも黙って捨てていた。いまは送ってきた項目を一番多く受け取れる画面で受ける（`acceptRecordIn`） |
