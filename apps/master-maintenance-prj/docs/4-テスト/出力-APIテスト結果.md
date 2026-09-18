# API テスト結果（実行記録）

> **この紙は生成物です。** `tests/api/run.mjs` が実際に API を叩いて、
> **やりとりをそのまま**書き出しています（手で直さない）。
> 作り直し: `bash tools/run-tests.sh`

- 実行日時: 2026-09-18T00:42:44.023Z
- 対象: `http://localhost:3000/api`
- 前提: `docker compose up` で DB が初期データの状態

## まとめ（20 / 20 件）

| 項番 | 内容 | 結果 | HTTP |
|---|---|---|---|
| A-01 | ログインできる（hr） | OK | 200 |
| A-02 | パスワードが違うと入れない | OK | 401 |
| A-03 | ログインしていないと一覧が見えない | OK | 401 |
| A-04 | 一覧が返る形（定義の契約どおり） | OK | 200 |
| A-05 | 定義に無い条件は無視される | OK | 200 |
| A-06 | 部分一致の検索が効く（氏名） | OK | 200 |
| A-07 | 範囲と複数選択の検索が効く（取引先） | OK | 200 |
| A-08 | 降順の指定が効く | OK | 200 |
| A-09 | viewer には内線を**返さない** | OK | 200 |
| A-10 | hr には内線を返す | OK | 200 |
| A-11 | 画面と同じ検証がサーバでも効く | OK | 400 |
| A-12 | 社員番号の形が違うと弾く | OK | 400 |
| A-13 | hr は取引先を直せない | OK | 403 |
| A-14 | 一括の上限を**サーバでも**守る（hr は20件） | OK | 400 |
| A-15 | admin は50件まで動かせる | OK | 200 |
| A-16 | 一括をもう一度押すと、失敗した行が**名指しで**返る | OK | 200 |
| A-17 | 同時に直したら、あとの人を弾く | OK | 409 |
| A-18 | 参照されている部署は消せない（サーバも落ちない） | OK | 409 |
| A-19 | 画面の定義を配っている | OK | 200 |
| A-20 | API の形を定義から出せる | OK | 200 |

---

## 1件ごとの記録

### A-01 ログインできる（hr）

- **確かめたいこと**: 役割はログインで配る（前書きの role-source の答え）
- **期待**: 200 が返り、roles に hr が入る
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3000/api/auth/login

{
  "userId": "hr",
  "password": "hr"
}
```

**返ってきたもの**

```json
HTTP 200
{
  "token": "eyJzdWIiOiJociIsInJvbGVzIjpbImhyIl0sImV4cCI6MTc4OTcyMDk2NDA2NX0.rdTIZ3Lld0WzgjZPS8tgt2a8Bz9uEL-MDv86Xf9LLgc",
  "user": {
    "userId": "hr",
    "displayName": "人事 花子",
    "roles": [
      "hr"
    ]
  }
}
```

### A-02 パスワードが違うと入れない

- **確かめたいこと**: **理由を分けない**（「その ID はありません」と言うと、在る ID を探せてしまう）
- **期待**: 401・文言は「ID かパスワードが違います」
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3000/api/auth/login

{
  "userId": "hr",
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
GET http://localhost:3000/api/employees
```

**返ってきたもの**

```json
HTTP 401
{
  "message": "ログインしてください"
}
```

### A-04 一覧が返る形（定義の契約どおり）

- **確かめたいこと**: `hatake_http` の契約は `{items, totalCount}`。ここがズレると画面が繋がらない
- **期待**: 200・items と totalCount を持つ
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/employees?pageSize=2
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "employeeNo": "100001",
      "name": "佐藤 太郎",
      "nameKana": "サトウ タロウ",
      "departmentCode": "JINJ",
      "position": "部長",
      "email": "user0@example.co.jp",
      "extension": "4000",
      "employmentStatus": "leave",
      "hireDate": "2012-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "人事部"
    },
    {
      "employeeNo": "100002",
      "name": "鈴木 彩",
      "nameKana": "スズキ アヤ",
      "departmentCode": "KOUB",
      "position": "課長",
      "email": "user1@example.co.jp",
      "extension": "4001",
      "employmentStatus": "active",
      "hireDate": "2013-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "購買部"
    }
  ],
  "totalCount": 48
}
```

### A-05 定義に無い条件は無視される

- **確かめたいこと**: `buildQuery` は**許可リスト方式**。任意項目での検索を弾く
- **期待**: 200・件数が絞られない（全48件）
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/employees?evilColumn=1&pageSize=1
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "employeeNo": "100001",
      "name": "佐藤 太郎",
      "nameKana": "サトウ タロウ",
      "departmentCode": "JINJ",
      "position": "部長",
      "email": "user0@example.co.jp",
      "extension": "4000",
      "employmentStatus": "leave",
      "hireDate": "2012-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "人事部"
    }
  ],
  "totalCount": 48
}
```

### A-06 部分一致の検索が効く（氏名）

- **確かめたいこと**: 定義の `operator: contains`
- **期待**: 200・佐藤だけが返る
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/employees?name=%E4%BD%90%E8%97%A4&pageSize=5
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "employeeNo": "100001",
      "name": "佐藤 太郎",
      "nameKana": "サトウ タロウ",
      "departmentCode": "JINJ",
      "position": "部長",
      "email": "user0@example.co.jp",
      "extension": "4000",
      "employmentStatus": "leave",
      "hireDate": "2012-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "人事部"
    },
    {
      "employeeNo": "100013",
      "name": "佐藤 太郎",
      "nameKana": "サトウ タロウ",
      "departmentCode": "JINJ",
      "position": "部長",
      "email": "user12@example.co.jp",
      "extension": "4012",
      "employmentStatus": "active",
      "hireDate": "2024-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "人事部"
    },
    {
      "employeeNo": "100025",
      "name": "佐藤 太郎",
      "nameKana": "サトウ タロウ",
      "departmentCode": "JINJ",
      "position": "部長",
      "email": "user24@example.co.jp",
      "extension": "4024",
      "employmentStatus": "retired",
      "hireDate": "2022-04-01",
      "retireDate": "2020-03-31",
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "人事部"
    },
…（長いので省略）
```

### A-07 範囲と複数選択の検索が効く（取引先）

- **確かめたいこと**: 定義の `operator: between` と `operator: in`
- **期待**: 200・与信 100万〜999万かつ締め日が10日/末日のものだけ
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/suppliers?creditLimit=1000000&creditLimit=9999999&closingDay=10&closingDay=31&pageSize=50
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "supplierCode": "S1004",
      "supplierName": "中部樹脂",
      "supplierNameKana": "チュウブジュシ",
      "supplierType": "corp",
      "invoiceNo": "T1000000000003",
      "postalCode": "103-1003",
      "address": "東京都千代田区4-4",
      "phone": "03-3003-5003",
      "creditLimit": "3000000",
      "closingDay": 31,
      "paymentSiteDays": 30,
      "tradeStatus": "suspended",
      "updatedAt": "2026-09-18 00:42:25.244326+00"
    },
    {
      "supplierCode": "S1008",
      "supplierName": "信州精密",
      "supplierNameKana": "シンシュウセイミツ",
      "supplierType": "corp",
      "invoiceNo": "T1000000000007",
      "postalCode": "107-1007",
      "address": "東京都千代田区8-8",
      "phone": "03-3007-5007",
      "creditLimit": "1000000",
      "closingDay": 31,
      "paymentSiteDays": 45,
      "tradeStatus": "active",
      "updatedAt": "2026-09-18 00:42:25.244326+00"
    },
    {
      "supplierCode": "S1009",
      "supplierName": "みどり商事",
      "supplierNameKana": "ミドリショウジ",
      "supplierType": "corp",
      "invoiceNo": "T1000000000008",
      "postalCode": "108-1008",
      "address": "東京都千代田区9-9",
      "phone": "03-3008-5008",
      "creditLimit": "3000000",
    
…（長いので省略）
```

### A-08 降順の指定が効く

- **確かめたいこと**: クエリ文字列の `sortAscending=false`（v0.9.0 で直った所）
- **期待**: 200・社員番号が大きい順
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/employees?sortField=employeeNo&sortAscending=false&pageSize=3
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "employeeNo": "100048",
      "name": "山田 恵",
      "nameKana": "ヤマダ メグミ",
      "departmentCode": "JOHO",
      "position": "担当",
      "email": "user47@example.co.jp",
      "extension": "4047",
      "employmentStatus": "active",
      "hireDate": "2017-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "情報システム部"
    },
    {
      "employeeNo": "100047",
      "name": "吉田 一郎",
      "nameKana": "ヨシダ イチロウ",
      "departmentCode": "EIG2",
      "position": "担当",
      "email": "user46@example.co.jp",
      "extension": "4046",
      "employmentStatus": "active",
      "hireDate": "2016-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "営業2課"
    },
    {
      "employeeNo": "100046",
      "name": "加藤 菜々",
      "nameKana": "カトウ ナナ",
      "departmentCode": "EIG1",
      "position": "担当",
      "email": "user45@example.co.jp",
      "extension": "4045",
      "employmentStatus": "active",
      "hireDate": "2015-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "営業1課"
    }
  
…（長いので省略）
```

### A-09 viewer には内線を**返さない**

- **確かめたいこと**: 定義の `roles: [admin, hr]`。隠すのではなく返さない
- **期待**: 200・extension を持たない
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/employees?pageSize=1
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "employeeNo": "100001",
      "name": "佐藤 太郎",
      "nameKana": "サトウ タロウ",
      "departmentCode": "JINJ",
      "position": "部長",
      "email": "user0@example.co.jp",
      "employmentStatus": "leave",
      "hireDate": "2012-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "人事部"
    }
  ],
  "totalCount": 48
}
```

### A-10 hr には内線を返す

- **確かめたいこと**: 同じ定義の裏側
- **期待**: 200・extension を持つ
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/employees?pageSize=1
```

**返ってきたもの**

```json
HTTP 200
{
  "items": [
    {
      "employeeNo": "100001",
      "name": "佐藤 太郎",
      "nameKana": "サトウ タロウ",
      "departmentCode": "JINJ",
      "position": "部長",
      "email": "user0@example.co.jp",
      "extension": "4000",
      "employmentStatus": "leave",
      "hireDate": "2012-04-01",
      "retireDate": null,
      "updatedAt": "2026-09-18 00:42:25.233741+00",
      "departmentName": "人事部"
    }
  ],
  "totalCount": 48
}
```

### A-11 画面と同じ検証がサーバでも効く

- **確かめたいこと**: 画面の検証は親切であって守りではない（前書きの validation-server の答え）
- **期待**: 400・必須と項目間の2件がまとめて返る
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3000/api/employees

{
  "employeeNo": "999999",
  "name": "",
  "nameKana": "テスト",
  "departmentCode": "JINJ",
  "employmentStatus": "retired",
  "hireDate": "2020-04-01",
  "retireDate": "2019-01-01"
}
```

**返ってきたもの**

```json
HTTP 400
{
  "valid": false,
  "errors": [
    {
      "field": "name",
      "message": "必須項目です"
    },
    {
      "field": "retireDate",
      "message": "退職日は入社日以降にしてください"
    }
  ]
}
```

### A-12 社員番号の形が違うと弾く

- **確かめたいこと**: 定義の `pattern`
- **期待**: 400・「社員番号は6桁の数字です」
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3000/api/employees

{
  "employeeNo": "12A456",
  "name": "試験",
  "nameKana": "シケン",
  "departmentCode": "JINJ",
  "employmentStatus": "active",
  "hireDate": "2020-04-01"
}
```

**返ってきたもの**

```json
HTTP 400
{
  "valid": false,
  "errors": [
    {
      "field": "employeeNo",
      "message": "社員番号は6桁の数字です"
    }
  ]
}
```

### A-13 hr は取引先を直せない

- **確かめたいこと**: 定義の `roles: [admin]`（CSV 出力）と同じ線を、書き込みにも引いた
- **期待**: 403
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3000/api/suppliers

{
  "supplierCode": "S9998",
  "supplierName": "試験",
  "supplierType": "individual",
  "creditLimit": 0,
  "closingDay": 10,
  "tradeStatus": "active"
}
```

**返ってきたもの**

```json
HTTP 403
{
  "message": "この操作は許可されていません"
}
```

### A-14 一括の上限を**サーバでも**守る（hr は20件）

- **確かめたいこと**: 画面が止めても API を直接叩けば通る。守る側が**定義から同じ数**を出す
- **期待**: 400・「1回に実行できるのは 20 件までです」
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3000/api/bulk/retire

{
  "keys": [
    "100001",
    "100002",
    "100003",
    "100004",
    "100005",
    "100006",
    "100007",
    "100008",
    "100009",
    "100010",
    "100011",
    "100012",
    "100013",
    "100014",
    "100015",
    "100016",
    "100017",
    "100018",
    "100019",
    "100020",
    "100021",
    "100022",
    "100023",
    "100024",
    "100025"
  ]
}
```

**返ってきたもの**

```json
HTTP 400
{
  "message": "1回に実行できるのは 20 件までです（25 件届きました）",
  "limit": 20
}
```

### A-15 admin は50件まで動かせる

- **確かめたいこと**: `maxRows.byRole` の裏側
- **期待**: 200・成功件数が返る
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3000/api/bulk/retire

{
  "keys": [
    "100001",
    "100002",
    "100003",
    "100004",
    "100005",
    "100006",
    "100007",
    "100008",
    "100009",
    "100010",
    "100011",
    "100012",
    "100013",
    "100014",
    "100015",
    "100016",
    "100017",
    "100018",
    "100019",
    "100020",
    "100021",
    "100022",
    "100023",
    "100024",
    "100025"
  ]
}
```

**返ってきたもの**

```json
HTTP 200
{
  "succeeded": 23,
  "rejected": [
    {
      "key": "100009",
      "reason": "すでに退職か、見つかりません"
    },
    {
      "key": "100025",
      "reason": "すでに退職か、見つかりません"
    }
  ]
}
```

### A-16 一括をもう一度押すと、失敗した行が**名指しで**返る

- **確かめたいこと**: 1件ずつ確定して、失敗した行だけ残す（前書きの partial-failure の答え）
- **期待**: 200・succeeded 0・rejected に行と理由
- **結果**: OK

**投げたもの**

```http
POST http://localhost:3000/api/bulk/retire

{
  "keys": [
    "100001",
    "100002",
    "100003"
  ]
}
```

**返ってきたもの**

```json
HTTP 200
{
  "succeeded": 0,
  "rejected": [
    {
      "key": "100001",
      "reason": "すでに退職か、見つかりません"
    },
    {
      "key": "100002",
      "reason": "すでに退職か、見つかりません"
    },
    {
      "key": "100003",
      "reason": "すでに退職か、見つかりません"
    }
  ]
}
```

### A-17 同時に直したら、あとの人を弾く

- **確かめたいこと**: 更新日時で見る（前書きの concurrency の答え）
- **期待**: 1回目 200・2回目 409
- **結果**: OK
- **補足**: 1回目=200 / 2回目=409

**投げたもの**

```http
PUT http://localhost:3000/api/employees/100030

{
  "employeeNo": "100030",
  "name": "渡辺 花子",
  "nameKana": "ワタナベ ハナコ",
  "departmentCode": "JOHO",
  "position": "主任",
  "email": "user29@example.co.jp",
  "extension": "4029",
  "employmentStatus": "active",
  "hireDate": "2013-04-01",
  "retireDate": null,
  "updatedAt": "2026-09-18 00:42:25.233741+00",
  "departmentName": "情報システム部"
}
```

**返ってきたもの**

```json
HTTP 409
{
  "message": "ほかの人が先に更新しています。読み直してください"
}
```

### A-18 参照されている部署は消せない（サーバも落ちない）

- **確かめたいこと**: 制約違反で**プロセスごと落ちた**ことがある（Express 4 は async の失敗を拾わない）
- **期待**: 409・そのあとも API は生きている
- **結果**: OK
- **補足**: 削除=409 / そのあとの health=200

**投げたもの**

```http
DELETE http://localhost:3000/api/departments/JINJ
```

**返ってきたもの**

```json
HTTP 409
{
  "message": "ほかのデータから使われているので消せません（先にそちらを直してください）"
}
```

### A-19 画面の定義を配っている

- **確かめたいこと**: 画面は定義のコピーを持たない（同じ1枚を読む）
- **期待**: 200・YAML が返る
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/definition.yaml
```

**返ってきたもの**

```json
HTTP 200
# yaml-language-server: $schema=https://github.com/ASIL-E-Hatake/hatake/raw/main/spec/hatake-page.schema.json
#
# 社内マスタメンテナンス — 画面の定義（これ1枚で4画面）。
#
# この定義は **flutter-src と node-src の両方が読む**。画面を描くのも、API が
# リクエストを検証するのも、同じこの1枚。だから definitions/ は案件の直下に置いてある。
#
#   npx hatake check definitions/app.yaml --project definitions/hatake.project.yaml
dsl_version: "1.0"

app:
  id: master_maintenance
  title: 社内マスタ
  home: employees
  # 配りうる役割の語彙。ここに無い名前をどこかに書いたら「誰にも見えません」と言われる。
  roles: [admin, hr, viewer]

  menu:
    - { id: employees, label: 社員マスタ, icon: people, page: employee_master }
    - { id: departments, label: 部署マスタ, icon: apartment, page: department_master }
    - { id: suppliers, label: 取引先マスタ, icon: store, page: supplier_master }

  pages:
    # ------------------------------------------------------------------
    # 社員マスタ（CRUD・権限・一括・CSV）
    # ------------------------------------------------------------------
    - type: crud
      id: employee_master
      title: 社員マスタ
      repository: employeeRepository
      key: employeeNo

      search:
        layout: { columns: 3 }
        filters:
          - { field: employeeNo, label: 社員番号, type: text, operator: equals }
          - {
…（長いので省略）
```

### A-20 API の形を定義から出せる

- **確かめたいこと**: サーバを書く人が読む1枚。手で書いていない
- **期待**: 200・schemas に SupplierMaster* が並ぶ
- **結果**: OK

**投げたもの**

```http
GET http://localhost:3000/api/openapi.json?page=supplier_master
```

**返ってきたもの**

```json
HTTP 200
{
  "openapi": "3.1.0",
  "info": {
    "title": "supplier_master",
    "version": "1.0.0"
  },
  "components": {
    "schemas": {
      "SupplierMasterRequest": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supplierCode",
          "supplierName",
          "supplierType",
          "creditLimit",
          "closingDay",
          "tradeStatus"
        ],
        "properties": {
          "supplierCode": {
            "type": "string",
            "maxLength": 10
          },
          "supplierName": {
            "type": "string"
          },
          "supplierNameKana": {
            "type": "string"
          },
          "supplierType": {
            "type": "string"
          },
          "invoiceNo": {
            "type": "string",
            "pattern": "^T[0-9]{13}$"
          },
          "postalCode": {
            "type": "string",
            "pattern": "^[0-9]{3}-?[0-9]{4}$"
          },
          "address": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "creditLimit": {
            "type": "number",
            "minimum": 0
          },
      
…（長いので省略）
```
