# API テスト結果（実行記録）

> **この紙は生成物です。** `tests/api/run.mjs` が実際に API を叩いて、
> **やりとりをそのまま**書き出しています（手で直さない）。
> 作り直し: `bash tools/run-tests.sh`

- 実行日時: 2026-09-25T00:59:14.129Z
- 対象: `http://localhost:3003/api`
- 前提: `docker compose up` で DB が初期データの状態

> **順番に意味があります。** A-07 と A-08 がデータを変えるので、最後の A-10 で初期状態に戻しています（次に回す人のため）。

## まとめ（10 / 10 件）

| 項番 | 内容 | 結果 | HTTP |
|---|---|---|---|
| A-01 | 画面の定義を配っている | OK | 200 |
| A-02 | 定義に書いた条件で絞れる（前方一致） | OK | 200 |
| A-03 | 定義に書いていない項目では絞れない | OK | 200 |
| A-04 | 選択肢は親で絞られる | OK | 200 |
| A-05 | 帳票の並べ替えが届く（降順） | OK | 200 |
| A-06 | 画面と同じ検証がサーバでも効く | OK | 400 |
| A-07 | 押す前に聞いた値が届く | OK | 200 |
| A-08 | 一括は1件ずつ確定し、失敗した行だけ名指しで返す | OK | 200 |
| A-09 | 持ち出しは admin だけ（役割はサーバでも見る） | OK | 200 |
| A-10 | 初期状態に戻せる（何度回しても同じ結果になる） | OK | 200 |

---

## 1件ごとの記録

### A-01 画面の定義を配っている

- **確かめたいこと**: 画面は定義のコピーを持たない（同じ1枚を読む）
- **期待**: 200・YAML が返る
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3003/api/definition.yaml
```

**返ってきたもの**

```json
HTTP 200
# yaml-language-server: $schema=https://github.com/ASIL-E-Hatake/hatake/raw/main/spec/hatake-page.schema.json
#
# 機能網羅（kitchen sink）— **業務のふりをしない**定義。
#
# 目的は1つ: **DSL のどのキーも、一度は書いて動かした状態にする**。
# 単体試験が在ることと、通しで動くアプリで書かれたことは別で、外から使って出た
# 不具合はどれも「3版の試験が全部緑の状態」で存在していた。
#
# だから画面は**業務ではなく「確かめたいこと」で分けてある**。落ちたときに
# どの画面かで原因が分かるようにするため。
#
#   combo_form    条件の組み合わせ（all / any / not）と既定値
#   press_list    押す前に聞く・区切って実行・行の有効条件・別タブ・成功後に移動
#   linked_master 選択肢の連動（親で絞る）とページ送りを切る
#   fold_detail   畳み込みの並べ替え・打ち切り・詳細のボタン
#   steps_wizard  ウィザードのボタン
#   sorted_report 帳票の降順
#
#   npx hatake check definitions/app.yaml --project definitions/hatake.project.yaml
dsl_version: "1.0"

app:
  id: kitchen_sink
  title: 機能網羅
  home: comboForm
  # 画面を**並べて開く**（タブ）。`open: tab` が効くのはこの形のときだけ。
  navigation: tabs
  roles: [tester, admin]

  # 見た目の決めごと。**画面では確かめにくい所**なので、ここで一度は書いておく。
  theme:
    primaryColor: "#3F51B5"
    secondaryColor: "#FF9800"
    brightness: system
    density: compact
    fontFamily: "Noto Sans JP"
    radius: 8
    config: { note: 見た目の追加設定は Renderer にそのまま渡る }

  menu:
    - { id: comboForm, label: 条件の組み合わせ, icon: rule, page: combo_form }
    - { id: pressList, label: 押す前に聞く, icon: touch_
…（長いので省略）
```

### A-02 定義に書いた条件で絞れる（前方一致）

- **確かめたいこと**: `operator: startsWith` が QueryBuilder を通って届くか
- **期待**: ITEM-001 だけが返る
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3003/api/items?itemCode=ITEM-001&pageSize=20
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "itemCode": "ITEM-001",
      "itemName": "網羅の 1 件目",
      "kind": "special",
      "amount": 500,
      "approved": false,
      "groupCode": "G2",
      "childCode": "C21",
      "lines": [
        {
          "lineName": "明細 1-1",
          "lineAmount": 101
        },
        {
          "lineName": "明細 1-2",
          "lineAmount": 201
        },
        {
          "lineName": "明細 1-3",
          "lineAmount": 301
        }
      ]
    }
  ],
  "totalCount": 1
}
```

### A-03 定義に書いていない項目では絞れない

- **確かめたいこと**: **書いていない項目は無視する**＝任意の項目で検索されない
- **期待**: 絞られずに12件返る
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3003/api/items?itemName=%E7%B6%B2%E7%BE%85&pageSize=20
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "itemCode": "ITEM-001",
      "itemName": "網羅の 1 件目",
      "kind": "special",
      "amount": 500,
      "approved": false,
      "groupCode": "G2",
      "childCode": "C21",
      "lines": [
        {
          "lineName": "明細 1-1",
          "lineAmount": 101
        },
        {
          "lineName": "明細 1-2",
          "lineAmount": 201
        },
        {
          "lineName": "明細 1-3",
          "lineAmount": 301
        }
      ]
    },
    {
      "itemCode": "ITEM-002",
      "itemName": "網羅の 2 件目",
      "kind": "trial",
      "amount": 1000,
      "approved": true,
      "groupCode": "G1",
      "childCode": "C11",
      "lines": [
        {
          "lineName": "明細 2-1",
          "lineAmount": 102
        },
        {
          "lineName": "明細 2-2",
          "lineAmount": 202
        },
        {
          "lineName": "明細 2-3",
          "lineAmount": 302
        },
        {
          "lineName": "明細 2-4",
          "lineAmount": 402
        }
      ]
    },
    {
      "itemCode": "ITEM-003",
      "itemName": "網羅の 3 件目",
      "kind": "standard",
      "amount": 1500,
      "approved": false,
      "groupCode": "G2",
      "childCode":
…（長いので省略）
```

### A-04 選択肢は親で絞られる

- **確かめたいこと**: `optionsSource.parentKey` が `{ groupCode: <親の値> }` で投げてくるか
- **期待**: G1 の子だけ（2件）
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3003/api/children?groupCode=G1
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "childCode": "C11",
      "childName": "子 1-1",
      "groupCode": "G1"
    },
    {
      "childCode": "C12",
      "childName": "子 1-2",
      "groupCode": "G1"
    }
  ],
  "totalCount": 2
}
```

### A-05 帳票の並べ替えが届く（降順）

- **確かめたいこと**: **並べ替えは Repository の担当**。届いていなければ `ascending: false` は効かない
- **期待**: 先頭が ITEM-012
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3003/api/lines?sortField=itemCode&sortAscending=false
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "itemCode": "ITEM-012",
      "lineName": "明細 12-1",
      "lineAmount": 112
    },
    {
      "itemCode": "ITEM-012",
      "lineName": "明細 12-2",
      "lineAmount": 212
    },
    {
      "itemCode": "ITEM-011",
      "lineName": "明細 11-1",
      "lineAmount": 111
    },
    {
      "itemCode": "ITEM-011",
      "lineName": "明細 11-2",
      "lineAmount": 211
    },
    {
      "itemCode": "ITEM-011",
      "lineName": "明細 11-3",
      "lineAmount": 311
    },
    {
      "itemCode": "ITEM-011",
      "lineName": "明細 11-4",
      "lineAmount": 411
    },
    {
      "itemCode": "ITEM-011",
      "lineName": "明細 11-5",
      "lineAmount": 511
    },
    {
      "itemCode": "ITEM-010",
      "lineName": "明細 10-1",
      "lineAmount": 110
    },
    {
      "itemCode": "ITEM-010",
      "lineName": "明細 10-2",
      "lineAmount": 210
    },
    {
      "itemCode": "ITEM-010",
      "lineName": "明細 10-3",
      "lineAmount": 310
    },
    {
      "itemCode": "ITEM-010",
      "lineName": "明細 10-4",
      "lineAmount": 410
    },
    {
      "itemCode": "ITEM-009",
      "lineName": "明細 9-1",
      "lineAmount": 109
    },
    {
      "itemCode": "ITEM-009"
…（長いので省略）
```

### A-06 画面と同じ検証がサーバでも効く

- **確かめたいこと**: 画面の検証は**親切**であって守りではない
- **期待**: 400・コードと種別が項目ごとに返る
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3003/api/items

{
  "itemCode": "",
  "amount": 1
}
```

**返ってきたもの**

```json
HTTP 400
{
  "valid": false,
  "errors": [
    {
      "field": "itemCode",
      "message": "必須項目です"
    },
    {
      "field": "kind",
      "message": "必須項目です"
    }
  ]
}
```

### A-07 押す前に聞いた値が届く

- **確かめたいこと**: `prompt.fields` に書いた項目が `input` としてハンドラまで来るか
- **期待**: 単価が 777 になる
- **結果**: OK
- **補足**: この直後に ITEM-001 を読み直して確かめる

**投げたもの**

```http
POST http://localhost:3003/api/bulk/reprice

{
  "keys": [
    "ITEM-001"
  ],
  "input": {
    "newAmount": 777,
    "reason": "試し"
  }
}
```

**返ってきたもの**

```json
HTTP 200
{
  "succeeded": 1,
  "rejected": []
}
```

### A-08 一括は1件ずつ確定し、失敗した行だけ名指しで返す

- **確かめたいこと**: 試用のものは変えられない＝**途中まで進んで終わる**のが普通
- **期待**: succeeded 2・rejected 2（理由つき）
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3003/api/bulk/archive

{
  "keys": [
    "ITEM-003",
    "ITEM-002",
    "ITEM-006",
    "NOPE"
  ]
}
```

**返ってきたもの**

```json
HTTP 200
{
  "succeeded": 2,
  "rejected": [
    {
      "key": "ITEM-002",
      "reason": "試用のものは変えられません"
    },
    {
      "key": "NOPE",
      "reason": "見つかりません"
    }
  ]
}
```

### A-09 持ち出しは admin だけ（役割はサーバでも見る）

- **確かめたいこと**: 画面の `roles` は見せ方だけ
- **期待**: tester は false・admin は true
- **結果**: OK
- **補足**: tester=false / admin=true

**投げたもの**

```http
GET http://localhost:3003/api/export-allowed
```

**返ってきたもの**

```json
HTTP 200
{
  "allowed": true
}
```

### A-10 初期状態に戻せる（何度回しても同じ結果になる）

- **確かめたいこと**: 証跡は「何度回しても同じ」でないと使えない
- **期待**: 200・12件に戻る
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3003/api/reset
```

**返ってきたもの**

```json
HTTP 200
{
  "ok": true,
  "count": 12
}
```
