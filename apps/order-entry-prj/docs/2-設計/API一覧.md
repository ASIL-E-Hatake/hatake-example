# API 一覧

> **この紙は生成物です。** `tools/build-design-docs.mjs` が
> [定義](../../definitions/app.yaml)から起こしています（手で直さない）。
> 定義を直したら `node tools/build-design-docs.mjs` で作り直してください。
>
> **画面が要求している API**。定義から機械的に決まるので、サーバはこの形に合わせる。

画面は Repository に頼むだけで、HTTP を知らない。REST に載せる形は
`hatake_http` の契約で決まっていて、**画面ごとではなく Repository ごと**に決まる。

実装は [java-src](../../java-src/)。**画面と同じ定義で検証している**ので、
必須・桁・項目間の規則はここに書かない（[画面設計書](画面設計書/)が正）。

### `orderRepository` → `/api/orders`

使う画面: 受注照会 / 受注入力 / 受注詳細 / 受注ダッシュボード

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/orders` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/orders` | 登録 → 作ったレコード |
| `GET` | `/api/orders/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/orders/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/orders/{key}` | 削除 → 204 |

### `orderLineRepository` → `/api/order-lines`

使う画面: 注文請書

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/order-lines` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/order-lines` | 登録 → 作ったレコード |
| `GET` | `/api/order-lines/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/order-lines/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/order-lines/{key}` | 削除 → 204 |

### `customerRepository` → `/api/customers`

使う画面: 取引先の選択肢（受注照会の条件・受注入力の取引先）

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/customers` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/customers` | 登録 → 作ったレコード |
| `GET` | `/api/customers/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/customers/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/customers/{key}` | 削除 → 204 |

### `productRepository` → `/api/products`

使う画面: 商品の選択肢（明細の商品・単価の出どころ）

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/products` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/products` | 登録 → 作ったレコード |
| `GET` | `/api/products/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/products/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/products/{key}` | 削除 → 204 |

## 定義に書けない口（枠組みの外）

| メソッド | パス | 何をするか | なぜ定義に無いか |
|---|---|---|---|
| `POST` | `/api/auth/login` | ログイン | hatake は認証を持たない |
| `POST` | `/api/bulk/cancel` | まとめて取り消す | 一括の中身はアプリ側（`plugin`） |
| `POST` | `/api/orders/{orderNo}/ship` | 出荷指示を基幹システムへ投げる | 外部システム連携は枠組みの外（前書きの shipmentGateway） |
| `GET` | `/api/definition.yaml` | 画面の定義を配る | この案件の作り（画面が定義のコピーを持たない） |

## 受け取る形・返す形（スキーマ）

定義から出せる（`hatake openapi`）。ただし**単票の定義しか読めない**ので、
画面を1枚ずつ切り出して渡す必要がある（app をそのまま渡すと落ちる）。
動いているサーバなら `GET /api/openapi.json?page=<画面 id>` が同じものを返す。
