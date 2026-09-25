// マスタ3つの CRUD を、**定義から作る**（1本の作り方で3画面ぶん）。
//
// 画面ごとにルートを手で書かないのが要点。受け取る項目も、検索できる条件も、必須も
// 全部 `definitions/app.yaml` に書いてあるので、ここが持つのは「DB にどう当てるか」だけ。
//
// 定義から決まるもの:
//   ・検索できる条件  … buildQuery（**書いていない項目は無視**＝任意項目での検索を弾く）
//   ・受け取る項目    … page.form（書いていないキーは捨てる）
//   ・必須・桁・項目間 … FormValidator（画面とまったく同じ規則）
//   ・返さない列      … page.table.columns[].roles
//
// 返す形は **hatake_http（Flutter の REST アダプタ）の契約**に合わせる:
//
//   GET    <collection>?…      → {items, totalCount}
//   POST   <collection>        → 作ったレコード
//   GET    <collection>/{key}  → レコード（404 → null）
//   PUT    <collection>/{key}  → 直したレコード
//   DELETE <collection>/{key}  → 204
//
// 揃えておくと、画面側は `restRepositories(...)` の1行で繋がる（Repository を
// 手で書かなくていい）。**違う形を返すなら Repository を手で書く**、が本来の分かれ道。

import { Router } from "express";
import { buildQuery, FormValidator } from "@hatake-fw/api";

import { record } from "../audit.js";
import { requireLogin } from "../auth.js";
import { hideColumns, requireRole } from "../authz.js";
import { columnOf, pool, query } from "../db.js";
import { pageOf } from "../definition.js";
import { wrap } from "../wrap.js";

const validator = new FormValidator();

/** 定義の入力枠に書いてある項目だけを拾う（書いていないキーは**捨てる**）。 */
const fieldsOf = (page) =>
  (page.form?.sections ?? []).flatMap((section) => section.fields ?? []).map((f) => f.field);

const pick = (page, body) => {
  const allowed = new Set(fieldsOf(page));
  const out = {};
  for (const [key, value] of Object.entries(body ?? {})) {
    if (allowed.has(key)) out[key] = value === "" ? null : value;
  }
  return out;
};

/** QuerySpec を SQL に落とす。ここは**この案件の都合**（hatake は SQL を知らない）。 */
function toSql(table, spec, extra = []) {
  const where = [...extra];
  const params = [];
  for (const one of spec.conditions) {
    const column = `"${columnOf(one.field)}"`;
    if (one.operator === "contains") {
      params.push(`%${one.value}%`);
      where.push(`${column} ilike $${params.length}`);
    } else if (one.operator === "between") {
      const [from, to] = one.value;
      params.push(from, to);
      where.push(`${column} between $${params.length - 1} and $${params.length}`);
    } else if (one.operator === "in") {
      const list = Array.isArray(one.value) ? one.value : [one.value];
      const marks = list.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      where.push(`${column} in (${marks.join(", ")})`);
    } else {
      params.push(one.value);
      where.push(`${column} = $${params.length}`);
    }
  }
  const clause = where.length > 0 ? `where ${where.join(" and ")}` : "";
  // 並べ替えは**定義に在る列だけ**（渡された名前をそのまま SQL に入れない）。
  const order =
    spec.sortField === undefined
      ? ""
      : `order by "${columnOf(spec.sortField)}" ${spec.sortAscending ? "asc" : "desc"}`;
  params.push(spec.pageSize, spec.page * spec.pageSize);
  return {
    sql: `select * from ${table} ${clause} ${order} limit $${params.length - 1} offset $${params.length}`,
    countSql: `select count(*)::int as total from ${table} ${clause}`,
    params,
    countParams: params.slice(0, params.length - 2),
  };
}

/**
 * 1つのマスタぶんのルートを作る。
 *
 * @param {object} options
 * @param {string} options.pageId    定義の画面 id
 * @param {string} options.table     DB の表（書くとき）
 * @param {string} [options.readFrom] 読むとき（部署名のような**他の表から来る列**を
 *                                    足したビュー。既定は table）
 * @param {string[]} options.write   直せる役割
 */
export function masterRoutes({ pageId, table, readFrom = table, write }) {
  const router = Router();
  const page = pageOf(pageId);
  // 解析後のモデルは `keyFields` / `kind`（YAML の `key` / `type` とは名前が違う）。
  //
  // **0.9.7 から並び**になった（1件が2つ以上の列で決まる画面＝複合キーを持てる
  // ようにしたため）。この案件のマスタはどれも1つの列で決まるので、先頭だけ取る。
  // 複合キーを使う画面を足すなら、ここも道の区切りとして並べる必要がある。
  const key = page.keyFields[0];

  router.use(requireLogin);

  // 一覧（検索）。**条件は定義に書いてあるものだけ**通る。
  router.get("/", wrap(async (req, res) => {
    const spec = buildQuery(page.search, normalize(req.query));
    const { sql, countSql, params, countParams } = toSql(readFrom, spec);
    const [rows, counted] = await Promise.all([
      query(sql, params),
      pool.query(countSql, countParams),
    ]);
    res.json({
      items: hideColumns(page, rows, req.user.roles),
      totalCount: counted.rows[0].total,
    });
  }));

  // 1件。
  router.get("/:key", wrap(async (req, res) => {
    const rows = await query(`select * from ${readFrom} where "${columnOf(key)}" = $1`, [
      req.params.key,
    ]);
    if (rows.length === 0) return res.status(404).json({ message: "見つかりません" });
    res.json(hideColumns(page, rows, req.user.roles)[0]);
  }));

  // 登録。**画面とまったく同じ検証**を通す（画面を通らない値が API から入るのを止める）。
  router.post("/", requireRole(...write), wrap(async (req, res) => {
    const record_ = pick(page, req.body);
    const checked = validator.validate(page.form, record_);
    if (!checked.valid) return res.status(400).json({ valid: false, errors: checked.errors });

    const fields = Object.keys(record_);
    const columns = fields.map((f) => `"${columnOf(f)}"`).join(", ");
    const marks = fields.map((_, i) => `$${i + 1}`).join(", ");
    try {
      await pool.query(`insert into ${table} (${columns}) values (${marks})`, Object.values(record_));
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ message: "すでに登録されています" });
      throw e;
    }
    await record({ user: req.user.userId, action: "create", target: table, key: record_[key] });
    res.status(201).json(record_);
  }));

  // 修正。**更新日時が変わっていたら弾く**（前書きの concurrency の答え）。
  router.put("/:key", requireRole(...write), wrap(async (req, res) => {
    const record_ = pick(page, req.body);
    const checked = validator.validate(page.form, record_);
    if (!checked.valid) return res.status(400).json({ valid: false, errors: checked.errors });

    const seen = req.body?.updatedAt ?? null;
    const fields = Object.keys(record_).filter((f) => f !== key);
    const sets = fields.map((f, i) => `"${columnOf(f)}" = $${i + 1}`);
    const params = fields.map((f) => record_[f]);
    params.push(req.params.key);
    const result = await pool.query(
      `update ${table} set ${sets.join(", ")}, updated_at = now()
       where "${columnOf(key)}" = $${params.length}
         and ($${params.length + 1}::timestamptz is null or updated_at = $${params.length + 1})`,
      [...params, seen],
    );
    if (result.rowCount === 0) {
      // 居ないのか、他の人が先に直したのかを分けて言う（押した人が次にやることが違う）。
      const exists = await pool.query(
        `select 1 from ${table} where "${columnOf(key)}" = $1`, [req.params.key]);
      return exists.rowCount === 0
        ? res.status(404).json({ message: "見つかりません" })
        : res.status(409).json({
            message: "ほかの人が先に更新しています。読み直してください",
          });
    }
    await record({ user: req.user.userId, action: "update", target: table, key: req.params.key });
    // **直したレコードを返す**（契約。画面はこれで手元を入れ替える）。
    const [updated] = await query(
      `select * from ${readFrom} where "${columnOf(key)}" = $1`, [req.params.key]);
    res.json(hideColumns(page, [updated], req.user.roles)[0]);
  }));

  // 削除。**この案件では物理削除しない**（前書きの erase の答え）。
  router.delete("/:key", requireRole(...write), wrap(async (req, res) => {
    if (table !== "employees") {
      let result;
      try {
        result = await pool.query(
          `delete from ${table} where "${columnOf(key)}" = $1`, [req.params.key]);
      } catch (e) {
        // ほかから参照されている（23503）。押した人に**次にやること**が分かる言い方で返す。
        if (e.code === "23503") {
          return res.status(409).json({
            message: "ほかのデータから使われているので消せません（先にそちらを直してください）",
          });
        }
        throw e;
      }
      if (result.rowCount === 0) return res.status(404).json({ message: "見つかりません" });
    } else {
      const result = await pool.query(
        `update employees set employment_status = 'retired', updated_at = now()
         where employee_no = $1`, [req.params.key]);
      if (result.rowCount === 0) return res.status(404).json({ message: "見つかりません" });
    }
    await record({ user: req.user.userId, action: "delete", target: table, key: req.params.key });
    res.status(204).end();
  }));

  return router;
}

/**
 * Express の query をそのまま渡す。
 *
 * 文字列（`?sortAscending=false`）も配列（`?closingDay=10&closingDay=31`）も
 * `buildQuery` が読める。**ここで先回りして整えない**＝整え方が定義側と食い違うと、
 * 画面と API で違う結果が出る。
 */
const normalize = (query_) => ({ ...query_ });
