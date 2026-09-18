# API テスト結果（実行記録）

> **この紙は生成物です。** `tests/api/run.mjs` が実際に API を叩いて、
> **やりとりをそのまま**書き出しています（手で直さない）。
> 作り直し: `bash tools/run-tests.sh`

- 実行日時: 2026-09-18T00:38:23.744Z
- 対象: `http://localhost:3001/api`
- 前提: `docker compose up` で DB が初期データの状態

> **順番に意味があります。** A-16 で作った受注を A-18・A-20・A-23・A-24 が使い回すので、1件ずつ抜き出して回すと落ちます（回す前にデータを初期状態に戻すのはそのため）。

## まとめ（28 / 28 件）

| 項番 | 内容 | 結果 | HTTP |
|---|---|---|---|
| A-01 | ログインできる（clerk） | OK | 200 |
| A-02 | パスワードが違うと入れない | OK | 401 |
| A-03 | ログインしていないと一覧が見えない | OK | 401 |
| A-04 | 条件で絞れる（定義に書いた条件だけ） | OK | 200 |
| A-05 | 定義に書いていない項目では絞れない | OK | 200 |
| A-06 | 降順の指定が効く | OK | 200 |
| A-07 | 範囲で絞れる（合計 いくら以上 いくら以下） | OK | 200 |
| A-08 | 明細まで付けて1件返す | OK | 200 |
| A-09 | 消費税は税率ごとに1回だけ切り捨てる | OK | 200 |
| A-10 | 営業は自分の拠点の受注しか見えない | OK | 200 |
| A-11 | 営業には入力者の列が返らない | OK | 200 |
| A-12 | 画面と同じ検証がサーバでも効く | OK | 400 |
| A-13 | 明細が1行も無いと保存できない | OK | 400 |
| A-14 | 同じ商品を2行に入れると保存できない | OK | 400 |
| A-15 | 行の中のどこが悪いかまで言う | OK | 400 |
| A-16 | 受注番号はサーバが採番する | OK | 201 |
| A-17 | 送られてきた単価は信じない（商品マスタの定価で計算し直す） | OK | 201 |
| A-18 | 同じ受注を2人が直したら、後の人が弾かれる | OK | 409 |
| A-19 | 締めた月の受注は直せない | OK | 409 |
| A-20 | 営業は受注を取り消せない | OK | 403 |
| A-21 | 営業はほかの拠点の受注を読めない | OK | 403 |
| A-22 | 一括の上限をサーバでも守る | OK | 409 |
| A-23 | 一括は1件ずつ確定し、失敗した行だけ名指しで返す | OK | 200 |
| A-24 | 取り消しても消えない（状態が変わるだけ） | OK | 200 |
| A-25 | 帳票は明細を1行1件で返す（取消は出さない） | OK | 200 |
| A-26 | 営業は帳票の口を叩けない | OK | 403 |
| A-27 | 出荷指示を投げると状態が出荷済になる | OK | 200 |
| A-28 | 画面の定義を配っている | OK | 200 |

---

## 1件ごとの記録

### A-01 ログインできる（clerk）

- **確かめたいこと**: 役割はログインで配る（前書きの role-source の答え）
- **期待**: 200 が返り、roles に clerk が入る
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/auth/login

{
  "userId": "tanaka",
  "password": "tanaka123"
}
```

**返ってきたもの**

```json
HTTP 200
{
  "user": {
    "officeCode": "TKY",
    "userId": "tanaka",
    "roles": [
      "clerk"
    ],
    "name": "田中 優子"
  },
  "token": "dGFuYWthH-eUsOS4rSDlhKrlrZAfY2xlcmsfMTc4OTcyMDcwMw.u0fWwW21FPk9ufeaWDCBQwXXF0qC6M4ltys2p_WTvi0"
}
```

### A-02 パスワードが違うと入れない

- **確かめたいこと**: **理由を分けない**（「その ID はありません」と言うと、在る ID を探せてしまう）
- **期待**: 401・文言は「ID かパスワードが違います」
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/auth/login

{
  "userId": "tanaka",
  "password": "wrong"
}
```

**返ってきたもの**

```json
HTTP 401
{
  "message": "ID かパスワードが違います"
}
```

### A-03 ログインしていないと一覧が見えない

- **確かめたいこと**: 画面の roles は見せ方だけ。**本当の遮断はここ**
- **期待**: 401
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders
```

**返ってきたもの**

```json
HTTP 401
{
  "message": "ログインしてください"
}
```

### A-04 条件で絞れる（定義に書いた条件だけ）

- **確かめたいこと**: 検索できる条件は定義から決まる（QueryBuilder）
- **期待**: 200・受注状態が draft のものだけ返る
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders?orderStatus=draft&pageSize=50
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "orderNo": "SO2026090003",
      "customerCode": "C003",
      "orderDate": "2026-09-08",
      "dueDate": "2026-09-18",
      "orderStatus": "draft",
      "salesPersonName": "田中 優子",
      "deliveryPlace": null,
      "note": "数量確認中",
      "officeCode": "TKY",
      "subtotalAmount": 6680,
      "taxAmount": 534,
      "totalAmount": 7214,
      "lineCount": 2,
      "createdBy": "tanaka",
      "createdAt": "2026-09-08 07:45:00+00",
      "updatedAt": "2026-09-08 07:45:00+00",
      "customerName": "北山フーズ株式会社"
    },
    {
      "orderNo": "SO2026090004",
      "customerCode": "C001",
      "orderDate": "2026-09-10",
      "dueDate": "2026-09-17",
      "orderStatus": "draft",
      "salesPersonName": "佐藤 健一",
      "deliveryPlace": "本社総務部",
      "note": null,
      "officeCode": "OSA",
      "subtotalAmount": 2160,
      "taxAmount": 216,
      "totalAmount": 2376,
      "lineCount": 2,
      "createdBy": "sato",
      "createdAt": "2026-09-09 23:50:00+00",
      "updatedAt": "2026-09-09 23:50:00+00",
      "customerName": "株式会社あおぞら商事"
    }
  ],
  "totalCount": 2
}
```

### A-05 定義に書いていない項目では絞れない

- **確かめたいこと**: **書いていない項目は無視する**＝任意の項目で検索されない（総なめを作らない）
- **期待**: 200・絞られずに全件返る（9件）
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders?note=%E8%87%B3%E6%80%A5&pageSize=50
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "orderNo": "SO2026070001",
      "customerCode": "C001",
      "orderDate": "2026-07-03",
      "dueDate": "2026-07-10",
      "orderStatus": "shipped",
      "salesPersonName": "佐藤 健一",
      "deliveryPlace": "本社総務部",
      "note": null,
      "officeCode": "OSA",
      "subtotalAmount": 6360,
      "taxAmount": 636,
      "totalAmount": 6996,
      "lineCount": 2,
      "createdBy": "sato",
      "createdAt": "2026-07-03 00:12:00+00",
      "updatedAt": "2026-07-05 01:00:00+00",
      "customerName": "株式会社あおぞら商事"
    },
    {
      "orderNo": "SO2026070002",
      "customerCode": "C003",
      "orderDate": "2026-07-08",
      "dueDate": "2026-07-15",
      "orderStatus": "shipped",
      "salesPersonName": "鈴木 花",
      "deliveryPlace": "川崎センター",
      "note": "定期便",
      "officeCode": "TKY",
      "subtotalAmount": 9700,
      "taxAmount": 776,
      "totalAmount": 10476,
      "lineCount": 2,
      "createdBy": "suzuki",
      "createdAt": "2026-07-08 02:30:00+00",
      "updatedAt": "2026-07-09 05:00:00+00",
      "customerName": "北山フーズ株式会社"
    },
    {
      "orderNo": "SO2026080001",
      "customerCode": "C002",
      "orderDate": "2026-08-04",

…（長いので省略）
```

### A-06 降順の指定が効く

- **確かめたいこと**: `sortAscending=false` は**文字列で届く**。真偽に直せていないと昇順になる
- **期待**: 受注日の降順
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders?sortField=orderDate&sortAscending=false&pageSize=50
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "orderNo": "SO2026090004",
      "customerCode": "C001",
      "orderDate": "2026-09-10",
      "dueDate": "2026-09-17",
      "orderStatus": "draft",
      "salesPersonName": "佐藤 健一",
      "deliveryPlace": "本社総務部",
      "note": null,
      "officeCode": "OSA",
      "subtotalAmount": 2160,
      "taxAmount": 216,
      "totalAmount": 2376,
      "lineCount": 2,
      "createdBy": "sato",
      "createdAt": "2026-09-09 23:50:00+00",
      "updatedAt": "2026-09-09 23:50:00+00",
      "customerName": "株式会社あおぞら商事"
    },
    {
      "orderNo": "SO2026090003",
      "customerCode": "C003",
      "orderDate": "2026-09-08",
      "dueDate": "2026-09-18",
      "orderStatus": "draft",
      "salesPersonName": "田中 優子",
      "deliveryPlace": null,
      "note": "数量確認中",
      "officeCode": "TKY",
      "subtotalAmount": 6680,
      "taxAmount": 534,
      "totalAmount": 7214,
      "lineCount": 2,
      "createdBy": "tanaka",
      "createdAt": "2026-09-08 07:45:00+00",
      "updatedAt": "2026-09-08 07:45:00+00",
      "customerName": "北山フーズ株式会社"
    },
    {
      "orderNo": "SO2026090002",
      "customerCode": "C002",
      "orderDate": "2026-09-03",
      
…（長いので省略）
```

### A-07 範囲で絞れる（合計 いくら以上 いくら以下）

- **確かめたいこと**: `operator: between` は値を2つ受ける
- **期待**: 200・合計が 5000〜11000 のものだけ
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders?totalAmount=5000&totalAmount=11000&pageSize=50
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "orderNo": "SO2026070001",
      "customerCode": "C001",
      "orderDate": "2026-07-03",
      "dueDate": "2026-07-10",
      "orderStatus": "shipped",
      "salesPersonName": "佐藤 健一",
      "deliveryPlace": "本社総務部",
      "note": null,
      "officeCode": "OSA",
      "subtotalAmount": 6360,
      "taxAmount": 636,
      "totalAmount": 6996,
      "lineCount": 2,
      "createdBy": "sato",
      "createdAt": "2026-07-03 00:12:00+00",
      "updatedAt": "2026-07-05 01:00:00+00",
      "customerName": "株式会社あおぞら商事"
    },
    {
      "orderNo": "SO2026070002",
      "customerCode": "C003",
      "orderDate": "2026-07-08",
      "dueDate": "2026-07-15",
      "orderStatus": "shipped",
      "salesPersonName": "鈴木 花",
      "deliveryPlace": "川崎センター",
      "note": "定期便",
      "officeCode": "TKY",
      "subtotalAmount": 9700,
      "taxAmount": 776,
      "totalAmount": 10476,
      "lineCount": 2,
      "createdBy": "suzuki",
      "createdAt": "2026-07-08 02:30:00+00",
      "updatedAt": "2026-07-09 05:00:00+00",
      "customerName": "北山フーズ株式会社"
    },
    {
      "orderNo": "SO2026080002",
      "customerCode": "C001",
      "orderDate": "2026-08-11",

…（長いので省略）
```

### A-08 明細まで付けて1件返す

- **確かめたいこと**: ヘッダと明細で1件（親子）。画面はこの形で受け取る
- **期待**: 200・lines が3行
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders/SO2026090002
```

**返ってきたもの**

```json
HTTP 200
{
  "orderNo": "SO2026090002",
  "customerCode": "C002",
  "orderDate": "2026-09-03",
  "dueDate": "2026-09-11",
  "orderStatus": "confirmed",
  "salesPersonName": "鈴木 花",
  "deliveryPlace": "本社",
  "note": null,
  "officeCode": "TKY",
  "subtotalAmount": 10520,
  "taxAmount": 968,
  "totalAmount": 11488,
  "lineCount": 3,
  "createdBy": "suzuki",
  "createdAt": "2026-09-03 01:15:00+00",
  "updatedAt": "2026-09-03 01:15:00+00",
  "customerName": "みどり物産株式会社",
  "lines": [
    {
      "orderNo": "SO2026090002",
      "lineNo": 1,
      "orderDate": "2026-09-03",
      "dueDate": "2026-09-11",
      "orderStatus": "confirmed",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P004",
      "productName": "デスクマット",
      "quantity": 1,
      "unitPrice": 3200,
      "taxRate": 0.1,
      "amount": 3200,
      "cancelled": false
    },
    {
      "orderNo": "SO2026090002",
      "lineNo": 2,
      "orderDate": "2026-09-03",
      "dueDate": "2026-09-11",
      "orderStatus": "confirmed",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P002",
      "productName": "ボールペン 黒（10本）",
      "quantity": 4,
      "unitPr
…（長いので省略）
```

### A-09 消費税は税率ごとに1回だけ切り捨てる

- **確かめたいこと**: 軽減8%が混ざる。明細ごとに丸めると請求書と1円ずれる
- **期待**: 10%分 6320→632、8%分 4200→336、合わせて 968
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders/SO2026090002
```

**返ってきたもの**

```json
HTTP 200
{
  "orderNo": "SO2026090002",
  "customerCode": "C002",
  "orderDate": "2026-09-03",
  "dueDate": "2026-09-11",
  "orderStatus": "confirmed",
  "salesPersonName": "鈴木 花",
  "deliveryPlace": "本社",
  "note": null,
  "officeCode": "TKY",
  "subtotalAmount": 10520,
  "taxAmount": 968,
  "totalAmount": 11488,
  "lineCount": 3,
  "createdBy": "suzuki",
  "createdAt": "2026-09-03 01:15:00+00",
  "updatedAt": "2026-09-03 01:15:00+00",
  "customerName": "みどり物産株式会社",
  "lines": [
    {
      "orderNo": "SO2026090002",
      "lineNo": 1,
      "orderDate": "2026-09-03",
      "dueDate": "2026-09-11",
      "orderStatus": "confirmed",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P004",
      "productName": "デスクマット",
      "quantity": 1,
      "unitPrice": 3200,
      "taxRate": 0.1,
      "amount": 3200,
      "cancelled": false
    },
    {
      "orderNo": "SO2026090002",
      "lineNo": 2,
      "orderDate": "2026-09-03",
      "dueDate": "2026-09-11",
      "orderStatus": "confirmed",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P002",
      "productName": "ボールペン 黒（10本）",
      "quantity": 4,
      "unitPr
…（長いので省略）
```

### A-10 営業は自分の拠点の受注しか見えない

- **確かめたいこと**: 拠点で絞るのは**定義に書けない**（画面に出てこない条件）。サーバが足す
- **期待**: 200・返る受注はすべて OSA
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders?pageSize=50
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "orderNo": "SO2026070001",
      "customerCode": "C001",
      "orderDate": "2026-07-03",
      "dueDate": "2026-07-10",
      "orderStatus": "shipped",
      "salesPersonName": "佐藤 健一",
      "deliveryPlace": "本社総務部",
      "note": null,
      "officeCode": "OSA",
      "subtotalAmount": 6360,
      "taxAmount": 636,
      "totalAmount": 6996,
      "lineCount": 2,
      "createdAt": "2026-07-03 00:12:00+00",
      "updatedAt": "2026-07-05 01:00:00+00",
      "customerName": "株式会社あおぞら商事"
    },
    {
      "orderNo": "SO2026080002",
      "customerCode": "C001",
      "orderDate": "2026-08-11",
      "dueDate": "2026-08-20",
      "orderStatus": "confirmed",
      "salesPersonName": "佐藤 健一",
      "deliveryPlace": "第二倉庫",
      "note": "至急",
      "officeCode": "OSA",
      "subtotalAmount": 5180,
      "taxAmount": 486,
      "totalAmount": 5666,
      "lineCount": 3,
      "createdAt": "2026-08-11 04:40:00+00",
      "updatedAt": "2026-08-11 04:40:00+00",
      "customerName": "株式会社あおぞら商事"
    },
    {
      "orderNo": "SO2026090001",
      "customerCode": "C005",
      "orderDate": "2026-09-01",
      "dueDate": "2026-09-08",
      "orderStatus": "con
…（長いので省略）
```

### A-11 営業には入力者の列が返らない

- **確かめたいこと**: 列の `roles` は**見せ方だけ**では足りない。API でも同じ定義から落とす
- **期待**: 200・items に createdBy が無い（clerk には在る）
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders?pageSize=50
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "orderNo": "SO2026070001",
      "customerCode": "C001",
      "orderDate": "2026-07-03",
      "dueDate": "2026-07-10",
      "orderStatus": "shipped",
      "salesPersonName": "佐藤 健一",
      "deliveryPlace": "本社総務部",
      "note": null,
      "officeCode": "OSA",
      "subtotalAmount": 6360,
      "taxAmount": 636,
      "totalAmount": 6996,
      "lineCount": 2,
      "createdAt": "2026-07-03 00:12:00+00",
      "updatedAt": "2026-07-05 01:00:00+00",
      "customerName": "株式会社あおぞら商事"
    },
    {
      "orderNo": "SO2026080002",
      "customerCode": "C001",
      "orderDate": "2026-08-11",
      "dueDate": "2026-08-20",
      "orderStatus": "confirmed",
      "salesPersonName": "佐藤 健一",
      "deliveryPlace": "第二倉庫",
      "note": "至急",
      "officeCode": "OSA",
      "subtotalAmount": 5180,
      "taxAmount": 486,
      "totalAmount": 5666,
      "lineCount": 3,
      "createdAt": "2026-08-11 04:40:00+00",
      "updatedAt": "2026-08-11 04:40:00+00",
      "customerName": "株式会社あおぞら商事"
    },
    {
      "orderNo": "SO2026090001",
      "customerCode": "C005",
      "orderDate": "2026-09-01",
      "dueDate": "2026-09-08",
      "orderStatus": "con
…（長いので省略）
```

### A-12 画面と同じ検証がサーバでも効く

- **確かめたいこと**: 画面の検証は**親切**であって守りではない（API を直接叩けば通る）
- **期待**: 400・納期と担当が項目ごとに返る
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/orders

{
  "customerCode": "C001",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-01",
  "salesPersonName": "",
  "lines": [
    {
      "productCode": "P001",
      "quantity": 10,
      "unitPrice": 480
    },
    {
      "productCode": "P006",
      "quantity": 2,
      "unitPrice": 1580
    }
  ]
}
```

**返ってきたもの**

```json
HTTP 400
{
  "valid": false,
  "errors": [
    {
      "message": "納期は受注日以降にしてください",
      "field": "dueDate"
    },
    {
      "message": "必須項目です",
      "field": "salesPersonName"
    }
  ]
}
```

### A-13 明細が1行も無いと保存できない

- **確かめたいこと**: `required` は**空の並び**も「無い」と見る
- **期待**: 400・field は lines
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/orders

{
  "customerCode": "C001",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "salesPersonName": "田中 優子",
  "lines": []
}
```

**返ってきたもの**

```json
HTTP 400
{
  "valid": false,
  "errors": [
    {
      "message": "必須項目です",
      "field": "lines"
    }
  ]
}
```

### A-14 同じ商品を2行に入れると保存できない

- **確かめたいこと**: 行をまたいで見る検証（`unique`）。この案件で一番多いミス
- **期待**: 400・「同じ商品が複数行にあります」
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/orders

{
  "customerCode": "C001",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "salesPersonName": "田中 優子",
  "lines": [
    {
      "productCode": "P001",
      "quantity": 1,
      "unitPrice": 480
    },
    {
      "productCode": "P001",
      "quantity": 2,
      "unitPrice": 480
    }
  ]
}
```

**返ってきたもの**

```json
HTTP 400
{
  "valid": false,
  "errors": [
    {
      "message": "同じ商品が複数行にあります",
      "field": "lines"
    }
  ]
}
```

### A-15 行の中のどこが悪いかまで言う

- **確かめたいこと**: 「明細が変です」では、20行あるうちのどれか分からない
- **期待**: 400・field は lines[0].quantity
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/orders

{
  "customerCode": "C001",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "salesPersonName": "田中 優子",
  "lines": [
    {
      "productCode": "P001",
      "quantity": 0,
      "unitPrice": 480
    }
  ]
}
```

**返ってきたもの**

```json
HTTP 400
{
  "valid": false,
  "errors": [
    {
      "message": "数量は1以上にしてください",
      "field": "lines[0].quantity"
    }
  ]
}
```

### A-16 受注番号はサーバが採番する

- **確かめたいこと**: 連番の在り処はサーバ（前書きの numbering の答え）。画面では入れさせない
- **期待**: 201・SO で始まる番号が付く。送った番号は捨てられる
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/orders

{
  "customerCode": "C001",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "salesPersonName": "田中 優子",
  "lines": [
    {
      "productCode": "P001",
      "quantity": 10,
      "unitPrice": 480
    },
    {
      "productCode": "P006",
      "quantity": 2,
      "unitPrice": 1580
    }
  ],
  "orderNo": "送っても無視される"
}
```

**返ってきたもの**

```json
HTTP 201
{
  "orderNo": "SO2026090101",
  "customerCode": "C001",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "orderStatus": "draft",
  "salesPersonName": "田中 優子",
  "deliveryPlace": null,
  "note": null,
  "officeCode": "TKY",
  "subtotalAmount": 7960,
  "taxAmount": 732,
  "totalAmount": 8692,
  "lineCount": 2,
  "createdBy": "tanaka",
  "createdAt": "2026-09-18 00:38:23.985697+00",
  "updatedAt": "2026-09-18 00:38:23.985697+00",
  "customerName": "株式会社あおぞら商事",
  "lines": [
    {
      "orderNo": "SO2026090101",
      "lineNo": 1,
      "orderDate": "2026-09-15",
      "dueDate": "2026-09-25",
      "orderStatus": "draft",
      "customerCode": "C001",
      "customerName": "株式会社あおぞら商事",
      "productCode": "P001",
      "productName": "A4コピー用紙（500枚）",
      "quantity": 10,
      "unitPrice": 480,
      "taxRate": 0.1,
      "amount": 4800,
      "cancelled": false
    },
    {
      "orderNo": "SO2026090101",
      "lineNo": 2,
      "orderDate": "2026-09-15",
      "dueDate": "2026-09-25",
      "orderStatus": "draft",
      "customerCode": "C001",
      "customerName": "株式会社あおぞら商事",
      "productCode": "P006",
      "productName": "ミネラルウォーター（24本）",
      "quantity": 2,

…（長いので省略）
```

### A-17 送られてきた単価は信じない（商品マスタの定価で計算し直す）

- **確かめたいこと**: 単価の出どころは商品マスタ（前書き）。API を直接叩けば好きな単価を送れる
- **期待**: 1円で送っても、定価で 7960 になる
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/orders

{
  "customerCode": "C002",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "salesPersonName": "田中 優子",
  "lines": [
    {
      "productCode": "P001",
      "quantity": 10,
      "unitPrice": 1,
      "taxRate": 0.5
    },
    {
      "productCode": "P006",
      "quantity": 2,
      "unitPrice": 1,
      "taxRate": 0.5
    }
  ]
}
```

**返ってきたもの**

```json
HTTP 201
{
  "orderNo": "SO2026090102",
  "customerCode": "C002",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "orderStatus": "draft",
  "salesPersonName": "田中 優子",
  "deliveryPlace": null,
  "note": null,
  "officeCode": "TKY",
  "subtotalAmount": 7960,
  "taxAmount": 732,
  "totalAmount": 8692,
  "lineCount": 2,
  "createdBy": "tanaka",
  "createdAt": "2026-09-18 00:38:24.017437+00",
  "updatedAt": "2026-09-18 00:38:24.017437+00",
  "customerName": "みどり物産株式会社",
  "lines": [
    {
      "orderNo": "SO2026090102",
      "lineNo": 1,
      "orderDate": "2026-09-15",
      "dueDate": "2026-09-25",
      "orderStatus": "draft",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P001",
      "productName": "A4コピー用紙（500枚）",
      "quantity": 10,
      "unitPrice": 480,
      "taxRate": 0.1,
      "amount": 4800,
      "cancelled": false
    },
    {
      "orderNo": "SO2026090102",
      "lineNo": 2,
      "orderDate": "2026-09-15",
      "dueDate": "2026-09-25",
      "orderStatus": "draft",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P006",
      "productName": "ミネラルウォーター（24本）",
      "quantity": 2,
   
…（長いので省略）
```

### A-18 同じ受注を2人が直したら、後の人が弾かれる

- **確かめたいこと**: 先に保存した人の入力が黙って消えるのを止める（前書きの concurrency の答え）
- **期待**: 409・「読み直してください」
- **結果**: OK

**投げたもの**

```http
PUT http://localhost:3001/api/orders/SO2026090101

{
  "customerCode": "C001",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "salesPersonName": "田中 優子",
  "lines": [
    {
      "productCode": "P001",
      "quantity": 10,
      "unitPrice": 480
    },
    {
      "productCode": "P006",
      "quantity": 2,
      "unitPrice": 1580
    }
  ],
  "updatedAt": "2020-01-01 00:00:00+00"
}
```

**返ってきたもの**

```json
HTTP 409
{
  "message": "ほかの人が先に更新しています。読み直してください"
}
```

### A-19 締めた月の受注は直せない

- **確かめたいこと**: 締めの在り処はサーバ。画面は「直せない」という結果だけを見せる
- **期待**: 409・「締めた月の受注は直せません」
- **結果**: OK

**投げたもの**

```http
PUT http://localhost:3001/api/orders/SO2026070001

{
  "customerCode": "C001",
  "orderDate": "2026-07-03",
  "dueDate": "2026-07-10",
  "salesPersonName": "田中 優子",
  "lines": [
    {
      "productCode": "P001",
      "quantity": 10,
      "unitPrice": 480
    },
    {
      "productCode": "P006",
      "quantity": 2,
      "unitPrice": 1580
    }
  ]
}
```

**返ってきたもの**

```json
HTTP 409
{
  "message": "締めた月の受注は直せません"
}
```

### A-20 営業は受注を取り消せない

- **確かめたいこと**: 取り消せるのは営業事務だけ（定義の `roles: [clerk]`）。画面から消しても口は開いている
- **期待**: 403
- **結果**: OK

**投げたもの**

```http
DELETE http://localhost:3001/api/orders/SO2026090101
```

**返ってきたもの**

```json
HTTP 403
{
  "message": "この操作は許可されていません"
}
```

### A-21 営業はほかの拠点の受注を読めない

- **確かめたいこと**: 画面に出さないだけでは足りない（番号を直接叩けば読める）
- **期待**: 403
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders/SO2026090002
```

**返ってきたもの**

```json
HTTP 403
{
  "message": "ほかの拠点の受注は見られません"
}
```

### A-22 一括の上限をサーバでも守る

- **確かめたいこと**: 画面は上限を超えると押せないが、**API を直接叩けば通る**。同じ定義から同じ数を読む
- **期待**: 409・「1回に実行できるのは 20 件までです」
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/bulk/cancel

{
  "keys": [
    "X0",
    "X1",
    "X2",
    "X3",
    "X4",
    "X5",
    "X6",
    "X7",
    "X8",
    "X9",
    "X10",
    "X11",
    "X12",
    "X13",
    "X14",
    "X15",
    "X16",
    "X17",
    "X18",
    "X19",
    "X20"
  ]
}
```

**返ってきたもの**

```json
HTTP 409
{
  "message": "1回に実行できるのは 20 件までです（21 件届きました）"
}
```

### A-23 一括は1件ずつ確定し、失敗した行だけ名指しで返す

- **確かめたいこと**: 締めた月や出荷済が混ざるのは普通。全部取り消すと「1件のために49件やり直し」になる
- **期待**: 200・succeeded が1、rejected が3件（理由つき）
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/bulk/cancel

{
  "keys": [
    "SO2026090101",
    "SO2026070001",
    "SO2026080003",
    "NOPE"
  ]
}
```

**返ってきたもの**

```json
HTTP 200
{
  "rejected": [
    {
      "key": "SO2026070001",
      "reason": "出荷済なので取り消せません"
    },
    {
      "key": "SO2026080003",
      "reason": "すでに取消です"
    },
    {
      "key": "NOPE",
      "reason": "見つかりません"
    }
  ],
  "succeeded": 1
}
```

### A-24 取り消しても消えない（状態が変わるだけ）

- **確かめたいこと**: 過去の伝票から参照されるので消せない（前書きの erase の答え）
- **期待**: 200・orderStatus が cancelled で残っている
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/orders/SO2026090101
```

**返ってきたもの**

```json
HTTP 200
{
  "orderNo": "SO2026090101",
  "customerCode": "C001",
  "orderDate": "2026-09-15",
  "dueDate": "2026-09-25",
  "orderStatus": "cancelled",
  "salesPersonName": "田中 優子",
  "deliveryPlace": null,
  "note": null,
  "officeCode": "TKY",
  "subtotalAmount": 7960,
  "taxAmount": 732,
  "totalAmount": 8692,
  "lineCount": 2,
  "createdBy": "tanaka",
  "createdAt": "2026-09-18 00:38:23.985697+00",
  "updatedAt": "2026-09-18 00:38:24.079249+00",
  "customerName": "株式会社あおぞら商事",
  "lines": [
    {
      "orderNo": "SO2026090101",
      "lineNo": 1,
      "orderDate": "2026-09-15",
      "dueDate": "2026-09-25",
      "orderStatus": "cancelled",
      "customerCode": "C001",
      "customerName": "株式会社あおぞら商事",
      "productCode": "P001",
      "productName": "A4コピー用紙（500枚）",
      "quantity": 10,
      "unitPrice": 480,
      "taxRate": 0.1,
      "amount": 4800,
      "cancelled": false
    },
    {
      "orderNo": "SO2026090101",
      "lineNo": 2,
      "orderDate": "2026-09-15",
      "dueDate": "2026-09-25",
      "orderStatus": "cancelled",
      "customerCode": "C001",
      "customerName": "株式会社あおぞら商事",
      "productCode": "P006",
      "productName": "ミネラルウォーター（24本）",
      "qu
…（長いので省略）
```

### A-25 帳票は明細を1行1件で返す（取消は出さない）

- **確かめたいこと**: 紙は取引先に送るもの。取り消した受注を刷らない
- **期待**: 200・items が明細の形
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/order-lines?orderNo=SO2026090002&pageSize=200
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "orderNo": "SO2026090002",
      "lineNo": 1,
      "orderDate": "2026-09-03",
      "dueDate": "2026-09-11",
      "orderStatus": "confirmed",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P004",
      "productName": "デスクマット",
      "quantity": 1,
      "unitPrice": 3200,
      "taxRate": 0.1,
      "amount": 3200,
      "cancelled": false
    },
    {
      "orderNo": "SO2026090002",
      "lineNo": 2,
      "orderDate": "2026-09-03",
      "dueDate": "2026-09-11",
      "orderStatus": "confirmed",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P002",
      "productName": "ボールペン 黒（10本）",
      "quantity": 4,
      "unitPrice": 780,
      "taxRate": 0.1,
      "amount": 3120,
      "cancelled": false
    },
    {
      "orderNo": "SO2026090002",
      "lineNo": 3,
      "orderDate": "2026-09-03",
      "dueDate": "2026-09-11",
      "orderStatus": "confirmed",
      "customerCode": "C002",
      "customerName": "みどり物産株式会社",
      "productCode": "P008",
      "productName": "来客用茶葉（1kg）",
      "quantity": 1,
      "unitPrice": 4200,
      "taxRate": 0.08,
      "amount": 4200
…（長いので省略）
```

### A-26 営業は帳票の口を叩けない

- **確かめたいこと**: 注文請書は営業事務と管理者の紙（定義の `roles`）
- **期待**: 403
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/order-lines?pageSize=200
```

**返ってきたもの**

```json
HTTP 403
{
  "message": "この操作は許可されていません"
}
```

### A-27 出荷指示を投げると状態が出荷済になる

- **確かめたいこと**: 投げるだけで結果は持たない（前書きの shipmentGateway）
- **期待**: 200・orderStatus が shipped
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3001/api/orders/SO2026090001/ship
```

**返ってきたもの**

```json
HTTP 200
{
  "orderNo": "SO2026090001",
  "customerCode": "C005",
  "orderDate": "2026-09-01",
  "dueDate": "2026-09-08",
  "orderStatus": "shipped",
  "salesPersonName": "佐藤 健一",
  "deliveryPlace": null,
  "note": null,
  "officeCode": "OSA",
  "subtotalAmount": 4060,
  "taxAmount": 324,
  "totalAmount": 4384,
  "lineCount": 2,
  "createdBy": "sato",
  "createdAt": "2026-09-01 00:00:00+00",
  "updatedAt": "2026-09-18 00:38:24.118433+00",
  "customerName": "南商店",
  "lines": [
    {
      "orderNo": "SO2026090001",
      "lineNo": 1,
      "orderDate": "2026-09-01",
      "dueDate": "2026-09-08",
      "orderStatus": "shipped",
      "customerCode": "C005",
      "customerName": "南商店",
      "productCode": "P006",
      "productName": "ミネラルウォーター（24本）",
      "quantity": 1,
      "unitPrice": 1580,
      "taxRate": 0.08,
      "amount": 1580,
      "cancelled": false
    },
    {
      "orderNo": "SO2026090001",
      "lineNo": 2,
      "orderDate": "2026-09-01",
      "dueDate": "2026-09-08",
      "orderStatus": "shipped",
      "customerCode": "C005",
      "customerName": "南商店",
      "productCode": "P007",
      "productName": "ドリップコーヒー（50袋）",
      "quantity": 1,
      "unitPrice": 2480
…（長いので省略）
```

### A-28 画面の定義を配っている

- **確かめたいこと**: 画面は定義のコピーを持たない（同じ1枚を読む）
- **期待**: 200・YAML が返る
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3001/api/definition.yaml
```

**返ってきたもの**

```json
HTTP 200
# yaml-language-server: $schema=https://github.com/ASIL-E-Hatake/hatake/raw/main/spec/hatake-page.schema.json
#
# 受注入力 — 画面の定義（これ1枚で5画面）。
#
# この定義は **flutter-src と java-src の両方が読む**。画面を描くのも、API が
# リクエストを検証するのも、同じこの1枚。だから definitions/ は案件の直下に置いてある。
#
#   npx hatake check definitions/app.yaml --project definitions/hatake.project.yaml
dsl_version: "1.0"

app:
  id: order_entry
  title: 受注管理
  home: orders
  # 配りうる役割の語彙。社内ポータルがこの名前で返してくる（前書きの role-source）。
  roles: [sales, clerk, manager]

  menu:
    - { id: orders, label: 受注照会, icon: search, page: order_search }
    - { id: newOrder, label: 受注入力, icon: add_shopping_cart, page: order_entry }
    # 注文請書は取引先に送る紙なので、営業事務も刷る。
    - { id: slip, label: 注文請書, icon: print, page: order_slip, roles: [clerk, manager] }
    # グループの roles は中身にも掛かる。管理者しかメニューから開けない。
    - group: 管理
      icon: insights
      roles: [manager]
      items:
        - { id: dashboard, label: ダッシュボード, page: order_dashboard }

  pages:
    # ------------------------------------------------------------------
    # 受注照会（複雑な検索・一括取消・CSV）
    # ------------------------------------------------------------------
    - type: search
      id: order_search
      title: 受注照会
      
…（長いので省略）
```
