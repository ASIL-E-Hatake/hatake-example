// 役割で止める。
//
// **画面の `roles` は見せ方だけ**（API を直接叩けばデータは取れる）。案件の前書きで
// `authz-server` の問いにこう答えてある:
//
//   役割で隠したものはサーバでも止める（画面の roles は親切であって守りではない）
//
// 何をどの役割に許すかは**定義に書いてある**（ボタンの `roles`・列と項目の `roles`）。
// ここはそれを `@hatake-fw/api` の口で読むだけで、**役割名をここに書かない**。
// 0.9.20 までは「直せる役割」をサーバに決め打ちしていて（`write: ["admin", "hr"]`）、
// 取引先は admin だけ、という決まりが定義のどこにも無かった＝画面では誰にでも
// 編集ボタンが出ていた。

import { canRunActionIn, visibleRecordIn } from "@hatake-fw/api";

import { document } from "./definition.js";

/**
 * その画面のボタン（`create` / `edit` / `delete` か、宣言したボタンの id）を押せる人だけ通す。
 *
 * 判定は `canRunActionIn`＝画面が出し分けるのと**同じ定義・同じ規則**（画面に無いボタンは
 * 押せない、宣言の roles から外れる人は押せない）。
 */
export const allow = (pageId, actionId) => (req, res, next) => {
  if (!canRunActionIn(document, pageId, actionId, req.user?.roles ?? [])) {
    // 403（居ることは認めるが、その操作は許さない）。404 にして隠す設計もあるが、
    // 社内システムなので「権限が足りない」と言ったほうが問い合わせが減る。
    return res.status(403).json({ message: "この操作は許可されていません" });
  }
  next();
};

/**
 * その人に見せない項目を落とす（見せない項目は**返さない**）。
 *
 * 列か入力欄の**どこか一つでも** `roles` から外れていれば落とす（`visibleRecordIn`）。
 * 0.9.20 までは列の roles だけを手で見ていて、詳細画面の項目の roles は見ていなかった。
 */
export const visibleRows = (pageId, rows, roles) =>
  rows.map((row) => visibleRecordIn(document, pageId, row, roles));
