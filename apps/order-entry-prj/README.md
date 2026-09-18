# 受注入力（hatake の見本・2本目）

営業事務が電話・FAX で受けた注文を入れて、出荷指示まで出す業務システム。

| | |
|---|---|
| 画面 | 5枚（照会・**ウィザード入力**・詳細・ダッシュボード・**帳票**） |
| 役割 | 営業 / 営業事務 / 管理者 |
| 業務の作り | 親子明細・**軽減税率の混ざる消費税**・採番・締め・同時更新・一括の部分失敗・監査 |
| 構成 | Flutter Web ＋ **Java（Spring Boot）** ＋ PostgreSQL |

> **導入を検討する方へ**: [docs/まとめ/](docs/まとめ/) に、
> **同じものを hatake 無しでも作って比べた実測**を置いてあります。

## 動かす

```bash
docker compose up
```

- 画面 <http://localhost:8081>
- API <http://localhost:3001>

**Flutter SDK も JDK も要りません**（Docker だけ）。1回目のビルドは数分かかります。

| ID | 合言葉 | 役割 | 見えるもの |
|---|---|---|---|
| `sato` | `sato123` | 営業（大阪） | 自分の拠点の受注だけ。取消も帳票も出ない |
| `suzuki` | `suzuki123` | 営業（東京） | 同上 |
| `tanaka` | `tanaka123` | 営業事務 | 全拠点・取消・CSV・帳票 |
| `yamada` | `yamada123` | 管理者 | 全部＋ダッシュボード |

## フレームワークを使わない版

同じシステムを hatake 無しで作ったものが [`no-framework/`](no-framework/) にあります
（**納品物ではなく、比べるために作ったもの**）。

```bash
docker compose -f docker-compose.no-framework.yml up
```

画面 <http://localhost:8082> ／ API <http://localhost:3002>（同時に上げられます）

## 中身

```
definitions/     定義（YAML）。flutter-src と java-src が**同じものを読む**
docs/            工程ごとの納品物（設計は全部生成物）
手順/            人が AI に何をしたか（依頼文つき）
flutter-src/     画面。**画面のコードは1行も無い**
java-src/        API（Spring Boot ＋ hatake）
no-framework/    比べるために作った版
tests/           値・API・画面のテスト
tools/           案件ごとの設定だけ（道具はリポジトリ直下の tools/）
```

## 直したら

```bash
node tools/build-design-docs.mjs   # 設計資料を作り直す
bash tools/refresh-docs.sh         # 出力-*.txt を作り直す
bash tools/run-tests.sh            # テストと証跡を作り直す
```

pin している hatake の版は [`../../hatake.version`](../../hatake.version)。
