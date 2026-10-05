// 機能網羅（Vue 版）。
//
// **画面のコードは1行も無い。** 出しているのは `HatakeApp` 1つだけで、メニューも
// 画面の行き来も検索も入力も、定義（`definitions/app.yaml`）から出ている。
// Flutter 版（`flutter-src/lib/main.ts` に当たる `main.dart`）と**同じ定義・同じ登録**で、
// 違うのは描く側だけ。
//
// 案件が書くのはこの4つ:
//
//   ・定義をどこから読むか（ここではサーバ。画面側にコピーを持たない）
//   ・どの Repository がどの道か（`restRepositories`）
//   ・`plugin:` と書いたボタンの中身（`actions.ts`）
//   ・出す口（CSV と印刷。出来合いの `downloadCsv` / `downloadPdf` を登録するだけ）

import { parseAppPagesYaml, parseAppYaml } from "@hatake-fw/api";
import { fetchSend, restRepositories } from "@hatake-fw/http";
import { ActionRegistry, downloadCsv, downloadPdf, RepositoryRegistry } from "@hatake-fw/runtime";
import { HatakeApp, HatakeScope } from "@hatake-fw/vue3";
import { createApp, h, reactive } from "vue";

import "@hatake-fw/runtime/hatake.css";

import { bulkAction, newCounter } from "./actions.js";

const BASE = "/api";

/** いま配る役割。`?role=` で切り替える（この案件は認証を持たない）。 */
function rolesFromUrl(): string[] {
  const given = new URLSearchParams(window.location.search).get("role");
  if (given === null || given.trim() === "") return ["tester"];
  return given.split(",").map((one) => one.trim()).filter((one) => one !== "");
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

  // **数えるだけの小窓**（業務には要らない）。`batchSize` が効いたかは「ハンドラが
  // 何回呼ばれたか」でしか分からないので、reactive にして画面に出す。
  const counter = reactive(newCounter());

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

  createApp({
    render: () =>
      h("div", {}, [
        h(HatakeScope, { registries }, () => h(HatakeApp, { app, pages, roles })),
        // 区切って実行が効いているかを見るための小窓。**業務には要らない**が、
        // `batchSize` が効いたかは「呼ばれた回数」でしか分からない。
        h(
          "div",
          { class: "kitchen-sink-status", "data-hatake": "status" },
          `役割: ${roles.join(",")}　一括: ${
            counter.calls === 0 ? "まだ押していません" : `${counter.calls} 回 / ${counter.rows} 行`
          }`,
        ),
      ]),
  }).mount("#app");
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
