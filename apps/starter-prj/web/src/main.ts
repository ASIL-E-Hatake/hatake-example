// はじめての hatake（30分サンプル）の画面。
//
// **画面のコードは1行もありません。** ここに書いてあるのは3つだけ:
//
//   ・定義をどこから読むか（nginx がそのまま配っている `definitions/app.yaml`）
//   ・定義が名指ししている Repository（`customerRepository`）の中身
//   ・それを Vue に渡すこと
//
// データは**ブラウザの中の作り物**（`FakeRepository`）。サーバも DB も要らない代わりに、
// 再読み込みすると最初の10件に戻ります。本物のサーバに繋ぐ形は、受注入力の見本を見てください。

import { parseAppPagesYaml, parseAppYaml } from "@hatake-fw/api";
import { FakeRepository, RepositoryRegistry } from "@hatake-fw/runtime";
import { HatakeApp, HatakeScope } from "@hatake-fw/vue3";
import { createApp, h } from "vue";

import "@hatake-fw/runtime/hatake.css";

import { customers } from "./customers.js";

async function start(): Promise<void> {
  // **毎回読み直す**（`no-store`）。定義を書き換えて再読み込みすれば、すぐ画面に出る。
  const response = await fetch("/definitions/app.yaml", { cache: "no-store" });
  if (!response.ok) throw new Error(`定義を読めませんでした（${response.status}）`);
  const yaml = await response.text();

  // strict で読む＝**書き間違えたキーは、ここで理由つきで止まる**（黙って捨てない）。
  const app = parseAppYaml(yaml, { strict: true });
  const pages = parseAppPagesYaml(yaml, { strict: true });

  const registries = {
    repositories: new RepositoryRegistry({
      customerRepository: new FakeRepository(customers, ["customerCode"]),
    }),
  };

  createApp({
    render: () => h(HatakeScope, { registries }, () => h(HatakeApp, { app, pages, roles: [] })),
  }).mount("#app");
}

void start().catch((error: unknown) => {
  // **白い画面にしない。** 定義の書き間違いがいちばん多いので、理由をそのまま出す。
  const box = document.getElementById("app");
  if (box === null) return;
  box.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = "定義を読めませんでした";
  const line = document.createElement("pre");
  line.className = "hatake-field-message";
  line.style.cssText = "font-size: 15px; line-height: 1.6; white-space: pre-wrap; padding: 12px; border-left: 4px solid #c62828; background: #fff5f5;";
  line.setAttribute("role", "alert");
  line.setAttribute("data-hatake", "boot-error");
  line.textContent = error instanceof Error ? error.message : String(error);
  const hint = document.createElement("p");
  hint.textContent =
    "definitions/app.yaml を直して、再読み込みしてください。何が悪いかは " +
    "`docker compose run --rm hatake check definitions/app.yaml` でも分かります。";
  box.style.cssText = "max-width: 960px; margin: 32px auto; padding: 0 16px; font-family: sans-serif;";
  box.append(title, line, hint);
});
