// 役割で止める。
//
// **画面の `roles` は見せ方だけ**（API を直接叩けばデータは取れる）。案件の前書きで
// `authz-server` の問いにこう答えてある:
//
//   役割で隠したものはサーバでも止める（画面の roles は親切であって守りではない）
//
// ここが無いと、hatake の `roles` は「隠しただけ」になる。

/** その役割のどれかを持っていることを求める。 */
export const requireRole = (...allowed) => (req, res, next) => {
  const mine = req.user?.roles ?? [];
  if (!allowed.some((role) => mine.includes(role))) {
    // 403（居ることは認めるが、その操作は許さない）。404 にして隠す設計もあるが、
    // 社内システムなので「権限が足りない」と言ったほうが問い合わせが減る。
    return res.status(403).json({ message: "この操作は許可されていません" });
  }
  next();
};

/**
 * 画面の定義に書いてある `roles` を、そのまま API 側の判定に使う。
 *
 * **定義を正にする**のが要点。ここで別の表を持つと、画面では隠れているのに API では
 * 通る（またはその逆）が起きて、しかも誰も気づかない。
 */
export function rolesOfAction(page, actionId) {
  const action = (page.actions ?? []).find((one) => one.id === actionId);
  return action?.roles ?? [];
}

/** 定義で `roles` を書いていない列を落とす（見せない項目は**返さない**）。 */
export function hideColumns(page, rows, myRoles) {
  const hidden = (page.table?.columns ?? [])
    .filter((column) => Array.isArray(column.roles) && column.roles.length > 0)
    .filter((column) => !column.roles.some((role) => myRoles.includes(role)))
    .map((column) => column.field);
  if (hidden.length === 0) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const field of hidden) delete copy[field];
    return copy;
  });
}
