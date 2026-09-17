# flutter-src — 画面（Flutter + hatake_material）

**画面のコードは1行も無い。** `lib/` に在るのは、定義が要求しているものを用意する配線と、
定義では作らないと決めたログイン画面だけ。

```
lib/
├─ main.dart        HatakeScope の配線＋HatakeApp（4画面はこれで全部）
├─ session.dart     ログインした人（トークンと役割）… hatake の外
├─ login_page.dart  ログイン画面 … hatake の外（唯一の手書きの画面）
├─ api.dart         HttpSend の実装と、定義を読む口
├─ bulk_retire.dart プラグイン「まとめて退職にする」の中身
└─ export_sink.dart CSV の出し先
```

## 画面が出るまで

```dart
final yaml = await fetchDefinition('/api');          // 定義はサーバから読む
final definition = parseAppYaml(yaml, strict: true); // 知らないキーは起動時に落とす
...
HatakeApp(app: definition)                           // これで4画面
```

**定義を画面側にコピーしていない。** `node-src` が `/api/definition.yaml` で配っているものを
そのまま読む＝「フロントとバックが同じ1枚を読む」が実行時にもそのまま本当になる
（画面を直したいときは定義を差し替えるだけで済む形でもある）。

## アプリが用意するもの＝定義が要求しているもの

一覧は引ける:

```bash
npx hatake refs ../definitions/app.yaml --needs-registration
```

| 要求 | 用意した所 |
|---|---|
| `employeeRepository` ほか3つ | `main.dart` の `RepositoryRegistry`（REST は `hatake_http`） |
| `bulkRetire`（プラグイン） | `bulk_retire.dart` |
| 出す口（`type: export`） | `export_sink.dart` |
| 役割 `admin` / `hr` / `viewer` | `session.dart`（ログインで配る） |

用意し忘れると**画面は出るのにデータが来ない／押しても何も起きない**。
それを機械で言うために、実装から一覧を作って定義と突き合わせる:

```bash
npx hatake registry lib --out ../definitions/hatake-registry.json
npx hatake validate ../definitions/app.yaml --registry ../definitions/hatake-registry.json
```

> **`restRepositories(collections: {...})` を使わず、名前をそのまま書いている**のはこのため。
> `hatake registry` は実装を**静的に読む**ので、関数の戻り値に隠れると読めず
> 「読めなかった登録が 2 件あります」と言われて一覧が穴あきになる（実際そうなった）。
> 穴あきの一覧を渡すと、突き合わせが**言えるはずのことを言えなくなる**。

## 枠組みの外に置いたもの

| | なぜ |
|---|---|
| ログイン画面 | `npx hatake where 認証` が「枠組みの外」と返す。資格を確かめるのは API |
| ログアウトと「誰で見ているか」の札 | 定義の側に書く場所が無い＝役割はアプリが配るもの |
| CSV をどこへ出すか | 枠組みは CSV を**組む**ところまで。届けるのは業務の決めごと |
| 一括の中身 | 前書きで `where: plugin` と宣言した |

## 役割の効き方（画面と API で別）

画面の `roles` は**見せ方だけ**。`hr` でログインすると取引先の「CSV 出力」が消え、
`viewer` だと「CSV 出力」「まとめて退職にする」も選択のチェックボックスも消える。

ただし **API を直接叩けばデータは取れる**ので、本当の遮断は `node-src/src/authz.js`。
両方書いてあるのは、前書きの `authz-server` でそう決めたから。

## 動かす

案件の根から `docker compose up`（Flutter SDK は要らない。Docker がビルドする）。
手元に SDK が在るなら:

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000/api
```
