# フレームワークを使わない版（比べるために作ったもの）

> **これは納品物ではありません。** 隣の [hatake 版](../) と**同じシステム**を、
> hatake を使わずに作るとどうなるかを測るために作りました。

## 決めごと（ここを外すと比較が嘘になる）

| | |
|---|---|
| **同じ業務** | 画面5枚・役割3つ・受注入力の規則は1つも減らさない |
| **同じ DB** | スキーマも種データも[隣と同じもの](../docker/postgres/)を共用する |
| **同じテスト** | [API テスト28件](../tests/api/run.mjs)を**1文字も変えずに**通す |
| **普通の作り方** | 「自分でフレームワークを書く」ではなく、**その言語で普通に選ぶ道具**を使う |

最後の1つが大事です。hatake を使わない＝ミニ hatake を自作する、ではありません。
AI（Claude Code）に「Spring Boot と Flutter で受注入力を作って」と頼んだら出てくるであろう、
**素直な作り**にしています:

- API … Spring Boot ＋ **Jakarta Bean Validation**（`@NotNull` / `@Size` / 独自の注釈）
- 画面 … Flutter の Widget を手で組む（`TextFormField` / `DataTable` / `Stepper`）

## 何が変わるか（先に結論）

| | hatake 版 | この版 |
|---|---|---|
| 業務の記述 | 定義 YAML **1枚** | Java の DTO ＋ Dart の Widget に**散らばる** |
| 検証の置き場 | 定義1か所（画面とサーバが同じものを読む） | **DTO（サーバ）と Widget（画面）に2つ** |
| 設計書 | 定義から生成 | **手で書く**（書かなければ無い） |
| 帳票 | 定義＋`hatake_print` | 紙の組版を自分で書く |

数字は [工数の比較](../docs/まとめ/工数の比較.md) に入れます。

## 動かす

```bash
cd apps/order-entry-prj
docker compose -f docker-compose.no-framework.yml up
```

画面 <http://localhost:8082> ／ API <http://localhost:3002>
（hatake 版と**同時に上げられる**ように、口を分けてあります）
