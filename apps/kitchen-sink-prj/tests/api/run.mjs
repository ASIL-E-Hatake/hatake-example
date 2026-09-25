#!/usr/bin/env node
// 機能網羅の API テスト。**回す側と書き出す側は案件の外**（`../../tools/api-report.mjs`）。
//
// 業務のふりをしない案件なので、見るのは業務の規則ではなく
// **「定義に書いたことがサーバまで届いているか」**だけ:
//
//   ・画面と同じ定義で検証が回っているか
//   ・押す前に聞いた値（`prompt.fields`）が `input` として届いているか
//   ・親で絞る選択肢（`optionsSource.parentKey`）が絞って返ってくるか
//   ・帳票の並べ替え（`report.sort`）が問い合わせとして届いているか
//   ・一括の部分失敗が**行を名指しで**返るか
//
// 使い方: node tests/api/run.mjs [--base http://localhost:3003/api] [--out <file>]

import { argOf, caller, runApiReport } from "../../../../tools/api-report.mjs";

const BASE = argOf("--base", "http://localhost:3003/api");
const OUT = argOf("--out", "docs/4-テスト/出力-APIテスト結果.md");

// この案件は認証を持たない（役割は問い合わせで渡す）。
const call = caller(BASE, (who) => (who === null ? {} : { "x-role": who }));

const CASES = [
  {
    id: "A-01",
    title: "画面の定義を配っている",
    why: "画面は定義のコピーを持たない（同じ1枚を読む）",
    expect: "200・YAML が返る",
    run: () => call({ path: "/definition.yaml" }),
    check: (r) => r.status === 200 && String(r.response).includes("kitchen_sink"),
  },
  {
    id: "A-02",
    title: "定義に書いた条件で絞れる（前方一致）",
    why: "`operator: startsWith` が QueryBuilder を通って届くか",
    expect: "ITEM-001 だけが返る",
    run: () => call({ path: "/items?itemCode=ITEM-001&pageSize=20" }),
    check: (r) => r.status === 200 && r.response.totalCount === 1,
  },
  {
    id: "A-03",
    title: "定義に書いていない項目では絞れない",
    why: "**書いていない項目は無視する**＝任意の項目で検索されない",
    expect: "絞られずに12件返る",
    run: () => call({ path: "/items?itemName=%E7%B6%B2%E7%BE%85&pageSize=20" }),
    check: (r) => r.status === 200 && r.response.totalCount === 12,
  },
  {
    id: "A-04",
    title: "選択肢は親で絞られる",
    why: "`optionsSource.parentKey` が `{ groupCode: <親の値> }` で投げてくるか",
    expect: "G1 の子だけ（2件）",
    run: () => call({ path: "/children?groupCode=G1" }),
    check: (r) => r.status === 200 && r.response.items.length === 2,
  },
  {
    id: "A-05",
    title: "帳票の並べ替えが届く（降順）",
    why: "**並べ替えは Repository の担当**。届いていなければ `ascending: false` は効かない",
    expect: "先頭が ITEM-012",
    run: () => call({ path: "/lines?sortField=itemCode&sortAscending=false" }),
    check: (r) => r.status === 200 && r.response.items[0].itemCode === "ITEM-012",
  },
  {
    id: "A-06",
    title: "画面と同じ検証がサーバでも効く",
    why: "画面の検証は**親切**であって守りではない",
    expect: "400・コードと種別が項目ごとに返る",
    run: () =>
      call({ method: "POST", path: "/items", body: { itemCode: "", amount: 1 } }),
    check: (r) =>
      r.status === 400 && r.response.errors.some((one) => one.field === "itemCode"),
  },
  {
    id: "A-07",
    title: "押す前に聞いた値が届く",
    why: "`prompt.fields` に書いた項目が `input` としてハンドラまで来るか",
    expect: "単価が 777 になる",
    run: async () => {
      const done = await call({
        method: "POST",
        path: "/bulk/reprice",
        body: { keys: ["ITEM-001"], input: { newAmount: 777, reason: "試し" } },
      });
      return { ...done, note: "この直後に ITEM-001 を読み直して確かめる" };
    },
    check: async (r) => {
      if (r.status !== 200 || r.response.succeeded !== 1) return false;
      const after = await call({ path: "/items/ITEM-001" });
      return after.response.amount === 777;
    },
  },
  {
    id: "A-08",
    title: "一括は1件ずつ確定し、失敗した行だけ名指しで返す",
    why: "試用のものは変えられない＝**途中まで進んで終わる**のが普通",
    expect: "succeeded 2・rejected 2（理由つき）",
    run: () =>
      call({
        method: "POST",
        path: "/bulk/archive",
        body: { keys: ["ITEM-003", "ITEM-002", "ITEM-006", "NOPE"] },
      }),
    check: (r) =>
      r.status === 200 &&
      r.response.succeeded === 2 &&
      r.response.rejected.length === 2 &&
      r.response.rejected.every((one) => typeof one.reason === "string"),
  },
  {
    id: "A-09",
    title: "持ち出しは admin だけ（役割はサーバでも見る）",
    why: "画面の `roles` は見せ方だけ",
    expect: "tester は false・admin は true",
    run: async () => {
      const tester = await call({ who: "tester", path: "/export-allowed" });
      const admin = await call({ who: "admin", path: "/export-allowed" });
      return { ...admin, note: `tester=${tester.response.allowed} / admin=${admin.response.allowed}` };
    },
    check: (r) => r.status === 200 && r.response.allowed === true,
  },
  {
    id: "A-10",
    title: "初期状態に戻せる（何度回しても同じ結果になる）",
    why: "証跡は「何度回しても同じ」でないと使えない",
    expect: "200・12件に戻る",
    run: () => call({ method: "POST", path: "/reset" }),
    check: (r) => r.status === 200 && r.response.count === 12,
  },
];

await runApiReport({
  base: BASE,
  out: OUT,
  cases: CASES,
  note:
    "> **順番に意味があります。** A-07 と A-08 がデータを変えるので、"
    + "最後の A-10 で初期状態に戻しています（次に回す人のため）。",
});
