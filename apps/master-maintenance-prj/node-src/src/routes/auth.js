// ログイン（**hatake の外**）。
//
// 画面のログインフォームは定義でも作れるが、資格を確かめるのはここ。役割（admin / hr /
// viewer）もここで配る＝前書きの `role-source` の答え。

import { Router } from "express";

import { issueToken, verifyPassword } from "../auth.js";
import { pool } from "../db.js";
import { wrap } from "../wrap.js";

export function authRoutes() {
  const router = Router();

  router.post("/login", wrap(async (req, res) => {
    const { userId, password } = req.body ?? {};
    const found = await pool.query(
      "select user_id, display_name, roles, salt, password_hash from users where user_id = $1",
      [userId],
    );
    const user = found.rows[0];
    // **理由を分けない**（「その ID はありません」と言うと、在る ID を探せてしまう）。
    if (user === undefined || !verifyPassword(String(password ?? ""), user.salt, user.password_hash)) {
      return res.status(401).json({ message: "ID かパスワードが違います" });
    }
    res.json({
      token: issueToken({ userId: user.user_id, roles: user.roles }),
      user: { userId: user.user_id, displayName: user.display_name, roles: user.roles },
    });
  }));

  return router;
}
