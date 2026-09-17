// ログインと資格の確認。
//
// **ここは hatake の外**。`npx hatake where 認証` に聞くとこう返る:
//
//   [枠組みの外（hatake は持たない）] 認証（ログイン・トークンの発行）
//     hatake は持たない。ログイン画面は定義で作れるが、資格を確かめるのはサーバか認証基盤。
//
// 案件の前書き（hatake.project.yaml）でもそう決めてある:
//   - ログインは hatake の外。画面は定義で作るが、資格を確かめるのは API 側。
//   - 役割はログイン時にこのシステムが返す（admin / hr / viewer）。将来 AD に差し替える。

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SECRET = process.env.TOKEN_SECRET ?? randomBytes(32).toString("hex");
const TTL_MS = 8 * 60 * 60 * 1000;

/** パスワードを照合する（種は DB に入っている）。 */
export function verifyPassword(password, salt, hash) {
  const made = scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return made.length === known.length && timingSafeEqual(made, known);
}

/** 種つきのハッシュを作る（初期データの投入に使う）。 */
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

const sign = (body) => createHmac("sha256", SECRET).update(body).digest("base64url");

/** 署名つきのトークンを作る（状態を持たないので再起動で消えない）。 */
export function issueToken(user) {
  const body = Buffer.from(
    JSON.stringify({ sub: user.userId, roles: user.roles, exp: Date.now() + TTL_MS }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** トークンを読む。偽物・期限切れは null（**理由は返さない**＝総当たりの手掛かりにしない）。 */
export function readToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  if (sign(body) !== mac) return null;
  try {
    const claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return claim.exp > Date.now() ? claim : null;
  } catch {
    return null;
  }
}

/** ログインしていることを求める。 */
export function requireLogin(req, res, next) {
  const header = req.get("authorization") ?? "";
  const claim = readToken(header.replace(/^Bearer /, ""));
  if (claim === null) return res.status(401).json({ message: "ログインしてください" });
  req.user = { userId: claim.sub, roles: claim.roles };
  next();
}
