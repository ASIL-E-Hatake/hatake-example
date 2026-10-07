#!/usr/bin/env node
// 記録（claude -p の stream-json）から「どこで止まったか」を抜く。試験の部屋の中で動く。
//
//   node digest.mjs /out        … /out/transcript.jsonl を読んで /out/digest.json を書く
//
// ここが本命の出力。合否は採点（values / screen）が決めるので、ここは**事実を並べるだけ**:
//   ・道具をどの順で呼んだか（MCP と CLI）
//   ・道具が失敗した所（エラーの文）
//   ・規則の id がいつ出て、いつ消えたか（最後まで残ったもの）
//   ・枠組みの中身を読みに行ったか（＝道具と文書で引けなかった証拠）
//   ・答えを外から持ち込んでいないか（見本のリポジトリを取りに行ったら「汚染」）

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "/out";
const RULES = JSON.parse(readFileSync("/usr/local/lib/node_modules/@hatake-fw/api/spec/rule-ids.json", "utf8"));
const idsOf = (list) => (list ?? []).map((one) => (typeof one === "string" ? one : one.id)).filter(Boolean);
const WARNINGS = new Set(idsOf(RULES.warnings));
const ADVICE = new Set(idsOf(RULES.advice));
const RULE = new RegExp(`\\b(${[...WARNINGS, ...ADVICE].sort((a, b) => b.length - a.length).map((one) => one.replace(/[-]/g, "\\-")).join("|")})\\b`, "g");

const path = join(OUT, "transcript.jsonl");
const events = existsSync(path)
  ? readFileSync(path, "utf8")
      .split("\n")
      .filter((one) => one.trim().startsWith("{"))
      .map((one) => {
        try {
          return JSON.parse(one);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  : [];

const init = events.find((one) => one.type === "system" && one.subtype === "init");
const result = events.findLast((one) => one.type === "result");

const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((one) => (typeof one === "string" ? one : (one.text ?? ""))).join("\n")
      : "";

// 呼んだ道具と、その答えを組にする。
const calls = [];
const byId = new Map();
for (const one of events) {
  for (const block of one.message?.content ?? []) {
    if (one.type === "assistant" && block.type === "tool_use") {
      const call = { n: calls.length + 1, tool: block.name, input: block.input ?? {}, error: false, result: "" };
      calls.push(call);
      byId.set(block.id, call);
    }
    if (one.type === "user" && block.type === "tool_result") {
      const call = byId.get(block.tool_use_id);
      if (call === undefined) continue;
      call.error = block.is_error === true;
      call.result = textOf(block.content);
    }
  }
}

const short = (call) => {
  const i = call.input;
  if (call.tool === "Bash") return `Bash: ${String(i.command ?? "").replace(/\s+/g, " ").slice(0, 140)}`;
  if (["Read", "Write", "Edit"].includes(call.tool)) return `${call.tool}: ${i.file_path ?? ""}`;
  if (call.tool.startsWith("mcp__hatake__")) return `${call.tool.slice(13)}${i.page ? ` page=${i.page}` : ""}`;
  return call.tool;
};

// 「hatake <命令>」の形だけ数える（`cat hatake.project.yaml` は道具を呼んだのではない）。
const CLI = /(?:^|[\s;&|(])hatake(?:-mcp)?\s+([a-z][a-z-]*)/;
const hatakeCli = (call) => call.tool === "Bash" && CLI.test(String(call.input.command ?? ""));
const isHatake = (call) => call.tool.startsWith("mcp__hatake__") || hatakeCli(call);
const toolName = (call) =>
  call.tool.startsWith("mcp__hatake__")
    ? `mcp:${call.tool.slice(13)}`
    : `cli:${(String(call.input.command).match(CLI) ?? [])[1] ?? "?"}`;

// 規則の id の時系列。**定義について言った道具**の答えだけ数える（`pitfalls` や
// `reference` は規則を説明として並べるので、そこに出た id は「言われた」ではない）。
const JUDGES = new Set(["check", "validate", "advise", "ask", "fix"]);
const judged = (call) => JUDGES.has(toolName(call).replace(/^(mcp:hatake_|cli:)/, ""));
const timeline = new Map();
for (const call of calls.filter(isHatake).filter(judged)) {
  for (const id of new Set(call.result.match(RULE) ?? [])) {
    const seen = timeline.get(id) ?? { id, kind: WARNINGS.has(id) ? "事実" : "助言", first: call.n, last: call.n, times: 0 };
    seen.last = call.n;
    seen.times += 1;
    timeline.set(id, seen);
  }
}

const writesDef = calls.filter((one) => ["Write", "Edit"].includes(one.tool) && String(one.input.file_path ?? "").includes("definitions/"));
const internals = calls.filter((one) => {
  const where = `${one.input.file_path ?? ""} ${one.input.command ?? ""} ${one.input.path ?? ""} ${one.input.pattern ?? ""}`;
  return /node_modules\/@hatake-fw|lib\/node_modules\/@hatake-fw/.test(where);
});
const outside = calls.filter((one) => {
  const where = `${one.input.command ?? ""} ${one.input.url ?? ""}`;
  return /hatake-example|git\s+clone|github\.com\/ASIL-E-Hatake/.test(where) || ["WebFetch", "WebSearch"].includes(one.tool);
});

// 答えが大きすぎて、Claude Code がファイルに逃がしたもの（AI は grep で拾い読みすることになる）。
const overflow = calls
  .filter((one) => /exceeds maximum allowed tokens/.test(one.result))
  .map((one) => ({ n: one.n, what: short(one), size: (one.result.match(/\(([\d,]+ characters[^)]*)\)/) ?? [])[1] ?? "" }));
// AI が自分で書いた**名前だけの** `npx hatake`（手元に入っていない所では registry の別物が走る）。
const BARE_NPX = new RegExp(`\\bnpx\\s+(?:--yes\\s+|-y\\s+)?${"hat"}ake(?:-mcp)?\\b`);
const bareNpx = calls.filter((one) => one.tool === "Bash" && BARE_NPX.test(String(one.input.command ?? ""))).map((one) => ({ n: one.n, what: short(one) }));

// 版ごとに比べたい数（成績表の「前の版との比較」に出す）。
const mcpCalls = calls.filter((one) => one.tool.startsWith("mcp__hatake__"));
const refusedArgs = mcpCalls.filter((one) => one.error && /知らない引数/.test(one.result)).length;
// ファイルの道で渡した回数（0.9.28 は `file`、0.9.29 から `file_path`）。
const fileArgs = mcpCalls.filter(
  (one) => one.tool !== "mcp__hatake__hatake_examples" && (typeof one.input.file === "string" || typeof one.input.file_path === "string"),
).length;
// Claude Code 自身の道具に hatake の引数名を渡して断られた回数（0.9.28 で `Write` に `file`）。
const wrongToolArg = calls.filter(
  (one) => ["Write", "Read", "Edit"].includes(one.tool) && one.error && /unexpected parameter `file`/.test(one.result),
).length;
// 断られたときに「近い名前」が添えられた回数（0.9.29 から）。
const nearHints = mcpCalls.filter((one) => one.error && /近い名前/.test(one.result)).length;
const whereMisses = mcpCalls.filter((one) => one.tool === "mcp__hatake__hatake_where" && /載っていません/.test(one.result)).length;
const examplesMisses = mcpCalls.filter((one) => one.tool === "mcp__hatake__hatake_examples" && /近い例はありません/.test(one.result)).length;
// reference が「DSL に無い名前」と返した回数（0.9.29 で maxLength を引いて空振りした。0.9.30 から値でも引ける）。
const referenceMisses = mcpCalls.filter((one) => one.tool === "mcp__hatake__hatake_reference" && /DSL に無い名前/.test(one.result)).length;
const checkVia = {
  mcp: mcpCalls.filter((one) => /hatake_(check|validate)$/.test(one.tool)).length,
  cli: calls.filter((one) => hatakeCli(one) && /^(check|validate)$/.test((String(one.input.command).match(CLI) ?? [])[1] ?? "")).length,
};

const count = (list) => Object.entries(list.reduce((acc, one) => ({ ...acc, [one]: (acc[one] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);

const digest = {
  model: init?.model ?? null,
  mcp: (init?.mcp_servers ?? []).map((one) => `${one.name}:${one.status}`),
  ended: result?.subtype ?? "記録が終わっていない",
  turns: result?.num_turns ?? null,
  costUsd: result?.total_cost_usd ?? null,
  durationSec: result?.duration_ms ? Math.round(result.duration_ms / 1000) : null,
  usage: result?.usage ?? null,
  calls: calls.length,
  hatakeCalls: count(calls.filter(isHatake).map(toolName)),
  firstHatake: calls.find(isHatake) ? toolName(calls.find(isHatake)) : null,
  firstDefinitionWrite: writesDef[0]?.n ?? null,
  definitionWrites: writesDef.length,
  toolErrors: calls.filter((one) => one.error).map((one) => ({ n: one.n, what: short(one), said: one.result.replace(/\s+/g, " ").slice(0, 300) })),
  rules: [...timeline.values()].sort((a, b) => b.times - a.times),
  internals: internals.map((one) => ({ n: one.n, what: short(one) })),
  overflow,
  bareNpx,
  refusedArgs,
  fileArgs,
  wrongToolArg,
  nearHints,
  whereMisses,
  examplesMisses,
  referenceMisses,
  checkVia,
  contaminated: outside.map((one) => ({ n: one.n, what: short(one) })),
  sequence: calls.map((one) => `${one.n}. ${short(one)}${one.error ? " ✗" : ""}`),
};
writeFileSync(join(OUT, "digest.json"), JSON.stringify(digest, null, 2));
console.log(`${digest.ended}・往復 ${digest.turns}・道具 ${digest.calls} 回（hatake ${calls.filter(isHatake).length}）・失敗 ${digest.toolErrors.length}・中身を読む ${digest.internals.length}・汚染 ${digest.contaminated.length}`);
