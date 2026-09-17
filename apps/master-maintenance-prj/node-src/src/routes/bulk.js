// 一括（まとめて退職にする）。
//
// 定義に書いてあるのは「選んだ行にまとめて実行する」「1回 50 件まで（hr は 20 件）」
// までで、**中身はアプリ側**（前書きで `where: plugin` と宣言してある）。
//
// ここで効いているのが2つ:
//   ・**件数の上限をサーバでも守る**（checkBulkLimit）。画面が止めても API を直接
//     叩けば通るので、守る側が**同じ定義から同じ数**を出す
//   ・**1件ずつ確定して、失敗した行だけ返す**（前書きの partial-failure の答え）

import { Router } from "express";
import { checkBulkLimit } from "@hatake-fw/api";

import { record } from "../audit.js";
import { requireLogin } from "../auth.js";
import { requireRole } from "../authz.js";
import { pool } from "../db.js";
import { wrap } from "../wrap.js";
import { document, pageOf } from "../definition.js";

export function bulkRoutes() {
  const router = Router();
  const page = pageOf("employee_master");
  const action = page.actions.find((one) => one.id === "bulkRetire");

  router.use(requireLogin);

  router.post("/retire", requireRole(...action.roles), wrap(async (req, res) => {
    const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
    if (keys.length === 0) return res.status(400).json({ message: "行が選ばれていません" });

    // 上限は**定義から**引く（ここで別の数を書くと、画面と API で食い違う）。
    const breach = checkBulkLimit(document, "bulkRetire", keys.length, req.user.roles);
    if (breach !== null) {
      return res.status(400).json({ message: breach.message, limit: breach.limit });
    }

    // 1件ずつ確定する。**全部取り消さない**＝40件目で落ちても、39件は残る。
    const rejected = [];
    let succeeded = 0;
    for (const key of keys) {
      try {
        const result = await pool.query(
          `update employees set employment_status = 'retired', updated_at = now()
           where employee_no = $1 and employment_status <> 'retired'`,
          [key],
        );
        if (result.rowCount === 1) succeeded += 1;
        else rejected.push({ key, reason: "すでに退職か、見つかりません" });
      } catch (e) {
        rejected.push({ key, reason: e.message });
      }
    }

    await record({
      user: req.user.userId,
      action: "bulkRetire",
      target: "employees",
      detail: { asked: keys.length, succeeded, rejected: rejected.map((one) => one.key) },
    });

    // `rejected` に**行を名指しで**返す（定義の onError が {failedKeys} を使っている）。
    res.json({ succeeded, rejected });
  }));

  return router;
}
