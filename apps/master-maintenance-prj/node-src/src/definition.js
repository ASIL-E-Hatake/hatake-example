// 画面と**同じ定義**を読む。
//
// ここが hatake の主張そのもの: 画面を描く定義と、API がリクエストを検証する定義が
// 同じ1枚。だから `definitions/` は案件の直下に置いてあり、この API は `../definitions`
// を見る（コピーを持たない＝コピーを持った瞬間、ずれても誰も気づかない）。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import { parseAppSource } from "@hatake-fw/api";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..", "..", "definitions", "app.yaml");

export const source = readFileSync(SOURCE, "utf8");
const parsed = parseAppSource(source);

/**
 * 素の定義（解析前）。`checkBulkLimit` のように**書いてあるまま**を見る道具に渡す。
 */
export const document = parseYaml(source);

/** 画面 id → 定義（検索の条件・入力の枠・列）。 */
export const pages = new Map(parsed.pages.map((page) => [page.id, page]));

/** アプリ全体（役割の語彙など）。 */
export const app = parsed.app;

/** 画面1枚を取り出す（無ければ落とす＝設定の間違いを起動時に出す）。 */
export function pageOf(id) {
  const page = pages.get(id);
  if (page === undefined) {
    throw new Error(`定義に画面 "${id}" がありません（${SOURCE}）`);
  }
  return page;
}
