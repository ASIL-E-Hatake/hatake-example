# hatake-example（AI 向けの指示）

[hatake](https://github.com/ASIL-E-Hatake/hatake) を**実際の案件の形**で使った見本を置く
リポジトリ。**見本なので、読む人が真似できる形になっていることが中身より大事**。

作業するときは、その案件のフォルダ（`apps/<案件>-prj/`）の `CLAUDE.md` も読む。

## このリポジトリの決めごと

1. **画面は定義（YAML）で作る。** Flutter / Vue のウィジェットを手で書かない。
   ページを1枚足すのに Dart を書き始めたら、それは間違い。

2. **`definitions/` は案件に1つ。** `flutter-src` と `node-src` が**同じ定義を読む**。
   アプリごとに定義をコピーすると、「同じ定義でフロントとバックが揃う」という
   hatake の主張をこのリポジトリ自身が否定することになる。

3. **人の紙と道具の出力を混ぜない。**

   | | 誰が書くか |
   |---|---|
   | `docs/1-要件定義/案件の説明.md` など | **人**。AI は読むだけ |
   | `docs/**/出力-*.txt` | 道具（そのまま置いただけ）。**手で直さない** |
   | `definitions/*.yaml` | AI |

   出力を作り直すのは `tools/refresh-docs.sh`。

4. **版は tag で pin する。** `hatake.version` の tag を `ref:` に書く。
   `main` を指さない（フレームワーク側が push した瞬間に見本が壊れる）。

5. **動かないものを「動く」と書かない。** README に書いた手順は、動くまで
   ⚠️ を付けておく（見本の README が嘘をつくのがいちばん質が悪い）。

## フォルダ

```
apps/<案件名>-prj/
├─ CLAUDE.md        その案件の決めごと（前書きから生成した節つき）
├─ .claude/         許す操作・定型の依頼
├─ README.md        何の案件か・動かし方
├─ 手順/            **人が AI に何を投げたか**（操作）
├─ docs/            工程ごとの成果物（要件定義 / 設計 / 実装 / テスト）
├─ definitions/     定義。flutter-src と node-src が同じものを読む
├─ flutter-src/     画面
├─ node-src/        API
├─ docker/          動かす一式
└─ tools/           docs の出力を作り直す
```

## 案件を増やすとき

`apps/<案件名>-prj/` を作って、[手順](docs/how-to-ask-ai.ja.md)の順でやる。
**案件の説明と前書きは人が書く**（AI に想像で埋めさせない）。

見本にする以上、**アプリを2つ並べるより1つの案件を深く**したい
（`flutter-app1` / `flutter-app2` のような切り方はしない）。

## 道具

```bash
npx hatake reference <キー名>    # このキーはどこに書く？型は？
npx hatake examples <やりたいこと>  # 近い例
npx hatake where <やりたいこと>    # hatake で書けるか
npx hatake rules <規則名>         # この警告は何？
```

仕様書は読まなくていい（引けるようになっている）。
