#!/usr/bin/env node
// 画面を実際に開いて、**項番ごとにスクリーンショット**を撮り、納品用の Markdown に
// まとめる。
//
// ここも**枠組みの外**。hatake は `hatake run` で「その値でどうなるか」を、
// `hatake_test` で「押せるか・出ているか」を確かめられるが、**エビデンスの紙**
// （客先に出すスクショつきの一覧）は持たない。様式が案件ごとに違うので、
// 認証と同じくアプリ側に置く。
//
// 決めごと4つ:
//   ・**スクショは証拠で、判定ではない。** 画面の見た目を機械で合否にすると、
//     余白が1px 動いただけで落ちる紙になる。合否は `hatake run`（値）と
//     API テスト（サーバ）が持ち、ここは**目で確かめるための記録**
//   ・**役割ごとに撮る。** この案件のいちばんの見どころが「誰に何が見えるか」なので
//   ・**撮ったものは消して撮り直す**（前回の残りが混ざると、いつの証拠か分からない）
//   ・**落ちても最後まで回す**（1枚目で止まると残りが撮れない）
//
// 使い方（Docker で回す。手元に Chrome は要らない）:
//   bash tools/run-tests.sh
// 直接:
//   node tests/screen/shots.mjs --base http://localhost:8080

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const BASE = argOf("--base", "http://localhost:8080");
const SHOTS = argOf("--shots", "docs/4-テスト/画面");
const OUT = argOf("--out", "docs/4-テスト/出力-画面テスト結果.md");

const settle = (ms = 800) => new Promise((done) => setTimeout(done, ms));

/**
 * 字が出そろうのを待つ。
 *
 * Flutter Web は**アイコンのフォントを後から取りに行く**ので、早く撮ると
 * アイコンが豆腐（□）で写る。納品する紙に豆腐が並ぶと「壊れている」に見える。
 */
const fontsReady = (page) =>
  page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => undefined);

/**
 * **真っ白でない**ことを、撮ったもので確かめる。
 *
 * Flutter Web は canvas に描くので、DOM を見ても「描き終わったか」は分からない
 * （要素は先に在って、絵は後から乗る）。固定の秒数で待つと、遅い日に**真っ白な
 * スクリーンショット**が納品物として残る ── 実際そうなった。
 *
 * 一面同じ色の PNG は**ほとんど圧縮されて小さくなる**ので、大きさで見分けられる。
 * 実測（1400x900）: 真っ白 = 5.7KB / いちばん中身の少ないログイン画面 = 18.7KB /
 * 一覧の画面 = 100KB 前後。あいだを取って 10KB を線にする。
 *
 * **測って決めた数**なので、画面の大きさを変えたら測り直すこと（線を上げすぎると
 * 「中身はあるのに白と言う」、下げすぎると白を見逃す）。
 */
const BLANK_LIMIT = 10_000;

/** 描き終わるまで待つ。待ちきれなければ**そう言って落とす**（黙って白を出さない）。 */
async function waitForPaint(page, { tries = 30, every = 1000 } = {}) {
  // まず Flutter の入れ物ができるのを待つ（ここまでは DOM で分かる）。
  await page
    .waitForSelector("flutter-view, flt-glass-pane, flt-scene-host", { timeout: 30_000 })
    .catch(() => undefined);
  await fontsReady(page);

  for (let i = 0; i < tries; i += 1) {
    const shot = await page.screenshot();
    if (shot.length >= BLANK_LIMIT) {
      // 乗りかけの絵を撮らないよう、描き切るのを少しだけ待つ。
      await settle(600);
      return shot.length;
    }
    await settle(every);
  }
  throw new Error(
    `画面が描き終わりません（${tries} 秒待っても真っ白のままでした）。` +
      "docker compose up で web と api が動いているか確かめてください。",
  );
}

/** 画面の中の文字は読めないので、**座標**で押す（1400x900 で撮る前提）。 */
const AT = {
  userId: [700, 446],
  password: [700, 520],
  signIn: [700, 567],
  menu: { 社員マスタ: [75, 81], 部署マスタ: [75, 112], 取引先マスタ: [75, 145] },
  signOut: [1320, 862],
};

async function signIn(page, who) {
  await page.mouse.click(...AT.userId);
  await page.keyboard.type(who);
  await page.mouse.click(...AT.password);
  await page.keyboard.type(who);
  await page.mouse.click(...AT.signIn);
  await settle(2500);
}

/** 撮る1件。`expect` は**人が見て確かめること**。 */
const CASES = [
  {
    id: "G-01", who: null, file: "G-01-ログイン.png",
    title: "ログイン画面が出る",
    why: "認証は枠組みの外なので、この画面だけ手で書いてある",
    expect: "ID とパスワードの欄・ログインボタンが出ている",
    go: async () => {},
  },
  {
    id: "G-02", who: "hr", file: "G-02-社員マスタ-hr.png",
    title: "社員マスタ（人事）",
    why: "定義1枚から、検索・一覧・ボタンが全部出る",
    expect: "検索4条件／一覧8列／「CSV 出力」「まとめて退職にする」「詳細」が出ている",
    go: async () => {},
  },
  {
    id: "G-03", who: "hr", file: "G-03-取引先マスタ-hr.png",
    title: "取引先マスタ（人事）＝複雑な検索",
    why: "範囲（between）と複数選択（in）が定義から出る",
    expect: "与信限度額の「以上／以下」と締め日の複数選択が出ている。**CSV 出力は出ない**（定義で admin だけ）",
    go: async (page) => {
      await page.mouse.click(...AT.menu.取引先マスタ);
      await settle(1500);
    },
  },
  {
    id: "G-04", who: "hr", file: "G-04-部署マスタ-hr.png",
    title: "部署マスタ（人事）",
    why: "自分自身を選択肢に使う（上位部署）",
    expect: "部署コード・部署名・上位部署の列が出ている",
    go: async (page) => {
      await page.mouse.click(...AT.menu.部署マスタ);
      await settle(1500);
    },
  },
  {
    id: "G-05", who: "viewer", file: "G-05-社員マスタ-viewer.png",
    title: "社員マスタ（一般）＝見えないものがある",
    why: "定義の `roles` が効いているか",
    expect: "**「CSV 出力」「まとめて退職にする」が消え、選択のチェックボックスも無い**。内線の列も無い",
    go: async () => {},
  },
  {
    id: "G-06", who: "admin", file: "G-06-取引先マスタ-admin.png",
    title: "取引先マスタ（情シス）＝人事との違い",
    why: "同じ画面でも役割で出るものが変わる",
    expect: "G-03 では出なかった**「CSV 出力」が出ている**",
    go: async (page) => {
      await page.mouse.click(...AT.menu.取引先マスタ);
      await settle(1500);
    },
  },
];

const main = async () => {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  let taken = 0;
  const rows = [];
  const bodies = [];
  // **`null` を初期値にしない。** 「未ログインで撮る」件の `who` も `null` なので、
  // 一致してしまって**ページを開かないまま撮る**（白い紙が1枚できる。実際そうなった）。
  const NOBODY = Symbol("まだ開いていない");
  let signedInAs = NOBODY;

  for (const one of CASES) {
    try {
      if (one.who !== signedInAs) {
        await page.goto(BASE, { waitUntil: "networkidle2" });
        // **描き終わるまで待つ**（固定の秒数で待たない）。
        await waitForPaint(page);
        if (one.who !== null) {
          await signIn(page, one.who);
          await waitForPaint(page);
        }
        signedInAs = one.who;
      }
      await one.go(page);
      await fontsReady(page);
      await settle(1200);

      // 撮る直前にもう一度だけ確かめる。描いたあとに**白へ戻る**ことがあるので
      // （service worker の有効化でリロードが走るなど）、白ければ撮り直す。
      let shot;
      for (let i = 0; i < 10; i += 1) {
        shot = await page.screenshot({ path: join(SHOTS, one.file) });
        if (shot.length >= BLANK_LIMIT) break;
        await settle(1000);
      }
      // それでも白いなら**残さずに落とす**（白い紙を納品物にしない）。
      if (shot.length < BLANK_LIMIT) {
        rmSync(join(SHOTS, one.file), { force: true });
        throw new Error(`撮れたものが真っ白でした（${shot.length} バイト）`);
      }
      taken += 1;
      rows.push(`| ${one.id} | ${one.title} | ${one.who ?? "（未ログイン）"} | 撮れた |`);
      bodies.push(
        [
          `### ${one.id} ${one.title}`,
          "",
          `- **役割**: ${one.who ?? "（未ログイン）"}`,
          `- **確かめたいこと**: ${one.why}`,
          `- **目で見て確かめること**: ${one.expect}`,
          "",
          `![${one.id}](画面/${one.file})`,
          "",
        ].join("\n"),
      );
    } catch (error) {
      rows.push(`| ${one.id} | ${one.title} | ${one.who ?? "—"} | **撮れなかった** |`);
      bodies.push(`### ${one.id} ${one.title}\n\n**撮れませんでした**: ${error.message}\n`);
      signedInAs = null;
    }
  }

  await browser.close();

  writeFileSync(
    OUT,
    [
      "# 画面テスト結果（実行記録）",
      "",
      "> **この紙は生成物です。** `tests/screen/shots.mjs` が実際にブラウザで画面を開いて",
      "> 撮っています（手で直さない）。作り直し: `bash tools/run-tests.sh`",
      "",
      "> **スクショは証拠であって、判定ではありません。** 画面の見た目を機械で合否にすると、",
      "> 余白が1px 動いただけで落ちる紙になります。値の合否は `hatake run`（`出力-シナリオ結果.txt`）、",
      "> サーバの合否は API テスト（`出力-APIテスト結果.md`）が持っていて、ここは",
      "> **目で確かめて判子を押すための記録**です。",
      "",
      `- 実行日時: ${new Date().toISOString()}`,
      `- 対象: \`${BASE}\``,
      "- 画面の大きさ: 1400 x 900",
      "- 前提: `docker compose up` で初期データの状態",
      "",
      `## まとめ（${taken} / ${CASES.length} 枚）`,
      "",
      "| 項番 | 内容 | 役割 | 撮影 |",
      "|---|---|---|---|",
      ...rows,
      "",
      "---",
      "",
      ...bodies,
    ].join("\n"),
    "utf8",
  );

  console.log(`${taken} / ${CASES.length} 枚撮りました。書きました: ${OUT}`);
  if (taken !== CASES.length) process.exit(1);
};

await main();
