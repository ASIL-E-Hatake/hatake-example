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

### `itemRepository` → `/api/items`

使う画面: 条件の組み合わせ / 押す前に聞く / 選択肢の連動 / 畳み込み / ステップ入力

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/items` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/items` | 登録 → 作ったレコード |
| `GET` | `/api/items/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/items/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/items/{key}` | 削除 → 204 |

### `lineRepository` → `/api/lines`

使う画面: 帳票

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/lines` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/lines` | 登録 → 作ったレコード |
| `GET` | `/api/lines/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/lines/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/lines/{key}` | 削除 → 204 |

### `groupRepository` → `/api/groups`

使う画面: 親の選択肢（選択肢の連動）

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/groups` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/groups` | 登録 → 作ったレコード |
| `GET` | `/api/groups/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/groups/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/groups/{key}` | 削除 → 204 |

### `childRepository` → `/api/children`

使う画面: 子の選択肢（親で絞る）

| メソッド | パス | 何をするか |
|---|---|---|
| `GET` | `/api/children` | 一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}` |
| `POST` | `/api/children` | 登録 → 作ったレコード |
| `GET` | `/api/children/{key}` | 1件 → レコード（無ければ 404） |
| `PUT` | `/api/children/{key}` | 修正 → 直したレコード |
| `DELETE` | `/api/children/{key}` | 削除 → 204 |

## 定義に書けない口（枠組みの外）

| メソッド | パス | 何をするか | なぜ定義に無いか |
|---|---|---|---|
| `GET` | `/api/definition.yaml` | 画面の定義を配る | この案件の作り（画面が定義のコピーを持たない） |
| `POST` | `/api/bulk/reprice` | まとめて単価を変える | 一括の中身はアプリ側（`plugin`） |
| `POST` | `/api/bulk/archive` | 書庫に入れる | 同上 |
| `POST` | `/api/reset` | データを初期状態に戻す | 証跡を撮り直すための口（この見本だけ） |

## 受け取る形・返す形（スキーマ）

定義から出せる（`hatake openapi`）。ただし**単票の定義しか読めない**ので、
画面を1枚ずつ切り出して渡す必要がある（app をそのまま渡すと落ちる）。
動いているサーバなら `GET /api/openapi.json?page=<画面 id>` が同じものを返す。
