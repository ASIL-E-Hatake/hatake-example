#!/usr/bin/env node
// 名前だけの `npx hatake` が書いてないかを数える（枠組みの `safeNpx.test.ts` と同じ規則）。
//
// 枠組みは npm の registry に出していない。registry には `hatake` という**別の人の、名前が
// 同じだけの道具**が在るので、手元に入っていない場所で `npx hatake …` と打つと、それを取って
// きて、こちらの引数で走らせる。書くときは `npx -p @hatake-fw/api hatake …`（入っていなければ
// 404 で止まる）。
//
// 見る所: 手引き・CLAUDE.md・`.claude/` の許可と依頼文・道具・コードのコメント。
// 見ない所: 移行の記録の地の文（起きたことの記録）と、危なさを説明している行（同じ行に
// `registry` か正しい書き方が在る）。
//
// 使い方: node tools/check-npx.mjs        （見つかれば終了コード 1）

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "build", "dist", ".dart_tool", ".gradle"]);
const TEXT = /\.(md|txt|ts|tsx|mjs|js|json|ya?ml|dart|java|sh)$/;
// この道具自身の字に当たらないよう、つないで作る。
const BARE = new RegExp(`\\bnpx\\s+(?:--yes\\s+|-y\\s+)?${"hat"}ake(?:-mcp)?\\b`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEXT.test(name)) out.push(path);
  }
  return out;
}

const found = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (rel === "tools/check-npx.mjs") continue;
  const history = basename(file).startsWith("移行-");
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (!BARE.test(line)) return;
      if (line.includes("registry") || line.includes("-p @hatake-fw/api")) return;
      // 移行の記録は地の文を残す。ただし**写して叩くコマンドの行**は数える（貼れば走るので）。
      if (history && !/^\s*npx\s/.test(line)) return;
      found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
}

if (found.length > 0) {
  console.log(`名前だけの npx hatake が ${found.length} か所あります（npx -p @hatake-fw/api hatake … と書く）:`);
  for (const one of found) console.log(`  ${one}`);
  process.exit(1);
}
console.log("名前だけの npx hatake はありません。");
