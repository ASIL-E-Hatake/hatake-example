import 'package:flutter/material.dart';
import 'package:hatake_http/hatake_http.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'api.dart';
import 'bulk_actions.dart';
import 'export_sink.dart';
import 'print_sink.dart';

/// API の在り処。同じ所から配られる前提（nginx が `/api` を API に流す）。
const _baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: '/api');

void main() => runApp(const KitchenSinkApp());

/// 機能網羅（hatake の見本・移行確認用）。
///
/// **画面のコードは1行も無い。** 出しているのは `HatakeApp(app: <定義>)` だけで、
/// 6画面はそこから出ます。
///
/// 業務サンプル（1本目・2本目）と違うのは2つ:
///
///   ・**認証を持たない**。役割は URL の `?role=tester,admin` で切り替える
///     （見本のための割り切り。前書きにそう書いてある）
///   ・**区切って実行が効いているか**を目で見られるように、プラグインが呼ばれた
///     回数を画面の隅に出す（`batchSize` は効いていても見た目が変わらないので）
class KitchenSinkApp extends StatefulWidget {
  const KitchenSinkApp({super.key});

  @override
  State<KitchenSinkApp> createState() => _KitchenSinkAppState();
}

class _KitchenSinkAppState extends State<KitchenSinkApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  final _batches = BatchCounter();

  /// 定義はサーバから読む（画面側にコピーを持たない）。
  late final Future<AppDefinition> _definition = fetchDefinition(_baseUrl)
      .then((yaml) => parseAppYaml(yaml, strict: true));

  /// いま配る役割。`?role=` で切り替える（既定は tester）。
  late final Set<String> _roles = _rolesFromUrl();

  static Set<String> _rolesFromUrl() {
    final given = Uri.base.queryParameters['role'];
    if (given == null || given.trim().isEmpty) return const {'tester'};
    return given.split(',').map((one) => one.trim()).where((one) => one.isNotEmpty).toSet();
  }

  RestRepository _rest(String collection) => RestRepository(
        collection: '$_baseUrl/$collection',
        send: httpSend(),
      );

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: '機能網羅',
        debugShowCheckedModeBanner: false,
        navigatorKey: _navigatorKey,
        home: FutureBuilder<AppDefinition>(
          future: _definition,
          builder: (context, snapshot) {
            if (snapshot.hasError) return _Failed(error: snapshot.error!);
            final definition = snapshot.data;
            if (definition == null) {
              return const Scaffold(body: Center(child: CircularProgressIndicator()));
            }
            return _shell(definition);
          },
        ),
      );

  Widget _shell(AppDefinition definition) => HatakeScope(
        renderer: const MaterialRenderer(),

        // 定義が名指ししている Repository（`repository:` と `optionsSource.repository`）。
        repositories: RepositoryRegistry({
          'itemRepository': _rest('items'),
          'lineRepository': _rest('lines'),
          'groupRepository': _rest('groups'),
          'childRepository': _rest('children'),
        }),

        // このアプリが配りうる役割の全部（語彙）。
        knownRoles: const {'tester', 'admin'},

        // いま見ている人。**見せ方だけ**（本当の遮断はサーバ）。
        roles: _roles,

        // 定義が `plugin:` と言っている中身。
        actions: ActionRegistry({
          'saveItem': saveItem(_baseUrl),
          'reprice': bulkAction(_baseUrl, 'reprice', counter: _batches),
          'archive': bulkAction(_baseUrl, 'archive', counter: _batches),
        }),

        exportSink: showCsvDialog(_navigatorKey),
        printSink: showPrintPreview(_navigatorKey),

        child: Stack(
          children: [
            HatakeApp(app: definition),
            // 区切って実行が効いているかは**見た目では分からない**ので、
            // 呼ばれた回数をここに出す（12件を区切り5で押すと「3 回に分けて 12 行」）。
            Positioned(
              right: 16,
              bottom: 16,
              child: SafeArea(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('役割: ${_roles.join(", ")}'),
                        const SizedBox(width: 12),
                        Text(
                          '一括: ${_batches.summary}',
                          key: const Key('kitchenSink.batches'),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: () => setState(_batches.reset),
                          child: const Text('数え直す'),
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
