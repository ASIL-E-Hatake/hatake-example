// async のハンドラを包む。
//
// Express 4 は **async 関数が投げた失敗を拾わない**。包まずに書くと、DB の制約違反
// ひとつで**プロセスごと落ちる**（画面からは「サーバが死んだ」に見える）。実際、
// 参照されている部署を消そうとして落ちた。
//
// Express 5 では要らなくなるが、包んでおけば両方で動く。

export const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
