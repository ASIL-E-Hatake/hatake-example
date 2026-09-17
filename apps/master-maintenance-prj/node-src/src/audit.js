// 監査（誰が・いつ・何をしたか）。
//
// 案件の前書きで `audit` の問いにこう答えてある:
//   誰がいつ何を直したかを残す（削除と一括は必ず。監査表に残す）… 枠組みの外
//
// hatake は押されたことをアプリ側に渡すだけで、記録は持たない（誰がログインしているかも
// 知らない）。だからここで残す。

import { pool } from "./db.js";

export async function record({ user, action, target, key, detail }) {
  await pool.query(
    `insert into audit_log (user_id, action, target, target_key, detail)
     values ($1, $2, $3, $4, $5)`,
    [user, action, target, key ?? null, detail === undefined ? null : JSON.stringify(detail)],
  );
}
