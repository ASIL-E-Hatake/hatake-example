#!/usr/bin/env node
// 読み物のリンク切れを数える（リポジトリの中を指すものだけ）。
//
// この見本は「どの紙をどの順で読むか」を紙どうしのリンクで繋いでいる（README の
// 「はじめての方へ」、AI で作る道筋）。ファイルを動かしたり名前を変えたりすると、
// **リンクだけが黙って切れる**（読み物は試験が落ちないので気づけない）。
//
// 見るのは `](相対パス)` の形だけ。http(s) と `#` だけのものは見ない。
// 使い方: node tools/check-links.mjs        （切れていれば終了コード 1）

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "build", "dist", ".dart_tool", ".gradle"]);

function markdownFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) markdownFiles(path, out);
    else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

const LINK = /\]\(([^)\s]+)\)/g;
const broken = [];
let seen = 0;
for (const file of markdownFiles(ROOT)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(LINK)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
    seen += 1;
    const path = decodeURIComponent(target.split("#")[0]);
    if (path === "") continue;
    if (!existsSync(resolve(dirname(file), path))) {
      broken.push(`${relative(ROOT, file)}: ${target}`);
    }
  }
}

if (broken.length > 0) {
  console.log(`切れているリンクが ${broken.length} 件あります（相対リンク ${seen} 件のうち）:`);
  for (const one of broken) console.log(`  ${one}`);
  process.exit(1);
}
console.log(`相対リンク ${seen} 件は、全部在るものを指しています。`);
