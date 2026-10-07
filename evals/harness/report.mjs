#!/usr/bin/env node
// 試行を束ねて成績表を書く。試験の部屋の中で動く。
//
//   node report.mjs /runs/<版> /results/<版>/成績表.md
//
// 合格＝採点（値・画面・報告）が全部通り、画面の殻（web/）を触っていない。
// **汚染**（見本のリポジトリを取りに行った）試行は数から外して、外したと書く。

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [RUNS, TO] = process.argv.slice(2);
const read = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const avg = (list) => (list.length === 0 ? null : list.reduce((a, b) => a + b, 0) / list.length);
const fmt = (v, digits = 0) => (v === null || v === undefined ? "—" : Number(v).toFixed(digits));

const trials = [];
for (const task of readdirSync(RUNS).filter((one) => /^\d\d-/.test(one)).sort()) {
  for (const n of readdirSync(join(RUNS, task)).sort((a, b) => Number(a) - Number(b))) {
    const out = join(RUNS, task, n, "out");
    if (!existsSync(join(out, "digest.json"))) continue;
    const digest = read(join(out, "digest.json"), {});
    const webDiff = existsSync(join(out, "web-diff.txt")) ? readFileSync(join(out, "web-diff.txt"), "utf8").trim() : "（比べていない）";
    const checks = [
      ...read(join(out, "values.json"), { checks: [] }).checks,
      ...read(join(out, "screen.json"), { checks: [] }).checks,
      { part: "殻", name: "画面のコード（web/）を触っていない", ok: webDiff === "", detail: webDiff.split("\n").slice(0, 3).join(" / ") },
    ];
    const meta = read(join(out, "meta.json"), {});
    trials.push({ task, n, digest, checks, meta, warnings: read(join(out, "values.json"), { warnings: [] }).warnings });
  }
}

const passed = (one) => one.checks.length > 0 && one.checks.every((c) => c.ok);
const clean = trials.filter((one) => (one.digest.contaminated ?? []).length === 0);
const dirty = trials.filter((one) => (one.digest.contaminated ?? []).length > 0);
const meta = trials[0]?.meta ?? {};
const lines = [];
const say = (...more) => lines.push(...more);

say(
  `# 初見試験の成績表（${meta.tag ?? "?"}）`,
  "",
  "> hatake を知らない AI に、配った物（MCP・CLI・手引き）だけで頼んだ画面を作らせて、",
  "> **動かして**採点した結果。作り方は [evals/README.md](../../README.md)。この紙は `evals/run.sh report` が書く（手で直さない）。",
  "",
  "| | |",
  "|---|---|",
  `| モデル | ${meta.model ?? "?"} |`,
  `| Claude Code | ${meta.claude ?? "?"} |`,
  `| hatake | ${meta.hatake ?? "?"} |`,
  `| 上限 | ${meta.maxTurns ?? "?"} 往復・${meta.timeoutSec ?? "?"} 秒 |`,
  `| 回した日 | ${[...new Set(trials.map((one) => one.meta.date).filter(Boolean))].join("・")} |`,
  "",
  "## 合格率",
  "",
  "| 課題 | 合格 | 満たした（平均） | 往復（平均） | 時間（平均） | 費用の目安（平均） |",
  "|---|---|---|---|---|---|",
);
for (const task of [...new Set(clean.map((one) => one.task))]) {
  const mine = clean.filter((one) => one.task === task);
  const ok = mine.filter(passed).length;
  const ratio = avg(mine.map((one) => one.checks.filter((c) => c.ok).length / one.checks.length));
  say(
    `| ${task} | **${ok} / ${mine.length}** | ${fmt(ratio * 100)}% | ${fmt(avg(mine.map((one) => one.digest.turns ?? 0)))} | ${fmt(avg(mine.map((one) => one.digest.durationSec ?? 0)))} 秒 | $${fmt(avg(mine.map((one) => one.digest.costUsd ?? 0)), 2)} |`,
  );
}
say("", "費用は Claude Code が出す**目安**（サブスクで回すと請求はされない。席の利用枠から引かれる）。", "");

say("## 試行ごと", "", "| 課題 | # | 合否 | 満たした | 落ちた所 | 終わり方 | 往復 | 最初の道具 | 中身を読む |", "|---|---|---|---|---|---|---|---|---|");
for (const one of clean) {
  const failed = one.checks.filter((c) => !c.ok).map((c) => c.name);
  say(
    `| ${one.task} | ${one.n} | ${passed(one) ? "✅" : "❌"} | ${one.checks.filter((c) => c.ok).length} / ${one.checks.length} | ${failed.join("・") || "—"} | ${one.digest.ended} | ${one.digest.turns ?? "—"} | ${one.digest.firstHatake ?? "（呼ばない）"} | ${(one.digest.internals ?? []).length} |`,
  );
}
say("");

// 落ちた所（頼んだ文ごと）
const misses = new Map();
for (const one of clean) {
  for (const c of one.checks.filter((c) => !c.ok)) {
    const key = `${c.part}｜${c.name}`;
    const entry = misses.get(key) ?? { part: c.part, name: c.name, asks: c.asks ?? "", times: 0, details: [] };
    entry.times += 1;
    if (c.detail) entry.details.push(`#${one.task.slice(0, 2)}-${one.n}: ${c.detail}`);
    misses.set(key, entry);
  }
}
say("## 落ちた所", "");
if (misses.size === 0) say("なし。", "");
else {
  say("| 見た所 | 確かめたこと | 頼んだ文 | 落ちた回数 | 実際 |", "|---|---|---|---|---|");
  for (const one of [...misses.values()].sort((a, b) => b.times - a.times)) {
    say(`| ${one.part} | ${one.name} | ${one.asks || "—"} | ${one.times} | ${one.details.slice(0, 3).join("<br>").replace(/\|/g, "\\|") || "—"} |`);
  }
  say("");
}

// 止まった場所
say("## 止まった場所（道具と規則）", "", "合否とは別に、記録から抜いた事実。**次に直す所の候補**はここから起こす。", "");
const rules = new Map();
for (const one of clean) {
  const remained = new Set((one.warnings ?? []).map((w) => w.rule ?? w.id));
  for (const r of one.digest.rules ?? []) {
    const entry = rules.get(r.id) ?? { id: r.id, kind: r.kind, trials: 0, times: 0, remained: 0 };
    entry.trials += 1;
    entry.times += r.times;
    if (remained.has(r.id)) entry.remained += 1;
    rules.set(r.id, entry);
  }
}
say("### 道具が言った規則", "");
if (rules.size === 0) say("なし。", "");
else {
  say("| 規則 | 欄 | 出た試行 | 出た回数 | 最後まで残った試行 |", "|---|---|---|---|---|");
  for (const r of [...rules.values()].sort((a, b) => b.trials - a.trials || b.times - a.times)) {
    say(`| \`${r.id}\` | ${r.kind} | ${r.trials} / ${clean.length} | ${r.times} | ${r.remained} |`);
  }
  say("");
}

say("### 道具の失敗", "");
const errors = clean.flatMap((one) => (one.digest.toolErrors ?? []).map((e) => ({ ...e, at: `${one.task.slice(0, 2)}-${one.n}` })));
if (errors.length === 0) say("なし。", "");
else {
  say("| 試行 | 呼んだもの | 言われたこと |", "|---|---|---|");
  for (const e of errors.slice(0, 30)) say(`| ${e.at} #${e.n} | ${e.what.replace(/\|/g, "\\|")} | ${e.said.slice(0, 160).replace(/\|/g, "\\|")} |`);
  if (errors.length > 30) say(`| … | ほか ${errors.length - 30} 件 | |`);
  say("");
}

say("### 答えが大きすぎた道具", "", "Claude Code が答えをファイルに逃がした＝AI は拾い読みになる（読み落とす）。", "");
const spilled = clean.flatMap((one) => (one.digest.overflow ?? []).map((e) => ({ ...e, at: `${one.task.slice(0, 2)}-${one.n}` })));
if (spilled.length === 0) say("なし。", "");
else {
  say(`${new Set(spilled.map((e) => e.at)).size} / ${clean.length} 試行。`, "", "| 試行 | 呼んだもの | 大きさ |", "|---|---|---|");
  for (const e of spilled) say(`| ${e.at} #${e.n} | ${e.what.replace(/\|/g, "\\|")} | ${e.size} |`);
  say("");
}

say("### AI が書いた名前だけの `npx hatake`", "", "手元に入っていない所では registry の**別の道具**が走る書き方。手引きは直したが、AI は手引きを読まずにこう書く。", "");
const bare = clean.filter((one) => (one.digest.bareNpx ?? []).length > 0);
say(
  bare.length === 0
    ? "なし。"
    : `${bare.length} / ${clean.length} 試行・のべ ${bare.reduce((a, one) => a + one.digest.bareNpx.length, 0)} 回（例: ${bare[0].digest.bareNpx[0].what.slice(6, 90)}）`,
  "",
);

say("### 枠組みの中身を読みに行った", "", "道具と手引きで引けなかった、の証拠。", "");
const reads = clean.flatMap((one) => (one.digest.internals ?? []).map((e) => `${one.task.slice(0, 2)}-${one.n} #${e.n} ${e.what}`));
say(reads.length === 0 ? "なし。" : reads.slice(0, 30).map((one) => `- ${one}`).join("\n"), "");

say("### 使った道具（全試行の合計）", "");
const used = new Map();
for (const one of clean) for (const [name, times] of one.digest.hatakeCalls ?? []) used.set(name, (used.get(name) ?? 0) + times);
say(used.size === 0 ? "なし。" : [...used.entries()].sort((a, b) => b[1] - a[1]).map(([name, times]) => `\`${name}\` ${times}`).join("・"), "");

if (dirty.length > 0) {
  say("## 数から外した試行（汚染）", "", "見本のリポジトリなど、答えを外から取りに行った試行。", "");
  for (const one of dirty) say(`- ${one.task} #${one.n}: ${one.digest.contaminated.map((c) => c.what).join(" / ")}`);
  say("");
}

// 版ごとに比べる数（summary.json に残し、前の版の summary.json が在れば並べる）。
const sum = (pick) => clean.reduce((a, one) => a + (pick(one.digest) ?? 0), 0);
const trialsWith = (pick) => clean.filter((one) => (pick(one.digest) ?? 0) > 0).length;
const summary = {
  tag: meta.tag ?? "?",
  model: meta.model ?? "?",
  trials: clean.length,
  passed: clean.filter(passed).length,
  byTask: Object.fromEntries(
    [...new Set(clean.map((one) => one.task))].map((task) => {
      const mine = clean.filter((one) => one.task === task);
      return [task, { passed: mine.filter(passed).length, trials: mine.length }];
    }),
  ),
  stuck: {
    "答えが大きすぎた試行": trialsWith((d) => (d.overflow ?? []).length),
    "名前だけの npx を打った試行": trialsWith((d) => (d.bareNpx ?? []).length),
    "名前だけの npx（のべ）": sum((d) => (d.bareNpx ?? []).length),
    "断られた引数（のべ）": sum((d) => d.refusedArgs),
    "file で渡した（のべ）": sum((d) => d.fileArgs),
    "check を MCP で（のべ）": sum((d) => d.checkVia?.mcp),
    "check を CLI で（のべ）": sum((d) => d.checkVia?.cli),
    "where が載っていないと言った（のべ）": sum((d) => d.whereMisses),
    "examples が空振り（のべ）": sum((d) => d.examplesMisses),
    "中身を読みに行った試行": trialsWith((d) => (d.internals ?? []).length),
    "往復（平均）": clean.length === 0 ? 0 : Math.round(sum((d) => d.turns) / clean.length),
  },
};
const semver = (tag) => (tag.match(/\d+/g) ?? []).map(Number);
const older = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};
const RESULTS = dirname(dirname(TO));
const previous = (existsSync(RESULTS) ? readdirSync(RESULTS) : [])
  .filter((one) => /^v\d+\.\d+\.\d+$/.test(one) && older(one, summary.tag) && existsSync(join(RESULTS, one, "summary.json")))
  .sort((a, b) => (older(a, b) ? -1 : 1))
  .pop();
const compare = [];
if (previous !== undefined) {
  const before = JSON.parse(readFileSync(join(RESULTS, previous, "summary.json"), "utf8"));
  compare.push(
    `## 前の版（${previous}）との比較`,
    "",
    before.model === summary.model ? "" : `> モデルが違う（${before.model} → ${summary.model}）ので、差は道具だけのせいではない。\n`,
    `| | ${previous} | ${summary.tag} |`,
    "|---|---|---|",
    `| 合格 | ${before.passed} / ${before.trials} | ${summary.passed} / ${summary.trials} |`,
    ...Object.keys(summary.stuck).map((key) => `| ${key} | ${before.stuck?.[key] ?? "—"} | ${summary.stuck[key]} |`),
    "",
  );
}
const at = lines.indexOf("## 試行ごと");
if (compare.length > 0 && at >= 0) lines.splice(at, 0, ...compare.filter((one, i) => one !== "" || i !== 2));

mkdirSync(dirname(TO), { recursive: true });
writeFileSync(TO, `${lines.join("\n")}\n`);
writeFileSync(join(dirname(TO), "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`書きました: ${TO}（${clean.length} 試行${dirty.length > 0 ? `、汚染で外した ${dirty.length}` : ""}）`);
