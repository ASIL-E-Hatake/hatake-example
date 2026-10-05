// 機能網羅（React 版）。
//
// **画面のコードは1行も無い。** 出しているのは `HatakeApp` 1つだけで、メニューも
// 画面の行き来も検索も入力も、定義（`definitions/app.yaml`）から出ている。
// Flutter 版・Vue 版と**同じ定義・同じ登録**で、違うのは描く側だけ。
//
// 案件が書くのはこの4つ:
//
//   ・定義をどこから読むか（ここではサーバ。画面側にコピーを持たない）
//   ・どの Repository がどの道か（`restRepositories`）
//   ・`plugin:` と書いたボタンの中身（`actions.ts`）
//   ・出す口（CSV と印刷。出来合いの `downloadCsv` / `downloadPdf` を登録するだけ）
//
// **`actions.ts` は Vue 版と1文字も違わない**（`diff` が通る）。
// 枠組みの型（`ActionHandler`）しか見ていないので、描く側が
// 変わっても業務の側は書き直さずに済む —— それがこの見本で確かめたいこと。

import { parseAppPagesYaml, parseAppYaml } from "@hatake-fw/api";
import { fetchSend, restRepositories } from "@hatake-fw/http";
import { HatakeApp, HatakeScope } from "@hatake-fw/react19";
import { ActionRegistry, downloadCsv, downloadPdf, RepositoryRegistry } from "@hatake-fw/runtime";
import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

import "@hatake-fw/runtime/hatake.css";

import { bulkAction, newCounter } from "./actions.js";

const BASE = "/api";

/** いま配る役割。`?role=` で切り替える（この案件は認証を持たない）。 */
function rolesFromUrl(): string[] {
  const given = new URLSearchParams(window.location.search).get("role");
  if (given === null || given.trim() === "") return ["tester"];
  return given.split(",").map((one) => one.trim()).filter((one) => one !== "");
}

// 一括が何回呼ばれたかを数える。**業務には要らない**が、`batchSize` が効いたかは
// 「ハンドラが呼ばれた回数」でしか分からないので出す。
const counter = newCounter();

// React は「変わった」と言われないと描き直さないので、数えるほうの `onChange` を
// 受けて写しを1つ差し替える（`useSyncExternalStore` は**毎回同じものが返る**ことを
// 求めるので、毎回新しい object を作ってはいけない）。Vue 版は `reactive` で包む
// だけで済む所 —— **枠組みの違いではなく、描く側の作法の違い**。
let seen = { calls: 0, rows: 0 };
const listeners = new Set<() => void>();
counter.onChange = () => {
  seen = { calls: counter.calls, rows: counter.rows };
  for (const one of listeners) one();
};
const watchCounter = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function Status({ roles }: { roles: readonly string[] }) {
  const now = useSyncExternalStore(
    watchCounter,
    () => seen,
    () => seen,
  );
  return (
    <div className="kitchen-sink-status" data-hatake="status">
      {`役割: ${roles.join(",")}　一括: ${
        now.calls === 0 ? "まだ押していません" : `${now.calls} 回 / ${now.rows} 行`
      }`}
    </div>
  );
}

async function start(): Promise<void> {
  // 定義はサーバから読む。**フロントとバックが同じ1枚を読む**が実行時にも本当になる。
  const response = await fetch(`${BASE}/definition.yaml`);
  if (!response.ok) throw new Error(`定義を読めませんでした（${response.status}）`);
  const yaml = await response.text();

  // 2行で読む。1行目がメニューと題、2行目が画面の中身
  // （`parseAppYaml` が返す `pages` は一覧だけなので、描くにはこちらが要る）。
  const app = parseAppYaml(yaml, { strict: true });
  const pages = parseAppPagesYaml(yaml, { strict: true });

  const registries = {
    // 定義が名指ししている Repository（`repository:` と `optionsSource.repository`）。
    // **道は案件の都合**なので、名前と道の対応だけをここで書く。
    repositories: new RepositoryRegistry(
      restRepositories({
        baseUrl: BASE,
        send: fetchSend(),
        collections: {
          itemRepository: "items",
          lineRepository: "lines",
          groupRepository: "groups",
          childRepository: "children",
        },
      }),
    ),

    // 定義が `plugin:` と言っている中身。
    actions: new ActionRegistry({
      reprice: bulkAction(BASE, "reprice", counter),
      archive: bulkAction(BASE, "archive", counter),
    }),

    // 出す口は**出来合い**（0.9.25）。CSV はそのまま保存、帳票は PDF にして保存する。
    // 0.9.24 までは自前の `sinks.ts` で、刷っても PDF ができなかった（`window` に紙を
    // 置くだけ）。保存先が違うアプリ（社内へ送る等）は、ここに自分の口を書く。
    exportSink: downloadCsv,
    printSink: downloadPdf,

    // このアプリが配りうる役割の**語彙**（いま見ている人の役割ではない）。
    knownRoles: ["tester", "admin"],
  };

  const roles = rolesFromUrl();
  const box = document.getElementById("app");
  if (box === null) throw new Error("#app が見つかりません");

  createRoot(box).render(
    <>
      <HatakeScope registries={registries}>
        <HatakeApp app={app} pages={pages} roles={roles} />
      </HatakeScope>
      <Status roles={roles} />
    </>,
  );
}

void start().catch((error: unknown) => {
  // **白い画面にしない。** 定義が読めないのがいちばん多い失敗で、そのとき何も
  // 出ないと原因に辿り着けない。
  const box = document.getElementById("app");
  if (box !== null) {
    box.innerHTML = "";
    const line = document.createElement("p");
    line.className = "hatake-field-message";
    line.setAttribute("role", "alert");
    line.setAttribute("data-hatake", "boot-error");
    line.textContent = error instanceof Error ? error.message : String(error);
    box.append(line);
  }
});
