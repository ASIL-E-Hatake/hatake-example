#!/usr/bin/env node
// 採点（その1）: 定義を道具に通して、**値**で確かめる。試験の部屋（hatake-eval）の中で動く。
//
//   /work  … AI が作業したフォルダ（読むだけ）
//   /task  … 課題（task.json。extends を解いたもの＝run.sh が渡す）
//   /out   … 結果（values.json）
//
// 見るもの:
//   1. `hatake check --json` の事実が 0 件（読めない定義は、ここで落ちる）
//   2. 採点の側だけが持つシナリオを `hatake run --json` で回して、出たエラーの**項目**を見る
//      （文言は AI が決めるので見ない＝頼まれた文にも書いていない）
//
// 合否は**終了コードと JSON だけ**で決める。AI の自己申告（REPORT.md）はここでは読まない。

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/opt/grade/");
const { buildQuery, parseAppPagesYaml } = await import(require.resolve("@hatake-fw/api"));

const DEF = "/work/definitions/app.yaml";
const task = JSON.parse(readFileSync("/task/task.json", "utf8"));
const checks = [];
const note = [];
const put = (name, ok, detail = "", asks = "") => checks.push({ part: "値", name, ok, detail, asks });

const hatake = (...args) => {
  const done = spawnSync("hatake", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: done.status, out: done.stdout ?? "", err: done.stderr ?? "" };
};

if (!existsSync(DEF)) {
  put("定義がある", false, "definitions/app.yaml がありません");
  finish();
}

// 1. check
const checked = hatake("check", DEF, "--json");
let warnings = [];
try {
  const sheet = JSON.parse(checked.out);
  warnings = sheet.facts?.warnings ?? [];
  put("check の事実が 0 件", warnings.length === 0, warnings.map((one) => one.rule ?? one.id ?? "?").join(", "));
} catch {
  put("check の事実が 0 件", false, `check が読めない定義と言った: ${(checked.err || checked.out).slice(0, 300)}`);
  finish();
}

// 2. 採点する画面を探す（頼んだ項目を入力欄に持つ画面）
let pages = {};
try {
  pages = parseAppPagesYaml(readFileSync(DEF, "utf8"));
} catch (error) {
  put("画面が読める", false, String(error?.message ?? error).slice(0, 300));
  finish();
}
const want = task.page.hasField;
const hit = Object.values(pages).filter((one) => JSON.stringify(one.form ?? one.steps ?? {}).includes(`"${want}"`));
if (hit.length !== 1) {
  put(`${want} を入力欄に持つ画面が1枚`, false, `${hit.length} 枚（${Object.keys(pages).join(", ")}）`);
  finish();
}
const pageId = hit[0].id;
note.push(`採点した画面: ${pageId}（定義の中の画面は ${Object.keys(pages).length} 枚）`);

// 探し方（一部か・前方か）はサーバの仕事なので、サーバが使う口（buildQuery）の条件で見る。
// ブラウザの作り物の Repository は演算子を見ずにいつも部分一致なので、画面では分からない。
for (const one of task.queries ?? []) {
  const spec = buildQuery(hit[0].search, one.params);
  const got = spec.conditions.find((c) => c.field === one.want.field);
  put(one.name, got !== undefined && one.want.operator.includes(got.operator), got ? `${got.field} ${got.operator}` : "その項目で絞り込めない", one.asks);
}

// 3. シナリオ（期待は書かずに回して、答えをこちらで見る）
const cases = task.values.map((one) => ({ name: one.name, record: one.record, ...(one.mode ? { mode: one.mode } : {}) }));
writeFileSync("/tmp/scenario.json", JSON.stringify({ page: pageId, cases }, null, 2));
const ran = hatake("run", DEF, "--page", pageId, "--scenario", "/tmp/scenario.json", "--json");
let results = [];
try {
  results = JSON.parse(ran.out).results;
} catch {
  put("シナリオが回る", false, (ran.err || ran.out).slice(0, 300));
  finish();
}
for (const [i, want] of task.values.entries()) {
  const answer = results[i]?.answer ?? { errors: [] };
  const on = new Set(answer.errors.map((one) => one.field));
  const said = answer.errors.map((one) => `${one.field}: ${one.message}`).join(" / ") || "エラー無し";
  let ok = true;
  if (want.noErrors) ok &&= answer.errors.length === 0;
  for (const field of want.noErrorsOn ?? []) ok &&= !on.has(field);
  for (const field of want.errorsOn ?? []) ok &&= on.has(field);
  put(want.name, ok, said, want.asks);
}
finish();

/** 報告（REPORT.md）の「作らなかったもの」に、外のものを1つずつ挙げたか。 */
function reportChecks() {
  if (task.report === undefined) return;
  const part = (name, ok, detail, asks) => checks.push({ part: "報告", name, ok, detail, asks });
  const path = "/work/REPORT.md";
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = text.split("\n");
  const at = lines.findIndex((one) => /^#+\s/.test(one) && one.includes(task.report.section));
  let section = "";
  if (at >= 0) {
    const depth = lines[at].match(/^#+/)[0].length;
    const end = lines.findIndex((one, i) => i > at && new RegExp(`^#{1,${depth}}\\s`).test(one));
    section = lines.slice(at + 1, end < 0 ? undefined : end).join("\n");
  }
  part(`報告に「${task.report.section}」がある`, at >= 0, existsSync(path) ? "" : "REPORT.md がありません");
  for (const one of task.report.mustMention) {
    const word = one.any.find((w) => section.includes(w));
    part(`外と言えた: ${one.name}`, word !== undefined, word ? `「${word}」` : "", one.asks);
  }
}

function finish() {
  reportChecks();
  writeFileSync("/out/values.json", JSON.stringify({ checks, warnings, note }, null, 2));
  process.exit(0);
}
