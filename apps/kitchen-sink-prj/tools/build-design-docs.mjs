#!/usr/bin/env node
// 中身は案件の外（`../../../tools/build-design-docs.mjs`）。**案件をまたいで同じ道具**を
// 使う＝設計資料の様式が案件ごとにずれない。案件ごとに違うところは
// `tools/design.config.json` に書く（API の実装がどこか・定義に書けない口は何か）。
//
//   node tools/build-design-docs.mjs            … 作り直す
//   node tools/build-design-docs.mjs --check    … 古くなっていないか見るだけ（CI 用）
import "../../../tools/build-design-docs.mjs";
