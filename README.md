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

| 案件 | 何の案件か | 使っている機能 |
|---|---|---|
| [master-maintenance-prj](apps/master-maintenance-prj/) | 社内マスタメンテナンス（社員・部署・取引先） | crud / master / detail / 権限 / 複雑な検索 / 一括 / CSV |

> **導入を検討する方へ**: 1本目を通してみた記録（工数の比較・人が作るべきもの・
> 納品物・起きた問題・課題）を
> **[apps/master-maintenance-prj/docs/まとめ/](apps/master-maintenance-prj/docs/まとめ/)**
> にまとめてあります。

これから増やす予定: 受注入力（親子明細・計算項目・ウィザード・帳票・ダッシュボード）、
Vue 版。

## フォルダの決めごと

```
apps/<案件名>-prj/
├─ README.md        この案件は何か・動かし方
├─ docs/            **人が AI に渡したもの**（案件の説明・依頼文・返ってきた問い）
├─ definitions/     定義（YAML）。flutter-src と node-src が**同じものを読む**
├─ flutter-src/     画面（Flutter + hatake_material）
├─ node-src/        API（Express + @hatake-fw/api）
└─ docker/          動かすための一式
```

`definitions/` を案件の直下に置いているのは意図的。**同じ定義でフロントとバックの
バリデーションがずれない**、が hatake の主張なので、アプリごとに定義をコピーすると
リポジトリ自身がその主張を否定することになる。

### version は tag で持つ（ディレクトリで持たない）

`v0.9.0/flutter/...` のように版ごとにディレクトリを切ると、**古い書き方が検索で先に
見つかる**。サンプルの値打ちは「いまの正しい書き方」なので、古い版は tag で残す。

## 動かす

```bash
cd apps/master-maintenance-prj
docker compose up
```

詳しくは各案件の README。
