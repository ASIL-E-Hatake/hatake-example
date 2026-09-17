// 社内マスタメンテナンスの API。
//
// 画面（flutter-src）と**同じ定義**を読む。検索できる条件も、必須も、桁も、項目間の
// 規則も `../definitions/app.yaml` に書いてあるものがそのまま効く。
//
// 定義に**書けない**もの（この案件で外に置いたもの）はここが持つ:
//   ・ログインと資格の確認     … routes/auth.js
//   ・役割で本当に止める       … authz.js（画面の roles は見せ方だけ）
//   ・監査（誰が・いつ・何を）  … audit.js
//   ・同時更新の弾き方         … routes/masters.js（更新日時で見る）
//   ・一括の失敗のあと始末      … routes/bulk.js（1件ずつ確定・失敗した行を返す）

import express from "express";
import { deriveDto, toOpenApi } from "@hatake-fw/api";

import { app as appDefinition, pageOf, pages, source } from "./definition.js";
import { pool } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { bulkRoutes } from "./routes/bulk.js";
import { masterRoutes } from "./routes/masters.js";

const server = express();
server.use(express.json());

// 画面は別の口（nginx）から配るので、ここは API だけ。
server.use("/api/auth", authRoutes());
server.use("/api/employees", masterRoutes({
  pageId: "employee_master", table: "employees", readFrom: "employees_view",
  write: ["admin", "hr"],
}));
server.use("/api/departments", masterRoutes({
  pageId: "department_master", table: "departments", readFrom: "departments_view",
  write: ["admin", "hr"],
}));
server.use("/api/suppliers", masterRoutes({
  pageId: "supplier_master", table: "suppliers", write: ["admin"],
}));
server.use("/api/bulk", bulkRoutes());

// **画面の定義をそのまま配る。**
//
// 画面側（flutter-src）はこれを起動時に読んで描く＝定義のコピーを持たない。
// 「同じ1枚をフロントとバックが読む」が、実行時にもそのまま本当になる
// （画面を直したいときに、定義を差し替えるだけで済む形でもある）。
server.get("/api/definition.yaml", (_req, res) => {
  res.type("text/yaml; charset=utf-8").send(source);
});

// **定義から出した API の形**。サーバを書く人が読む1枚で、手で書いていない。
// `toOpenApi` は画面1枚ぶんなので、画面ごとに出す（`/api/openapi.json?page=<id>`）。
server.get("/api/openapi.json", (req, res) => {
  const id = req.query.page ?? "employee_master";
  const page = pages.get(String(id));
  if (page === undefined) {
    return res.status(404).json({ message: "その画面はありません", pages: [...pages.keys()] });
  }
  res.json(toOpenApi(deriveDto(page)));
});

server.get("/api/health", async (_req, res) => {
  await pool.query("select 1");
  res.json({ ok: true, app: appDefinition.id, pages: [...pages.keys()] });
});

// 落ちたときに**何が起きたか**を出す（黙って 500 を返さない）。
server.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "サーバでエラーが起きました", detail: error.message });
});

const port = Number(process.env.PORT ?? 3000);
// 起動時に定義が読めることを確かめる（読めなければここで落ちる＝あとで気づかない、を防ぐ）。
pageOf("employee_master");
server.listen(port, () => {
  console.log(`API: http://localhost:${port} （定義 ${pages.size} 画面）`);
});
