#!/usr/bin/env node
// **設計の納品資料**を定義から作る。
//
// 画面一覧・API 一覧・画面遷移図・権限マトリクス・画面ごとの設計書 ── どれも
// 「定義に書いてあることの言い直し」なので、**手で書かない**。手で書くと、定義を
// 直したその日から古くなる（しかも古い設計書は嘘をつく）。
//
// 枠組みが持っているのは「1画面を説明する」「図を描く」「API の形を出す」までで、
// **納品の体裁に並べる**のはここ（様式は案件ごとに違うので、エビデンスと同じ線）。
//
// 使い方:
//   node tools/build-design-docs.mjs            … 作り直す
//   node tools/build-design-docs.mjs --check    … 古くなっていないか見るだけ（CI 用）

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CHECK = process.argv.includes("--check");

/** 改行（この道具自身が生成する紙の行区切り）。 */
const NL = String.fromCharCode(10);
const DEF = "definitions/app.yaml";
const OUT = "docs/2-設計";
const PAGES_DIR = join(OUT, "画面設計書");

/** hatake の CLI を叩く（`HATAKE` で差し替えられる＝手元の枠組みで試せる）。 */
const HATAKE = (process.env.HATAKE ?? "npx --yes hatake").split(" ");
const hatake = (...args) =>
  execFileSync(HATAKE[0], [...HATAKE.slice(1), ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

const stale = [];
const write = (path, body) => {
  mkdirSync(dirname(path), { recursive: true });
  const text = body.endsWith("\n") ? body : `${body}\n`;
  if (CHECK) {
    const now = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (now.replace(/\r\n/g, "\n") !== text) stale.push(path);
    return;
  }
  writeFileSync(path, text, "utf8");
  console.log(`書きました: ${path}`);
};

/** 定義への相対の道（紙の深さで変わる。`画面設計書/` は1段深い）。 */
const HEAD = (what, up = "../..") =>
  [
    `> **この紙は生成物です。** \`tools/build-design-docs.mjs\` が`,
    `> [定義](${up}/${DEF})から起こしています（手で直さない）。`,
    `> 定義を直したら \`node tools/build-design-docs.mjs\` で作り直してください。`,
    `>`,
    `> ${what}`,
    "",
  ].join("\n");

// --- 画面の一覧は**枠組みに聞く**（YAML を自分で読まない） -------------------
//
// 行を正規表現で拾う書き方は、定義の書き方が少し変わるだけで壊れる（実際、空の画面を
// 拾って `explain --page ""` が落ちた）。**解析器はもう在る**ので、そちらに聞く。

/** 画面ぜんぶ（id・名前・種別・出どころ・キー）。 */
function pagesOf() {
  const app = JSON.parse(hatake("explain", DEF, "--json"));
  const listed = (app.sections ?? []).find((one) => one.title === "画面");
  const ids = (listed?.lines ?? []).map((line) => {
    const found = /（([A-Za-z0-9_]+)）/.exec(line);
    return found === null ? null : found[1];
  });
  return ids.filter((id) => id !== null).map((id) => {
    const page = JSON.parse(hatake("explain", DEF, "--page", id, "--json"));
    const headline = page.headline ?? "";
    const data = (page.sections ?? []).find((one) => one.title === "データ");
    const lines = data?.lines ?? [];
    const pick = (re) => {
      for (const line of lines) {
        const found = re.exec(line);
        if (found !== null) return found[1];
      }
      return "";
    };
    return {
      id,
      title: (/^(.+?)（/.exec(headline) ?? ["", id])[1],
      what: headline.includes("—") ? headline.split("—").slice(1).join("—").trim() : "",
      repository: pick(/データの出どころは (\w+)/),
      key: pick(/1件を指すキーは (\w+)/),
      type: kindOf(page),
    };
  });
}

/** 種別は「何をする画面か」の言い方から決める（`explain` が種別ごとに違う文を出す）。 */
function kindOf(page) {
  const headline = page.headline ?? "";
  if (headline.includes("マスタをメンテナンス")) return "master";
  if (headline.includes("読むだけ")) return "detail";
  if (headline.includes("登録・修正・削除")) return "crud";
  if (headline.includes("ステップ")) return "wizard";
  if (headline.includes("帳票")) return "report";
  if (headline.includes("カード")) return "dashboard";
  if (headline.includes("検索")) return "search";
  return "form";
}

const pages = pagesOf();

const KIND = {
  crud: "CRUD（検索・一覧・登録・修正・削除）",
  master: "マスタ保守（CRUD と同じ形）",
  search: "照会（検索・一覧）",
  detail: "詳細（読み取り）",
  form: "入力",
  wizard: "ウィザード（ステップ入力）",
  dashboard: "ダッシュボード",
  report: "帳票",
};

// --- 1. 画面一覧 --------------------------------------------------------------
{
  const rows = pages.map(
    (page) =>
      `| ${page.id} | ${page.title} | ${KIND[page.type] ?? page.type} | \`${page.repository}\` | ${page.what} |`,
  );
  write(
    join(OUT, "画面一覧.md"),
    [
      "# 画面一覧",
      "",
      HEAD("**画面の数と種類**。中身は[画面設計書](画面設計書/)、遷移は[画面遷移図](画面遷移図.md)。"),
      `全 ${pages.length} 画面。`,
      "",
      "| 画面 ID | 画面名 | 種別 | データの出どころ | 何をする画面か |",
      "|---|---|---|---|---|",
      ...rows,
      "",
      "## 誰が開けるか",
      "",
      "画面そのものに権限は書けない（入口＝メニューの権限を辿った結果になる）。",
      "詳しくは[権限マトリクス](権限マトリクス.md)。",
    ].join("\n"),
  );
}

// --- 2. 画面遷移図 ------------------------------------------------------------
{
  const mermaid = hatake("diagram", DEF, "--format", "mermaid").trim();
  if (!CHECK) hatake("diagram", DEF, "--out", join(OUT, "画面遷移図.svg"));
  write(
    join(OUT, "画面遷移図.md"),
    [
      "# 画面遷移図",
      "",
      HEAD("**どの画面からどの画面へ行けるか**。箱の中は「誰が開けるか」。"),
      "```mermaid",
      mermaid,
      "```",
      "",
      "同じ図の SVG: [画面遷移図.svg](画面遷移図.svg)",
      "",
      "> 点線の箱は**誰も開けない画面**（入口の権限が食い違っている）、",
      "> 赤枠は**誰でも開けて消す／持ち出せる画面**。どちらも定義から数えている。",
    ].join("\n"),
  );
}

// --- 3. 権限マトリクス --------------------------------------------------------
{
  const matrix = hatake("explain", DEF, "--roles", "--matrix").trim();
  write(
    join(OUT, "権限マトリクス.md"),
    [
      "# 権限マトリクス",
      "",
      HEAD("**誰に何が見えるか**。定義の `roles` を全部辿って数えたもの。"),
      "```text",
      matrix,
      "```",
      "",
      "> **これは見せ方の話だけ。** 画面の `roles` は隠すだけで、API を直接叩けば",
      "> データは取れる。本当の遮断は API 側（`node-src/src/authz.js`）で、",
      "> そちらは[テスト](../4-テスト/ケース一覧.md)の A-09 / A-13 で確かめている。",
    ].join("\n"),
  );
}

// --- 4. API 一覧 --------------------------------------------------------------
//
// `hatake openapi` は**単票の定義しか読めない**（app を渡すと落ちる）ので、ここでは
// **Repository の契約**から組む。画面が Repository に何を頼むかは決まっていて、
// REST に載せる形も決まっている（`hatake_http` の契約）＝定義から機械的に出せる。
{
  const contract = [
    ["GET", "", "一覧（検索・並べ替え・ページ送り）→ `{items, totalCount}`"],
    ["POST", "", "登録 → 作ったレコード"],
    ["GET", "/{key}", "1件 → レコード（無ければ 404）"],
    ["PUT", "/{key}", "修正 → 直したレコード"],
    ["DELETE", "/{key}", "削除 → 204"],
  ];
  const seen = new Set();
  const blocks = [];
  for (const page of pages) {
    if (page.repository === "" || seen.has(page.repository)) continue;
    seen.add(page.repository);
    const base = `/api/${page.repository.replace(/Repository$/, "")}s`;
    const users = pages.filter((one) => one.repository === page.repository).map((one) => one.title);
    blocks.push(
      [
        `### \`${page.repository}\` → \`${base}\``,
        "",
        `使う画面: ${users.join(" / ")}`,
        "",
        "| メソッド | パス | 何をするか |",
        "|---|---|---|",
        ...contract.map(([method, tail, what]) => `| \`${method}\` | \`${base}${tail}\` | ${what} |`),
        "",
      ].join(NL),
    );
  }
  write(
    join(OUT, "API一覧.md"),
    [
      "# API 一覧",
      "",
      HEAD("**画面が要求している API**。定義から機械的に決まるので、サーバはこの形に合わせる。"),
      "画面は Repository に頼むだけで、HTTP を知らない。REST に載せる形は",
      "`hatake_http` の契約で決まっていて、**画面ごとではなく Repository ごと**に決まる。",
      "",
      "実装は [node-src](../../node-src/)。**画面と同じ定義で検証している**ので、",
      "必須・桁・項目間の規則はここに書かない（[画面設計書](画面設計書/)が正）。",
      "",
      ...blocks,
      "## 定義に書けない口（枠組みの外）",
      "",
      "| メソッド | パス | 何をするか | なぜ定義に無いか |",
      "|---|---|---|---|",
      "| `POST` | `/api/auth/login` | ログイン | hatake は認証を持たない |",
      "| `POST` | `/api/bulk/retire` | まとめて退職にする | 一括の中身はアプリ側（`plugin`） |",
      "| `GET` | `/api/definition.yaml` | 画面の定義を配る | この案件の作り（画面が定義のコピーを持たない） |",
      "",
      "## 受け取る形・返す形（スキーマ）",
      "",
      "定義から出せる（`hatake openapi`）。ただし**単票の定義しか読めない**ので、",
      "画面を1枚ずつ切り出して渡す必要がある（app をそのまま渡すと落ちる）。",
      "動いているサーバなら `GET /api/openapi.json?page=<画面 id>` が同じものを返す。",
      "",
    ].join(NL),
  );
}

// --- 5. 画面ごとの設計書 ------------------------------------------------------
{
  if (!CHECK) rmSync(PAGES_DIR, { recursive: true, force: true });
  for (const page of pages) {
    const body = hatake("explain", DEF, "--page", page.id, "--markdown").trim();
    write(
      join(PAGES_DIR, `${page.id}.md`),
      [
        `# ${page.title}（${page.id}）`,
        "",
        HEAD("**この画面が何をするか**を、DSL のキー名を出さずに書いたもの。", "../../.."),
        `- 種別: ${KIND[page.type] ?? page.type}`,
        `- データの出どころ: \`${page.repository}\``,
        ...(page.key === "" ? [] : [`- 1件を指すキー: \`${page.key}\``]),
        "",
        body,
        "",
        "---",
        "",
        `関連: [画面一覧](../画面一覧.md) / [画面遷移図](../画面遷移図.md) / [権限マトリクス](../権限マトリクス.md) / [API 一覧](../API一覧.md)`,
      ].join(NL),
    );
  }
}

if (CHECK) {
  if (stale.length > 0) {
    console.error("古くなっています:");
    for (const one of stale) console.error(`  ${one}`);
    console.error("\n作り直してから commit してください: node tools/build-design-docs.mjs");
    process.exit(1);
  }
  console.log("設計資料は定義と食い違っていません。");
}
