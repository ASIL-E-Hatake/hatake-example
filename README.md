# hatake-example 🌱

[hatake](https://github.com/ASIL-E-Hatake/hatake) を**実際の案件の形**で使った見本。

フレームワーク本体のデモ（`hatake_example`）と違って、こっちは**配ったものを外から
使っている**。pin しているのは [`hatake.version`](hatake.version) の tag で、
git からそのまま入れている。

## 何を見せたいか

| | |
|---|---|
| **動くもの** | `docker compose up` だけ。Flutter SDK も Node も入れなくていい |
| **業務に近いもの** | 認証・権限・複雑な検索・一括処理・監査まで入った形 |
| **人が AI に何をしたか** | 案件の説明・前書き・依頼文・返ってきた問いを**全部残してある** |
| **納品できる形** | 設計書（画面一覧・遷移図・画面設計書・API 一覧）とテストのエビデンスまで。**全部生成物** |

3つ目がこのリポジトリの本体かもしれない。定義を書くのは AI だけど、**AI に依頼を出すのは
人**なので、その人が何を用意して何を決めたかが残っていないと真似できない。

→ [人が AI に何をするか](docs/how-to-ask-ai.ja.md)

## 案件

| 案件 | 何の案件か | 使っている機能 | API |
|---|---|---|---|
| [master-maintenance-prj](apps/master-maintenance-prj/) | 社内マスタメンテナンス（社員・部署・取引先） | crud / master / detail / 権限 / 複雑な検索 / 一括 / CSV | Node |
| [order-entry-prj](apps/order-entry-prj/) | 受注入力（受注を入れて出荷指示まで） | wizard / subTable / 計算項目 / dashboard / report / 帳票印刷 | **Java** |
| [kitchen-sink-prj](apps/kitchen-sink-prj/) | **機能網羅**（業務のふりをしない・移行確認用） | DSL の (ノード, キー) **249組すべて** | Node（モック） |

> **導入を検討する方へ**: 通してみた記録（工数の比較・人が作るべきもの・納品物・
> 起きた問題・課題）を各案件の `docs/まとめ/` に置いてあります。
>
> ・[1本目のまとめ](apps/master-maintenance-prj/docs/まとめ/)（見積もり）
> ・**[2本目のまとめ](apps/order-entry-prj/docs/まとめ/)（実測。同じものを
>   hatake 無しでも作って比べました）**

2本目には**フレームワークを使わない版**が
[`no-framework/`](apps/order-entry-prj/no-framework/) に入っています。
同じ DB・同じテストで比べた結果は
[工数の比較](apps/order-entry-prj/docs/まとめ/工数の比較.md)。

> **3本目は毛色が違います。** [kitchen-sink-prj](apps/kitchen-sink-prj/) は納品物の
> 見本ではなく、**DSL のキーを一度ずつ全部書いて動かす**ためのアプリです。
> 1.0 で凍らせる前に全部通しておくことと、**版を上げたときの差分を1か所で見る**
> （移行確認）のために置いています。作った初回でフレームワークの不具合が2件出ました。

これから増やす予定: Vue 版。

## フォルダの決めごと

```
tools/                 **案件をまたいで使う道具**（設計資料・出力紙・テスト）
apps/<案件名>-prj/
├─ README.md           この案件は何か・動かし方
├─ docs/               工程ごとの納品物（設計は全部生成物）＋ まとめ
├─ 手順/               **人が AI に何をしたか**（依頼文つき）
├─ definitions/        定義（YAML）。画面と API が**同じものを読む**
├─ flutter-src/        画面（Flutter + hatake_material）
├─ node-src/ or java-src/  API
├─ tools/              **この案件の設定だけ**（道具は上の tools/）
└─ docker/             動かすための一式
```

道具を案件の外に置いているのは、**2本目で作り直さないため**です。
1本目の生成物がバイト単位で変わらないことを確かめてから上げました。

`definitions/` を案件の直下に置いているのは意図的。**同じ定義でフロントとバックの
バリデーションがずれない**、が hatake の主張なので、アプリごとに定義をコピーすると
リポジトリ自身がその主張を否定することになる。

### version は tag で持つ（ディレクトリで持たない）

`v0.9.0/flutter/...` のように版ごとにディレクトリを切ると、**古い書き方が検索で先に
見つかる**。サンプルの値打ちは「いまの正しい書き方」なので、古い版は tag で残す。

## 動かす

```bash
cd apps/master-maintenance-prj   # または apps/order-entry-prj
docker compose up
```

詳しくは各案件の README。
