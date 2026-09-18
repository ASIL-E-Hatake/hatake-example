import 'package:flutter/material.dart';
import 'package:hatake_http/hatake_http.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'api.dart';
import 'bulk_cancel.dart';
import 'export_sink.dart';
import 'login_page.dart';
import 'print_sink.dart';
import 'session.dart';
import 'tax_computed.dart';

/// API の在り処。同じ所から配られる前提（nginx が `/api` を API に流す）。
const _baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: '/api');

void main() => runApp(OrderEntryApp(session: Session(_baseUrl)));

/// 受注入力（見本2本目）。
///
/// **画面のコードは1行も無い。** 出しているのは
///   ・ログイン画面（認証は枠組みの外なので、ここだけ手で書いた）
///   ・`HatakeApp(app: <定義>)` … 照会・ウィザード・詳細・ダッシュボード・帳票の
///     5画面はこれで全部
///
/// 1本目（マスタメンテ）との差は**アプリが足すもの**だけ:
///   ・Repository が4つになった（受注・受注明細・取引先・商品）
///   ・計算 `op: tax` を足した（丸めは業務の決めごとなので、定義には書けない）
///   ・`type: print` の出し先（帳票がある案件だけ要る）
///
/// 何を足せばいいかは
/// `npx hatake refs definitions/app.yaml --needs-registration` で引ける。
class OrderEntryApp extends StatefulWidget {
  const OrderEntryApp({super.key, required this.session});

  final Session session;

  @override
  State<OrderEntryApp> createState() => _OrderEntryAppState();
}

class _OrderEntryAppState extends State<OrderEntryApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();

  /// 定義はサーバから読む（画面側にコピーを持たない）。
  late final Future<AppDefinition> _definition = fetchDefinition(_baseUrl)
      // strict: 知らないキーがあれば**起動時に落ちる**。黙って無視されて
      // 「書いたのに効かない」画面が出るより、早く気づきたい。
      .then((yaml) => parseAppYaml(yaml, strict: true));

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSession);
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    super.dispose();
  }

  void _onSession() => setState(() {});

  /// 1つのコレクションを指す REST の Repository。
  ///
  /// 通信そのものはアプリが持つ（[httpSend]）。枠組みが知っているのは
  /// `Repository` の5つのメソッドだけで、HTTP は最初から知らない。
  RestRepository _rest(String collection) => RestRepository(
        collection: '$_baseUrl/$collection',
        send: httpSend(),
        headers: authHeaders(widget.session),
      );

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: '受注管理',
        debugShowCheckedModeBanner: false,
        navigatorKey: _navigatorKey,
        theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true),
        home: !widget.session.signedIn
            ? LoginPage(session: widget.session)
            : FutureBuilder<AppDefinition>(
                future: _definition,
                builder: (context, snapshot) {
                  if (snapshot.hasError) return _Failed(error: snapshot.error!);
                  final definition = snapshot.data;
                  if (definition == null) {
                    return const Scaffold(
                      body: Center(child: CircularProgressIndicator()),
                    );
                  }
                  return _shell(definition);
                },
              ),
      );

  Widget _shell(AppDefinition definition) => HatakeScope(
        renderer: const MaterialRenderer(),

        // 定義が名指ししている Repository（`repository:` と `optionsSource.repository`）。
        // **REST の契約は定義から決まっている**ので、手で書くのは対応表だけ。
        //
        // 名前をそのまま書く形にしてあるのは `npx hatake registry` のため。
        // 実装を静的に読むので、関数の戻り値に隠れると「登録済みの一覧」が穴あきになる
        // （1本目で実際にそう言われた）。
        repositories: RepositoryRegistry({
          'orderRepository': _rest('orders'),
          'orderLineRepository': _rest('order-lines'),
          'customerRepository': _rest('customers'),
          'productRepository': _rest('products'),
        }),

        // このアプリが**配りうる**役割の全部（語彙）。いま見ている人（roles:）とは別。
        knownRoles: const {'sales', 'clerk', 'manager'},

        // いま見ている人。定義に書いた `roles` はここと突き合わされる。
        // **これは見せ方だけ**で、本当の遮断は API 側（java-src の `Authz`）。
        roles: widget.session.roles,

        // 定義が `computed: { op: tax, ... }` と言っている中身。
        // 組み込みの計算には丸めが無く、丸めは業務の決めごとなので定義に書けない。
        // 計算そのものは枠組みの `computeInvoice`（3版同出力）を呼ぶだけ。
        computeds: ComputedRegistry({'tax': taxOf}),

        // 定義が `plugin: bulkCancel` と言っている中身。
        actions: ActionRegistry({
          'bulkCancel': bulkCancel(_baseUrl, widget.session),
        }),

        // `type: export` の出し先。
        exportSink: showCsvDialog(_navigatorKey),

        // `type: print` の出し先。**1本目には無かった**（帳票がある案件だけ要る）。
        printSink: showPrintPreview(_navigatorKey),

        child: Stack(
          children: [
            HatakeApp(app: definition),
            // 誰で見ているかとログアウト。**アプリの作り**なので画面の上に重ねる
            // （定義の側に「ログアウト」を書く場所は無い＝認証は枠組みの外）。
            Positioned(
              right: 16,
              bottom: 16,
              child: SafeArea(
                child: Card(
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${widget.session.displayName ?? ''}'
                            '（${widget.session.roles.join(", ")}）'),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: widget.session.signOut,
                          child: const Text('ログアウト'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
}

/// 定義が読めなかったとき。**黙って白い画面を出さない**。
class _Failed extends StatelessWidget {
  const _Failed({required this.error});

  final Object error;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('画面の定義を読めませんでした'),
                const SizedBox(height: 8),
                SelectableText('$error'),
                const SizedBox(height: 8),
                const Text('API が動いているか確かめてください（docker compose up）'),
              ],
            ),
          ),
        ),
      );
}
