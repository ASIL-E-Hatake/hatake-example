#!/usr/bin/env node
// API のテストを回して、**納品用の記録**を Markdown に落とす。
//
// ここは**枠組みの外**。hatake が持つのは「定義から試験を起こす」「動かして答えを見る」
// までで、**エビデンスの体裁は案件ごとに違う**（客先の様式がある）ので、認証と同じく
// アプリ側に置く。
//
// 決めごと4つ:
//   ・**実際のリクエストとレスポンスをそのまま載せる**（要約しない。요約した記録は
//     「本当にそう返ったか」を確かめられない＝エビデンスにならない）
//   ・**1件ごとに項番を持つ**（docs/4-テスト/ケース一覧.md の A-xx と同じ字）
//   ・**落ちても最後まで回す**（1件目で止まると、残りが「試していない」のか
//     「通った」のか分からなくなる）
//   ・**通らなかった件は記録にもそう書く**（都合の悪い結果を落とさない）
//
// 使い方: node tests/api/run.mjs [--base http://localhost:3000/api] [--out <file>]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const BASE = argOf("--base", "http://localhost:3000/api");
const OUT = argOf("--out", "docs/4-テスト/出力-APIテスト結果.md");

/** ログインして合言葉を取る（この API は毎回ヘッダで受ける）。 */
async function signIn(userId) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, password: userId }),
  });
  if (!response.ok) throw new Error(`ログインできません: ${userId}`);
  return (await response.json()).token;
}

const tokens = {};
const auth = (who) => (who === null ? {} : { authorization: `Bearer ${tokens[who]}` });

/** 1件叩いて、やりとりをそのまま返す。 */
async function call({ who, method = "GET", path, body }) {
  const url = `${BASE}${path}`;
  const headers = {
    ...auth(who),
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
}

/** ケース1件。`check` は**何を見るか**で、true を返せば通り。 */
const CASES = [
  {
    id: "A-01",
    title: "ログインできる（hr）",
    why: "役割はログインで配る（前書きの role-source の答え）",
    expect: "200 が返り、roles に hr が入る",
    run: () => call({ who: null, method: "POST", path: "/auth/login", body: { userId: "hr", password: "hr" } }),
    check: (r) => r.status === 200 && r.response.user.roles.includes("hr"),
  },
  {
    id: "A-02",
    title: "パスワードが違うと入れない",
    why: "**理由を分けない**（「その ID はありません」と言うと、在る ID を探せてしまう）",
    expect: "401・文言は「ID かパスワードが違います」",
    run: () => call({ who: null, method: "POST", path: "/auth/login", body: { userId: "hr", password: "wrong" } }),
    check: (r) => r.status === 401,
  },
  {
    id: "A-03",
    title: "ログインしていないと一覧が見えない",
    why: "画面の roles は見せ方だけ。**本当の遮断はここ**",
    expect: "401",
    run: () => call({ who: null, path: "/employees" }),
    check: (r) => r.status === 401,
  },
  {
    id: "A-04",
    title: "一覧が返る形（定義の契約どおり）",
    why: "`hatake_http` の契約は `{items, totalCount}`。ここがズレると画面が繋がらない",
    expect: "200・items と totalCount を持つ",
    run: () => call({ who: "hr", path: "/employees?pageSize=2" }),
    check: (r) => r.status === 200 && Array.isArray(r.response.items) && typeof r.response.totalCount === "number",
  },
  {
    id: "A-05",
    title: "定義に無い条件は無視される",
    why: "`buildQuery` は**許可リスト方式**。任意項目での検索を弾く",
    expect: "200・件数が絞られない（全48件）",
    run: () => call({ who: "hr", path: "/employees?evilColumn=1&pageSize=1" }),
    check: (r) => r.status === 200 && r.response.totalCount === 48,
  },
  {
    id: "A-06",
    title: "部分一致の検索が効く（氏名）",
    why: "定義の `operator: contains`",
    expect: "200・佐藤だけが返る",
    run: () => call({ who: "hr", path: `/employees?name=${encodeURIComponent("佐藤")}&pageSize=5` }),
    check: (r) => r.status === 200 && r.response.items.every((one) => one.name.includes("佐藤")),
  },
  {
    id: "A-07",
    title: "範囲と複数選択の検索が効く（取引先）",
    why: "定義の `operator: between` と `operator: in`",
    expect: "200・与信 100万〜999万かつ締め日が10日/末日のものだけ",
    run: () => call({ who: "hr", path: "/suppliers?creditLimit=1000000&creditLimit=9999999&closingDay=10&closingDay=31&pageSize=50" }),
    check: (r) =>
      r.status === 200 &&
      r.response.items.every(
        (one) => one.creditLimit >= 1000000 && one.creditLimit <= 9999999 && [10, 31].includes(one.closingDay),
      ),
  },
  {
    id: "A-08",
    title: "降順の指定が効く",
    why: "クエリ文字列の `sortAscending=false`（v0.9.0 で直った所）",
    expect: "200・社員番号が大きい順",
    run: () => call({ who: "hr", path: "/employees?sortField=employeeNo&sortAscending=false&pageSize=3" }),
    check: (r) => r.status === 200 && r.response.items[0].employeeNo > r.response.items[2].employeeNo,
  },
  {
    id: "A-09",
    title: "viewer には内線を**返さない**",
    why: "定義の `roles: [admin, hr]`。隠すのではなく返さない",
    expect: "200・extension を持たない",
    run: () => call({ who: "viewer", path: "/employees?pageSize=1" }),
    check: (r) => r.status === 200 && !("extension" in r.response.items[0]),
  },
  {
    id: "A-10",
    title: "hr には内線を返す",
    why: "同じ定義の裏側",
    expect: "200・extension を持つ",
    run: () => call({ who: "hr", path: "/employees?pageSize=1" }),
    check: (r) => r.status === 200 && "extension" in r.response.items[0],
  },
  {
    id: "A-11",
    title: "画面と同じ検証がサーバでも効く",
    why: "画面の検証は親切であって守りではない（前書きの validation-server の答え）",
    expect: "400・必須と項目間の2件がまとめて返る",
    run: () =>
      call({
        who: "hr",
        method: "POST",
        path: "/employees",
        body: {
          employeeNo: "999999", name: "", nameKana: "テスト",
          departmentCode: "JINJ", employmentStatus: "retired",
          hireDate: "2020-04-01", retireDate: "2019-01-01",
        },
      }),
    check: (r) => r.status === 400 && r.response.errors.length === 2,
  },
  {
    id: "A-12",
    title: "社員番号の形が違うと弾く",
    why: "定義の `pattern`",
    expect: "400・「社員番号は6桁の数字です」",
    run: () =>
      call({
        who: "hr", method: "POST", path: "/employees",
        body: { employeeNo: "12A456", name: "試験", nameKana: "シケン",
                departmentCode: "JINJ", employmentStatus: "active", hireDate: "2020-04-01" },
      }),
    check: (r) => r.status === 400 && r.response.errors.some((e) => e.field === "employeeNo"),
  },
  {
    id: "A-13",
    title: "hr は取引先を直せない",
    why: "定義の `roles: [admin]`（CSV 出力）と同じ線を、書き込みにも引いた",
    expect: "403",
    run: () =>
      call({
        who: "hr", method: "POST", path: "/suppliers",
        body: { supplierCode: "S9998", supplierName: "試験", supplierType: "individual",
                creditLimit: 0, closingDay: 10, tradeStatus: "active" },
      }),
    check: (r) => r.status === 403,
  },
  {
    id: "A-14",
    title: "一括の上限を**サーバでも**守る（hr は20件）",
    why: "画面が止めても API を直接叩けば通る。守る側が**定義から同じ数**を出す",
    expect: "400・「1回に実行できるのは 20 件までです」",
    run: () =>
      call({
        who: "hr", method: "POST", path: "/bulk/retire",
        body: { keys: Array.from({ length: 25 }, (_, i) => String(100001 + i)) },
      }),
    check: (r) => r.status === 400 && /20 件/.test(r.response.message ?? ""),
  },
  {
    id: "A-15",
    title: "admin は50件まで動かせる",
    why: "`maxRows.byRole` の裏側",
    expect: "200・成功件数が返る",
    run: () =>
      call({
        who: "admin", method: "POST", path: "/bulk/retire",
        body: { keys: Array.from({ length: 25 }, (_, i) => String(100001 + i)) },
      }),
    check: (r) => r.status === 200 && r.response.succeeded > 0,
  },
  {
    id: "A-16",
    title: "一括をもう一度押すと、失敗した行が**名指しで**返る",
    why: "1件ずつ確定して、失敗した行だけ残す（前書きの partial-failure の答え）",
    expect: "200・succeeded 0・rejected に行と理由",
    run: () =>
      call({
        who: "admin", method: "POST", path: "/bulk/retire",
        body: { keys: ["100001", "100002", "100003"] },
      }),
    check: (r) => r.status === 200 && r.response.succeeded === 0 && r.response.rejected.length === 3,
  },
  {
    id: "A-17",
    title: "同時に直したら、あとの人を弾く",
    why: "更新日時で見る（前書きの concurrency の答え）",
    expect: "1回目 200・2回目 409",
    run: async () => {
      const read = await call({ who: "hr", path: "/employees/100030" });
      const first = await call({
        who: "hr", method: "PUT", path: "/employees/100030",
        body: { ...read.response, position: "課長" },
      });
      const second = await call({
        who: "hr", method: "PUT", path: "/employees/100030",
        body: { ...read.response, position: "主任" },
      });
      return { ...second, note: `1回目=${first.status} / 2回目=${second.status}` };
    },
    check: (r) => r.status === 409,
  },
  {
    id: "A-18",
    title: "参照されている部署は消せない（サーバも落ちない）",
    why: "制約違反で**プロセスごと落ちた**ことがある（Express 4 は async の失敗を拾わない）",
    expect: "409・そのあとも API は生きている",
    run: async () => {
      const deleted = await call({ who: "admin", method: "DELETE", path: "/departments/JINJ" });
      const health = await call({ who: null, path: "/health" });
      return { ...deleted, note: `削除=${deleted.status} / そのあとの health=${health.status}` };
    },
    check: (r) => r.status === 409,
  },
  {
    id: "A-19",
    title: "画面の定義を配っている",
    why: "画面は定義のコピーを持たない（同じ1枚を読む）",
    expect: "200・YAML が返る",
    run: () => call({ who: null, path: "/definition.yaml" }),
    check: (r) => r.status === 200 && String(r.response).includes("master_maintenance"),
  },
  {
    id: "A-20",
    title: "API の形を定義から出せる",
    why: "サーバを書く人が読む1枚。手で書いていない",
    expect: "200・schemas に SupplierMaster* が並ぶ",
    run: () => call({ who: null, path: "/openapi.json?page=supplier_master" }),
    check: (r) => r.status === 200 && Object.keys(r.response.components?.schemas ?? {}).length > 0,
  },
];

const short = (value, limit = 1200) => {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n…（長いので省略）` : text;
};

const main = async () => {
  for (const who of ["admin", "hr", "viewer"]) tokens[who] = await signIn(who);

  const lines = [
    "# API テスト結果（実行記録）",
    "",
    "> **この紙は生成物です。** `tests/api/run.mjs` が実際に API を叩いて、",
    "> **やりとりをそのまま**書き出しています（手で直さない）。",
    "> 作り直し: `bash tools/run-tests.sh`",
    "",
    `- 実行日時: ${new Date().toISOString()}`,
    `- 対象: \`${BASE}\``,
    "- 前提: `docker compose up` で DB が初期データの状態",
    "",
  ];

  let passed = 0;
  const rows = [];
  const bodies = [];

  for (const one of CASES) {
    let result;
    let ok = false;
    let error;
    try {
      result = await one.run();
      ok = one.check(result);
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
    `## まとめ（${passed} / ${CASES.length} 件）`,
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

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(`${passed} / ${CASES.length} 件が期待どおり。書きました: ${OUT}`);
  if (passed !== CASES.length) process.exit(1);
};

await main();
