# node-src — API（Express + `@hatake-fw/api`）

**画面と同じ定義**（`../definitions/app.yaml`）を読んで、リクエストを検証する API。

このフォルダの値打ちは「Express の書き方」ではなく、**同じ1枚の定義でフロントとバックが
揃う**ことを実際に見せているところ。

## 返す形

**`hatake_http`（Flutter の REST アダプタ）の契約**に合わせてある。揃えておくと、
画面側は `restRepositories(...)` の1行で繋がる（Repository を手で書かなくていい）。

```
GET    /api/employees?…      → {items, totalCount}
POST   /api/employees        → 作ったレコード
GET    /api/employees/{key}  → レコード（404）
PUT    /api/employees/{key}  → 直したレコード
DELETE /api/employees/{key}  → 204
```

> 最初 `{rows, total}` で書いていて、画面を繋ぐ段で食い違いに気づいた。
> **違う形を返すなら Repository を手で書く**、が本来の分かれ道（`Repository` は
> 5つのメソッドしかない）。ここは揃える側を選んだ。

## 定義から決まっていること（手で書いていない）

| | どこで | 何が起きるか |
|---|---|---|
| 検索できる条件 | `buildQuery(page.search, req.query)` | **定義に無い項目は無視**（`?evilColumn=1` は効かない） |
| 受け取る項目 | `page.form` | 書いていないキーは捨てる |
| 必須・桁・項目間 | `FormValidator` | **画面とまったく同じ規則**（`退職日は入社日以降` まで同じ） |
| 返さない列 | `page.table.columns[].roles` | `viewer` には内線を**返さない**（隠すのではなく返さない） |
| 一括の件数 | `checkBulkLimit` | `hr` は 20 件、`admin` は 50 件。**定義に書いてある数**をサーバが守る |
| API の形 | `deriveDto` → `toOpenApi` | `/api/openapi.json?page=<画面id>` |

試すと分かる:

```bash
# 定義に無い条件は無視される（許可リスト方式）
curl "localhost:3000/api/employees?evilColumn=1" -H "authorization: Bearer $TOKEN"

# 画面を通らない値も API で止まる
curl -XPOST localhost:3000/api/employees -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"employeeNo":"12","name":"","hireDate":"2020-04-01","retireDate":"2019-01-01"}'
# → 400 {"errors":[{"field":"name","message":"必須項目です"},
#                  {"field":"retireDate","message":"退職日は入社日以降にしてください"}]}
```

## 定義に**書けない**もの（この案件で外に置いたもの）

`npx hatake where 認証` に聞くと「枠組みの外」と返る。だからここが持っている:

| | ファイル | 前書きのどこで決めたか |
|---|---|---|
| ログイン・資格の確認 | `src/auth.js` `src/routes/auth.js` | `premises`（hatake は認証を持たない） |
| 役割で**本当に**止める | `src/authz.js` | `authz-server` の答え |
| 監査（誰が・いつ・何を） | `src/audit.js` | `audit` の答え |
| 同時更新の弾き方 | `src/routes/masters.js` | `concurrency` の答え（更新日時で見る） |
| 一括の失敗のあと始末 | `src/routes/bulk.js` | `partial-failure` の答え（1件ずつ確定） |
| 社員番号の採番 | **しない** | `numbering` の答え（人事が決めた番号を手で入れる） |
| 退職者の扱い | 物理削除しない | `erase` の答え（在籍区分を変えるだけ） |

**画面の `roles` は見せ方だけ**（API を直接叩けばデータは取れる）。`authz.js` が無いと、
`roles` は「隠しただけ」になる。

## 覚えておくと詰まらないこと

- 解析後のモデルは **`keyField` / `kind`**（YAML の `key` / `type` とは名前が違う）
- `updatedAt` は**見せる値ではなく合言葉**。Postgres の `timestamptz` を字のまま往復
  させている（`Date` にすると μ秒が落ちて、**必ず「他の人が先に更新しています」になる**）
- 検索のクエリは **Express の `req.query` をそのまま**渡してよい（文字列も配列も
  `buildQuery` が読む）。**先回りして整えない**＝整え方が定義側と食い違うと、画面と
  API で違う結果が出る

> この例を作る途中で、`buildQuery` が `sortAscending` の**文字列 `"false"`** を
> 昇順として読むのを見つけて、フレームワーク側を直しました（v0.9.0 に入っています）。
> **外から使ってみないと出ない種類の食い違い**で、このリポジトリを作る値打ちの1つ。

## 動かす

案件の根から `docker compose up`。単体で動かすなら:

```bash
npm install
PGHOST=localhost npm start
```
