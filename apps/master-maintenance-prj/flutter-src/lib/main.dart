import 'package:flutter/material.dart';
import 'package:hatake_http/hatake_http.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'api.dart';
import 'bulk_retire.dart';
import 'export_sink.dart';
import 'login_page.dart';
import 'session.dart';

/// API の在り処。同じ所から配られる前提（nginx が `/api` を API に流す）。
const _baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: '/api');

void main() => runApp(MasterMaintenanceApp(session: Session(_baseUrl)));

/// 社内マスタメンテナンス。
///
/// **画面のコードは1行も無い。** 出しているのは
///   ・ログイン画面（認証は枠組みの外なので、ここだけ手で書いた）
///   ・`HatakeApp(app: <定義>)` … 社員・部署・取引先の4画面はこれで全部
///
/// アプリが用意するのは「定義が要求しているもの」だけで、その一覧は
/// `npx hatake refs definitions/app.yaml --needs-registration` で引ける
/// （Repository 3つ・プラグイン `bulkRetire`・出す口・役割）。
class MasterMaintenanceApp extends StatefulWidget {
  const MasterMaintenanceApp({super.key, required this.session});

  final Session session;

  @override
  State<MasterMaintenanceApp> createState() => _MasterMaintenanceAppState();
}

class _MasterMaintenanceAppState extends State<MasterMaintenanceApp> {
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
        title: '社内マスタ',
        debugShowCheckedModeBanner: false,
        navigatorKey: _navigatorKey,
        theme: ThemeData(colorSchemeSeed: Colors.teal, useMaterial3: true),
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

        // 定義が名指ししている Repository（`repository: employeeRepository` …）。
        // **REST の契約は定義から決まっている**ので、手で書くのは対応表だけ。
        //
        // `restRepositories(collections: {...})` でまとめて作ることもできるが、
        // **名前をそのまま書く**形にしてある。`npx hatake registry` は実装を静的に
        // 読むので、関数の戻り値に隠れると読めず「登録済みの一覧」が穴あきになる
        // （実際そう言われた）。一覧が穴あきだと `validate --registry` が
        // 「登録していない Repository」を言えなくなる。
        repositories: RepositoryRegistry({
          'employeeRepository': _rest('employees'),
          'departmentRepository': _rest('departments'),
          'supplierRepository': _rest('suppliers'),
        }),

        // このアプリが**配りうる**役割の全部（語彙）。いま見ている人（roles:）とは別。
        // 宣言しておくと `hatake validate --registry` が「定義にしか無い役割」＝
        // 誰にも見えない列やボタンを言える。
        knownRoles: const {'admin', 'hr', 'viewer'},

        // いま見ている人。定義に書いた `roles` はここと突き合わされる。
        // **これは見せ方だけ**で、本当の遮断は API 側（node-src/src/authz.js）。
        roles: widget.session.roles,

        // 定義が `plugin: bulkRetire` と言っている中身。
        actions: ActionRegistry({
          'bulkRetire': bulkRetire(_baseUrl, widget.session),
        }),

        // `type: export` の出し先。
        exportSink: showCsvDialog(_navigatorKey),

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
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
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
