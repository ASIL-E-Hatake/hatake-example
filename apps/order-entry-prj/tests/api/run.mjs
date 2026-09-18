#!/usr/bin/env node
// 受注入力の API テスト。**回す側と書き出す側は案件の外**（`../../tools/api-report.mjs`）で、
// ここに書くのは**ケースの並びとログインの仕方**だけ。
//
// 見ているのは「hatake が持たないと言っている所を、本当にこちらが持てているか」:
//   認証・認可・採番・締め・同時更新・一括の部分失敗・単価の偽装。
// 定義に書いた検証がサーバでも効くこと（同じ1枚を読んでいること）も、ここで確かめる。
//
// 使い方: node tests/api/run.mjs [--base http://localhost:3001/api] [--out <file>]

import { argOf, caller, runApiReport } from "../../../../tools/api-report.mjs";

const BASE = argOf("--base", "http://localhost:3001/api");
const OUT = argOf("--out", "docs/4-テスト/出力-APIテスト結果.md");

/** ログインして合言葉を取る。合言葉は見本なので `<id>123`。 */
async function signIn(userId) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, password: `${userId}123` }),
  });
  if (!response.ok) throw new Error(`ログインできません: ${userId}`);
  return (await response.json()).token;
}

const tokens = {};
const call = caller(BASE, (who) =>
  who === null ? {} : { authorization: `Bearer ${tokens[who]}` },
);

/** 通る受注1件ぶんの中身（使い回す）。 */
const goodOrder = (overrides = {}) => ({
  customerCode: "C001",
  orderDate: "2026-09-15",
  dueDate: "2026-09-25",
  salesPersonName: "田中 優子",
  lines: [
    { productCode: "P001", quantity: 10, unitPrice: 480 },
    { productCode: "P006", quantity: 2, unitPrice: 1580 },
  ],
  ...overrides,
});

/** 後ろのケースで使う、この実行で作った受注の番号。 */
let madeOrderNo = null;

const CASES = [
  {
    id: "A-01",
    title: "ログインできる（clerk）",
    why: "役割はログインで配る（前書きの role-source の答え）",
    expect: "200 が返り、roles に clerk が入る",
    run: () =>
      call({
        method: "POST",
        path: "/auth/login",
        body: { userId: "tanaka", password: "tanaka123" },
      }),
    check: (r) => r.status === 200 && r.response.user.roles.includes("clerk"),
  },
  {
    id: "A-02",
    title: "パスワードが違うと入れない",
    why: "**理由を分けない**（「その ID はありません」と言うと、在る ID を探せてしまう）",
    expect: "401・文言は「ID かパスワードが違います」",
    run: () =>
      call({
        method: "POST",
        path: "/auth/login",
        body: { userId: "tanaka", password: "wrong" },
      }),
    check: (r) => r.status === 401,
  },
  {
    id: "A-03",
    title: "ログインしていないと一覧が見えない",
    why: "画面の roles は見せ方だけ。**本当の遮断はここ**",
    expect: "401",
    run: () => call({ path: "/orders" }),
    check: (r) => r.status === 401,
  },
  {
    id: "A-04",
    title: "条件で絞れる（定義に書いた条件だけ）",
    why: "検索できる条件は定義から決まる（QueryBuilder）",
    expect: "200・受注状態が draft のものだけ返る",
    run: () => call({ who: "tanaka", path: "/orders?orderStatus=draft&pageSize=50" }),
    check: (r) =>
      r.status === 200 && r.response.items.every((one) => one.orderStatus === "draft"),
  },
  {
    id: "A-05",
    title: "定義に書いていない項目では絞れない",
    why: "**書いていない項目は無視する**＝任意の項目で検索されない（総なめを作らない）",
    expect: "200・絞られずに全件返る（9件）",
    run: () => call({ who: "tanaka", path: "/orders?note=%E8%87%B3%E6%80%A5&pageSize=50" }),
    check: (r) => r.status === 200 && r.response.totalCount === 9,
  },
  {
    id: "A-06",
    title: "降順の指定が効く",
    why: "`sortAscending=false` は**文字列で届く**。真偽に直せていないと昇順になる",
    expect: "受注日の降順",
    run: () =>
      call({ who: "tanaka", path: "/orders?sortField=orderDate&sortAscending=false&pageSize=50" }),
    check: (r) => {
      const dates = r.response.items.map((one) => one.orderDate);
      return r.status === 200 && dates.join() === [...dates].sort().reverse().join();
    },
  },
  {
    id: "A-07",
    title: "範囲で絞れる（合計 いくら以上 いくら以下）",
    why: "`operator: between` は値を2つ受ける",
    expect: "200・合計が 5000〜11000 のものだけ",
    run: () =>
      call({ who: "tanaka", path: "/orders?totalAmount=5000&totalAmount=11000&pageSize=50" }),
    check: (r) =>
      r.status === 200 &&
      r.response.items.every((one) => one.totalAmount >= 5000 && one.totalAmount <= 11000),
  },
  {
    id: "A-08",
    title: "明細まで付けて1件返す",
    why: "ヘッダと明細で1件（親子）。画面はこの形で受け取る",
    expect: "200・lines が3行",
    run: () => call({ who: "tanaka", path: "/orders/SO2026090002" }),
    check: (r) => r.status === 200 && r.response.lines.length === 3,
  },
  {
    id: "A-09",
    title: "消費税は税率ごとに1回だけ切り捨てる",
    why: "軽減8%が混ざる。明細ごとに丸めると請求書と1円ずれる",
    expect: "10%分 6320→632、8%分 4200→336、合わせて 968",
    run: () => call({ who: "tanaka", path: "/orders/SO2026090002" }),
    check: (r) =>
      r.response.subtotalAmount === 10520 &&
      r.response.taxAmount === 968 &&
      r.response.totalAmount === 11488,
  },
  {
    id: "A-10",
    title: "営業は自分の拠点の受注しか見えない",
    why: "拠点で絞るのは**定義に書けない**（画面に出てこない条件）。サーバが足す",
    expect: "200・返る受注はすべて OSA",
    run: () => call({ who: "sato", path: "/orders?pageSize=50" }),
    check: (r) =>
      r.status === 200 &&
      r.response.items.length > 0 &&
      r.response.items.every((one) => one.officeCode === "OSA"),
  },
  {
    id: "A-11",
    title: "営業には入力者の列が返らない",
    why: "列の `roles` は**見せ方だけ**では足りない。API でも同じ定義から落とす",
    expect: "200・items に createdBy が無い（clerk には在る）",
    run: () => call({ who: "sato", path: "/orders?pageSize=50" }),
    check: (r) => r.status === 200 && !("createdBy" in r.response.items[0]),
  },
  {
    id: "A-12",
    title: "画面と同じ検証がサーバでも効く",
    why: "画面の検証は**親切**であって守りではない（API を直接叩けば通る）",
    expect: "400・納期と担当が項目ごとに返る",
    run: () =>
      call({
        who: "tanaka",
        method: "POST",
        path: "/orders",
        body: goodOrder({ dueDate: "2026-09-01", salesPersonName: "" }),
      }),
    check: (r) =>
      r.status === 400 &&
      r.response.errors.some((one) => one.field === "dueDate") &&
      r.response.errors.some((one) => one.field === "salesPersonName"),
  },
  {
    id: "A-13",
    title: "明細が1行も無いと保存できない",
    why: "`required` は**空の並び**も「無い」と見る",
    expect: "400・field は lines",
    run: () =>
      call({ who: "tanaka", method: "POST", path: "/orders", body: goodOrder({ lines: [] }) }),
    check: (r) => r.status === 400 && r.response.errors[0].field === "lines",
  },
  {
    id: "A-14",
    title: "同じ商品を2行に入れると保存できない",
    why: "行をまたいで見る検証（`unique`）。この案件で一番多いミス",
    expect: "400・「同じ商品が複数行にあります」",
    run: () =>
      call({
        who: "tanaka",
        method: "POST",
        path: "/orders",
        body: goodOrder({
          lines: [
            { productCode: "P001", quantity: 1, unitPrice: 480 },
            { productCode: "P001", quantity: 2, unitPrice: 480 },
          ],
        }),
      }),
    check: (r) =>
      r.status === 400 && r.response.errors[0].message.includes("同じ商品"),
  },
  {
    id: "A-15",
    title: "行の中のどこが悪いかまで言う",
    why: "「明細が変です」では、20行あるうちのどれか分からない",
    expect: "400・field は lines[0].quantity",
    run: () =>
      call({
        who: "tanaka",
        method: "POST",
        path: "/orders",
        body: goodOrder({ lines: [{ productCode: "P001", quantity: 0, unitPrice: 480 }] }),
      }),
    check: (r) => r.status === 400 && r.response.errors[0].field === "lines[0].quantity",
  },
  {
    id: "A-16",
    title: "受注番号はサーバが採番する",
    why: "連番の在り処はサーバ（前書きの numbering の答え）。画面では入れさせない",
    expect: "201・SO で始まる番号が付く。送った番号は捨てられる",
    run: async () => {
      const result = await call({
        who: "tanaka",
        method: "POST",
        path: "/orders",
        body: goodOrder({ orderNo: "送っても無視される" }),
      });
      madeOrderNo = result.response?.orderNo ?? null;
      return result;
    },
    check: (r) => r.status === 201 && /^SO\d{10}$/.test(r.response.orderNo),
  },
  {
    id: "A-17",
    title: "送られてきた単価は信じない（商品マスタの定価で計算し直す）",
    why: "単価の出どころは商品マスタ（前書き）。API を直接叩けば好きな単価を送れる",
    expect: "1円で送っても、定価で 7960 になる",
    run: () =>
      call({
        who: "tanaka",
        method: "POST",
        path: "/orders",
        body: goodOrder({
          customerCode: "C002",
          lines: [
            { productCode: "P001", quantity: 10, unitPrice: 1, taxRate: 0.5 },
            { productCode: "P006", quantity: 2, unitPrice: 1, taxRate: 0.5 },
          ],
        }),
      }),
    check: (r) => r.status === 201 && r.response.subtotalAmount === 7960,
  },
  {
    id: "A-18",
    title: "同じ受注を2人が直したら、後の人が弾かれる",
    why: "先に保存した人の入力が黙って消えるのを止める（前書きの concurrency の答え）",
    expect: "409・「読み直してください」",
    run: () =>
      call({
        who: "tanaka",
        method: "PUT",
        path: `/orders/${madeOrderNo}`,
        body: goodOrder({ updatedAt: "2020-01-01 00:00:00+00" }),
      }),
    check: (r) => r.status === 409,
  },
  {
    id: "A-19",
    title: "締めた月の受注は直せない",
    why: "締めの在り処はサーバ。画面は「直せない」という結果だけを見せる",
    expect: "409・「締めた月の受注は直せません」",
    run: () =>
      call({
        who: "tanaka",
        method: "PUT",
        path: "/orders/SO2026070001",
        body: goodOrder({ orderDate: "2026-07-03", dueDate: "2026-07-10" }),
      }),
    check: (r) => r.status === 409 && r.response.message.includes("締めた月"),
  },
  {
    id: "A-20",
    title: "営業は受注を取り消せない",
    why: "取り消せるのは営業事務だけ（定義の `roles: [clerk]`）。画面から消しても口は開いている",
    expect: "403",
    run: () => call({ who: "sato", method: "DELETE", path: `/orders/${madeOrderNo}` }),
    check: (r) => r.status === 403,
  },
  {
    id: "A-21",
    title: "営業はほかの拠点の受注を読めない",
    why: "画面に出さないだけでは足りない（番号を直接叩けば読める）",
    expect: "403",
    run: () => call({ who: "sato", path: "/orders/SO2026090002" }),
    check: (r) => r.status === 403,
  },
  {
    id: "A-22",
    title: "一括の上限をサーバでも守る",
    why: "画面は上限を超えると押せないが、**API を直接叩けば通る**。同じ定義から同じ数を読む",
    expect: "409・「1回に実行できるのは 20 件までです」",
    run: () =>
      call({
        who: "tanaka",
        method: "POST",
        path: "/bulk/cancel",
        body: { keys: Array.from({ length: 21 }, (_, i) => `X${i}`) },
      }),
    check: (r) => r.status === 409 && r.response.message.includes("20"),
  },
  {
    id: "A-23",
    title: "一括は1件ずつ確定し、失敗した行だけ名指しで返す",
    why: "締めた月や出荷済が混ざるのは普通。全部取り消すと「1件のために49件やり直し」になる",
    expect: "200・succeeded が1、rejected が3件（理由つき）",
    run: () =>
      call({
        who: "tanaka",
        method: "POST",
        path: "/bulk/cancel",
        body: { keys: [madeOrderNo, "SO2026070001", "SO2026080003", "NOPE"] },
      }),
    check: (r) =>
      r.status === 200 &&
      r.response.succeeded === 1 &&
      r.response.rejected.length === 3 &&
      r.response.rejected.every((one) => typeof one.reason === "string"),
  },
  {
    id: "A-24",
    title: "取り消しても消えない（状態が変わるだけ）",
    why: "過去の伝票から参照されるので消せない（前書きの erase の答え）",
    expect: "200・orderStatus が cancelled で残っている",
    run: () => call({ who: "tanaka", path: `/orders/${madeOrderNo}` }),
    check: (r) => r.status === 200 && r.response.orderStatus === "cancelled",
  },
  {
    id: "A-25",
    title: "帳票は明細を1行1件で返す（取消は出さない）",
    why: "紙は取引先に送るもの。取り消した受注を刷らない",
    expect: "200・items が明細の形",
    run: () => call({ who: "tanaka", path: "/order-lines?orderNo=SO2026090002&pageSize=200" }),
    check: (r) =>
      r.status === 200 &&
      r.response.items.length === 3 &&
      r.response.items.every((one) => one.productName && one.amount > 0),
  },
  {
    id: "A-26",
    title: "営業は帳票の口を叩けない",
    why: "注文請書は営業事務と管理者の紙（定義の `roles`）",
    expect: "403",
    run: () => call({ who: "sato", path: "/order-lines?pageSize=200" }),
    check: (r) => r.status === 403,
  },
  {
    id: "A-27",
    title: "出荷指示を投げると状態が出荷済になる",
    why: "投げるだけで結果は持たない（前書きの shipmentGateway）",
    expect: "200・orderStatus が shipped",
    run: () => call({ who: "tanaka", method: "POST", path: "/orders/SO2026090001/ship" }),
    check: (r) => r.status === 200 && r.response.orderStatus === "shipped",
  },
  {
    id: "A-28",
    title: "画面の定義を配っている",
    why: "画面は定義のコピーを持たない（同じ1枚を読む）",
    expect: "200・YAML が返る",
    run: () => call({ path: "/definition.yaml" }),
    check: (r) => r.status === 200 && String(r.response).includes("order_entry"),
  },
];

for (const who of ["sato", "suzuki", "tanaka", "yamada"]) {
  tokens[who] = await signIn(who);
}

await runApiReport({
  base: BASE,
  out: OUT,
  cases: CASES,
  note:
    "> **順番に意味があります。** A-16 で作った受注を A-18・A-20・A-23・A-24 が使い回すので、"
    + "1件ずつ抜き出して回すと落ちます（回す前にデータを初期状態に戻すのはそのため）。",
});
