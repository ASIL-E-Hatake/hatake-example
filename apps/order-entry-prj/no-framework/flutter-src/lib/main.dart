import 'package:flutter/material.dart';

import 'api.dart';
import 'dashboard_page.dart';
import 'login_page.dart';
import 'order_detail_page.dart';
import 'order_entry_page.dart';
import 'order_search_page.dart';
import 'order_slip_page.dart';
import 'session.dart';

/// API の在り処。同じ所から配られる前提（nginx が `/api` を API に流す）。
const _baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: '/api');

void main() => runApp(OrderEntryApp(session: Session(_baseUrl)));

/// 受注入力（フレームワーク**無し**版）。
///
/// hatake 版との差がここに全部出る。あちらは
///
/// ```dart
/// HatakeScope(..., child: HatakeApp(app: definition))
/// ```
///
/// の1行で5画面が出ていた。この版は
///
///   ・メニューを組む（誰に何を見せるかも、ここで手で分ける）
///   ・画面を切り替える仕掛けを書く
///   ・画面そのものを5枚書く
///
/// を全部やる。**定義は無い**ので、画面の形はコードが唯一の正になる
/// ＝設計書はここから起こせない（手で書くしかない）。
class OrderEntryApp extends StatefulWidget {
  const OrderEntryApp({super.key, required this.session});

  final Session session;

  @override
  State<OrderEntryApp> createState() => _OrderEntryAppState();
}

class _OrderEntryAppState extends State<OrderEntryApp> {
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

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: '受注管理',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true),
        home: !widget.session.signedIn
            ? LoginPage(session: widget.session)
            : _Shell(session: widget.session),
      );
}

/// メニュー1件。**誰に見せるかもここで持つ**（hatake 版では定義の `roles`）。
class _MenuItem {
  const _MenuItem({
    required this.id,
    required this.label,
    required this.icon,
    this.roles = const {},
    this.group,
  });

  final String id;
  final String label;
  final IconData icon;

  /// 空 = 全員に見せる。
  final Set<String> roles;

  /// グループの見出し（null なら見出し無し）。
  final String? group;

  bool visibleTo(Set<String> mine) =>
      roles.isEmpty || roles.any(mine.contains);
}

const _menu = <_MenuItem>[
  _MenuItem(id: 'order_search', label: '受注照会', icon: Icons.search),
  _MenuItem(id: 'order_entry', label: '受注入力', icon: Icons.add_shopping_cart),
  _MenuItem(
    id: 'order_slip',
    label: '注文請書',
    icon: Icons.print,
    roles: {'clerk', 'manager'},
  ),
  _MenuItem(
    id: 'order_dashboard',
    label: 'ダッシュボード',
    icon: Icons.insights,
    roles: {'manager'},
    group: '管理',
  ),
];

class _Shell extends StatefulWidget {
  const _Shell({required this.session});

  final Session session;

  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  late final Api _api = Api(widget.session.baseUrl, widget.session);
  String _page = 'order_search';

  /// 詳細・修正に渡す受注番号（画面の切り替えを自分で持つので、引数もここで持つ）。
  String? _orderNo;

  void _go(String page, {String? orderNo}) => setState(() {
        _page = page;
        _orderNo = orderNo;
      });

  @override
  Widget build(BuildContext context) {
    final roles = widget.session.roles;
    final visible = _menu.where((one) => one.visibleTo(roles)).toList();

    return Scaffold(
      body: Row(
        children: [
          _sidebar(visible),
          const VerticalDivider(width: 1),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _sidebar(List<_MenuItem> visible) {
    final rows = <Widget>[];
    String? lastGroup;
    for (final one in visible) {
      if (one.group != null && one.group != lastGroup) {
        rows.add(Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(one.group!, style: Theme.of(context).textTheme.labelSmall),
        ));
      }
      lastGroup = one.group;
      rows.add(ListTile(
        dense: true,
        selected: _page == one.id,
        leading: Icon(one.icon, size: 20),
        title: Text(one.label),
        onTap: () => _go(one.id),
      ));
    }
    return SizedBox(
      width: 220,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
            child: Text('受注管理', style: Theme.of(context).textTheme.titleLarge),
          ),
          Expanded(child: ListView(padding: EdgeInsets.zero, children: rows)),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${widget.session.displayName ?? ''}'
                    '（${widget.session.roles.join(", ")}）',
                    style: Theme.of(context).textTheme.bodySmall,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                TextButton(
                  onPressed: widget.session.signOut,
                  child: const Text('ログアウト'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _body() => switch (_page) {
        'order_search' => OrderSearchPage(
            api: _api,
            session: widget.session,
            onOpenDetail: (orderNo) => _go('order_detail', orderNo: orderNo),
            onOpenEdit: (orderNo) => _go('order_entry', orderNo: orderNo),
          ),
        'order_entry' => OrderEntryPage(
            api: _api,
            orderNo: _orderNo,
            onDone: () => _go('order_search'),
          ),
        'order_detail' => OrderDetailPage(
            api: _api,
            session: widget.session,
            orderNo: _orderNo!,
            onBack: () => _go('order_search'),
          ),
        'order_dashboard' => DashboardPage(api: _api, onOpenOrders: () => _go('order_search')),
        'order_slip' => OrderSlipPage(api: _api),
        _ => const SizedBox.shrink(),
      };
}
