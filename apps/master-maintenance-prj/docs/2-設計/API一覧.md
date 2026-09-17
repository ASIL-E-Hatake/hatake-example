# API 一覧

> **この紙は生成物です。** `tools/build-design-docs.mjs` が
> [定義](../../definitions/app.yaml)から起こしています（手で直さない）。
> 定義を直したら `node tools/build-design-docs.mjs` で作り直してください。
>
> **画面が要求している API**。定義から機械的に決まるので、サーバはこの形に合わせる。

画面は Repository に頼むだけで、HTTP を知らない。REST に載せる形は
`hatake_http` の契約で決まっていて、**画面ごとではなく Repository ごと**に決まる。

実装は [node-src](../../node-src/)。**画面と同じ定義で検証している**ので、
必須・桁・項目間の規則はここに書かない（[画面設計書](画面設計書/)が正）。

### `employeeRepository` → `/api/employees`

使う画面: 社員マスタ / 社員詳細

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/employees` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/employees` | 登録 → 作ったレコード |
| `GET` | `/api/employees/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/employees/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/employees/{key}` | 削除 → 204 |

### `departmentRepository` → `/api/departments`

使う画面: 部署マスタ

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/departments` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/departments` | 登録 → 作ったレコード |
| `GET` | `/api/departments/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/departments/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/departments/{key}` | 削除 → 204 |

### `supplierRepository` → `/api/suppliers`

使う画面: 取引先マスタ

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/suppliers` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/suppliers` | 登録 → 作ったレコード |
| `GET` | `/api/suppliers/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/suppliers/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/suppliers/{key}` | 削除 → 204 |

## 定義に書けない口（枠組みの外）

| メソッド | パス | 何をするか | なぜ定義に無いか |
|---|---|---|---|
| `POST` | `/api/auth/login` | ログイン | hatake は認証を持たない |
| `POST` | `/api/bulk/retire` | まとめて退職にする | 一括の中身はアプリ側（`plugin`） |
| `GET` | `/api/definition.yaml` | 画面の定義を配る | この案件の作り（画面が定義のコピーを持たない） |

## 受け取る形・返す形（スキーマ）

定義から出せる（`hatake openapi`）。ただし**単票の定義しか読めない**ので、
画面を1枚ずつ切り出して渡す必要がある（app をそのまま渡すと落ちる）。
動いているサーバなら `GET /api/openapi.json?page=<画面 id>` が同じものを返す。
