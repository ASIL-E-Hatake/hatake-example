// API のテストを回して、**納品用の記録**を Markdown に落とす（案件をまたいで使い回す版）。
//
// ここは**枠組みの外**。hatake が持つのは「定義から試験を起こす」「動かして答えを見る」
// までで、**エビデンスの体裁は案件ごとに違う**（客先の様式がある）ので、認証と同じく
// アプリ側に置く。
//
// 1本目（master-maintenance-prj）では案件の中に全部書いていたが、**案件ごとに違うのは
// ケースとログインの仕方だけ**だったので、回す側と書き出す側をここに上げた。
// 案件側に残るのは `tests/api/run.mjs`（ケースの並び）だけ。
//
// 決めごと4つ:
//   ・**実際のリクエストとレスポンスをそのまま載せる**（要約しない。要約した記録は
//     「本当にそう返ったか」を確かめられない＝エビデンスにならない）
//   ・**1件ごとに項番を持つ**（`docs/4-テスト/ケース一覧.md` の A-xx と同じ字）
//   ・**落ちても最後まで回す**（1件目で止まると、残りが「試していない」のか
//     「通った」のか分からなくなる）
//   ・**通らなかった件は記録にもそう書く**（都合の悪い結果を落とさない）

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** コマンドラインの `--name value` を読む小さな助け（案件側から使う）。 */
export function argOf(name, fallback) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
}

/**
 * 1件叩いて、やりとりをそのまま返す。
 *
 * `headersFor(who)` は案件が決める（この案件は Bearer だが、Cookie の案件もある）。
 */
export function caller(base, headersFor) {
  return async function call({ who = null, method = "GET", path, body }) {
    const url = `${base}${path}`;
    const headers = {
      ...headersFor(who),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    };
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = text === "" ? null : JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { method, url, body, status: response.status, response: parsed };
  };
}

const short = (value, limit = 1200) => {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n…（長いので省略）` : text;
};

/**
 * ケースを順に回して、記録を書く。
 *
 * 1件でも期待と違えば**終了コード 1**（記録は書いたうえで落とす＝都合の悪い結果も残る）。
 */
export async function runApiReport({ base, out, cases, note }) {
  const lines = [
    "# API テスト結果（実行記録）",
    "",
    "> **この紙は生成物です。** `tests/api/run.mjs` が実際に API を叩いて、",
    "> **やりとりをそのまま**書き出しています（手で直さない）。",
    "> 作り直し: `bash tools/run-tests.sh`",
    "",
    `- 実行日時: ${new Date().toISOString()}`,
    `- 対象: \`${base}\``,
    "- 前提: `docker compose up` で DB が初期データの状態",
    ...(note === undefined ? [] : ["", note]),
    "",
  ];

  let passed = 0;
  const rows = [];
  const bodies = [];

  for (const one of cases) {
    let result;
    let ok = false;
    let error;
    try {
      result = await one.run();
      ok = await one.check(result);
    } catch (e) {
      error = e;
    }
    if (ok) passed += 1;
    rows.push(`| ${one.id} | ${one.title} | ${ok ? "OK" : "**NG**"} | ${result?.status ?? "—"} |`);

    bodies.push(
      [
        `### ${one.id} ${one.title}`,
        "",
        `- **確かめたいこと**: ${one.why}`,
        `- **期待**: ${one.expect}`,
        `- **結果**: ${ok ? "OK" : "**NG**"}`,
        ...(result?.note ? [`- **補足**: ${result.note}`] : []),
        "",
        "**投げたもの**",
        "",
        "```http",
        `${result?.method ?? "?"} ${result?.url ?? "?"}`,
        ...(result?.body === undefined ? [] : ["", short(result.body)]),
        "```",
        "",
        "**返ってきたもの**",
        "",
        "```json",
        error ? `（例外）${error.message}` : `HTTP ${result.status}\n${short(result.response)}`,
        "```",
        "",
      ].join("\n"),
    );
  }

  lines.push(
    `## まとめ（${passed} / ${cases.length} 件）`,
    "",
    "| 項番 | 内容 | 結果 | HTTP |",
    "|---|---|---|---|",
    ...rows,
    "",
    "---",
    "",
    "## 1件ごとの記録",
    "",
    ...bodies,
  );

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n"), "utf8");
  console.log(`${passed} / ${cases.length} 件が期待どおり。書きました: ${out}`);
  if (passed !== cases.length) process.exit(1);
}
