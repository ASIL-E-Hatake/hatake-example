// Postgres への口。
//
// hatake は DB を知らない（Repository の契約しか知らない）ので、ここは**この案件の
// 都合**で書く。定義から決まるのは「どの項目を受け取るか」まで。

import pg from "pg";

// `date` 列（OID 1082）は**文字列のまま**受け取る。既定だと Date になり、時刻ぶんを
// 落とすか足すかで日付がずれる（画面に出すのは "2020-04-01" のような字）。
// `timestamptz`（OID 1184）も**文字列のまま**。Date にすると μ秒が落ちて、
// 返した `updatedAt` をそのまま送り返しても一致しなくなる＝**必ず「他の人が先に
// 更新しています」になる**（同時更新の判定に使っているので致命的）。
// 画面にとって `updatedAt` は**見せる値ではなく合言葉**なので、字のまま往復させる。
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1184, (value) => value);

export const pool = new pg.Pool({
  host: process.env.PGHOST ?? "db",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "hatake",
  password: process.env.PGPASSWORD ?? "hatake",
  database: process.env.PGDATABASE ?? "master_maintenance",
});

/** camelCase の項目名 → snake_case の列名（DB は業務システムの慣習に合わせる）。 */
export const columnOf = (field) =>
  field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** 行の列名を項目名に戻す（画面と定義は camelCase で話す）。 */
export const toRow = (record) => {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return out;
};

export async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows.map(toRow);
}
