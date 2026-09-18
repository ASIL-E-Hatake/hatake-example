import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'session.dart';
import 'totals.dart';

/// 受注照会（フレームワーク**無し**版）。
///
/// hatake 版では定義に `search.filters` 6件・`table.columns` 8件・`actions` 4件を
/// 書くだけで、検索欄も一覧も並べ替えもページ送りも選択のチェックボックスも出た。
/// この版は<b>その全部を組む</b>。
///
/// 特に手がかかったのは:
///   ・条件の種類ごとの入力（文字・選択・日付の範囲・数の範囲・複数選択）
///   ・選択肢を API から引いてくる所（取引先）
///   ・並べ替えの状態を持って、押されたら問い合わせを作り直す所
///   ・**役割ごとの出し分け**（列もボタンも。API 側の表と同じことを書く）
///   ・一括の上限と確認の文言（**API 側と同じ数・同じ文言**にする責任は人が持つ）
class OrderSearchPage extends StatefulWidget {
  const OrderSearchPage({
    super.key,
    required this.api,
    required this.session,
    required this.onOpenDetail,
    required this.onOpenEdit,
  });

  final Api api;
  final Session session;
  final void Function(String orderNo) onOpenDetail;
  final void Function(String orderNo) onOpenEdit;

  @override
  State<OrderSearchPage> createState() => _OrderSearchPageState();
}

class _OrderSearchPageState extends State<OrderSearchPage> {
  /// 1ページの件数。**API 側の既定と揃える**（揃っていないと最後のページがずれる）。
  static const _pageSize = 50;

  /// 一括の上限。**API 側の表と同じ数**を書く（片方だけ直すと食い違う）。
  static const _bulkLimitByRole = {'clerk': 20};
  static const _bulkLimitDefault = 50;

  final _orderNo = TextEditingController();
  final _totalFrom = TextEditingController();
  final _totalTo = TextEditingController();
  String? _customerCode;
  DateTimeRange? _orderDate;
  DateTimeRange? _dueDate;
  final _orderStatus = <String>{};

  List<Map<String, Object?>> _customers = const [];
  List<Map<String, Object?>> _rows = const [];
  final _selected = <String>{};
  int _total = 0;
  int _page = 0;
  String? _sortField;
  bool _ascending = true;
  bool _loading = false;
  String? _error;

  bool get _canBulk => widget.session.roles.contains('clerk');
  bool get _canExport =>
      widget.session.roles.any({'clerk', 'manager'}.contains);
  bool get _canSeeCreatedBy =>
      widget.session.roles.any({'clerk', 'manager'}.contains);

  @override
  void initState() {
    super.initState();
    _loadCustomers();
    _search();
  }

  @override
  void dispose() {
    _orderNo.dispose();
    _totalFrom.dispose();
    _totalTo.dispose();
    super.dispose();
  }

  Future<void> _loadCustomers() async {
    try {
      final found = await widget.api.list('customers', {});
      if (mounted) setState(() => _customers = found.items);
    } on ApiError {
      // 選択肢が引けなくても画面は出す（空振りは普通）。
    }
  }

  Map<String, List<String>> _params() {
    final params = <String, List<String>>{
      'page': ['$_page'],
      'pageSize': ['$_pageSize'],
    };
    if (_orderNo.text.trim().isNotEmpty) params['orderNo'] = [_orderNo.text.trim()];
    if (_customerCode != null) params['customerCode'] = [_customerCode!];
    if (_orderDate != null) {
      params['orderDate'] = [_ymd(_orderDate!.start), _ymd(_orderDate!.end)];
    }
    if (_dueDate != null) {
      params['dueDate'] = [_ymd(_dueDate!.start), _ymd(_dueDate!.end)];
    }
    if (_orderStatus.isNotEmpty) params['orderStatus'] = _orderStatus.toList();
    if (_totalFrom.text.trim().isNotEmpty || _totalTo.text.trim().isNotEmpty) {
      params['totalAmount'] = [_totalFrom.text.trim(), _totalTo.text.trim()];
    }
    if (_sortField != null) {
      params['sortField'] = [_sortField!];
      params['sortAscending'] = ['$_ascending'];
    }
    return params;
  }

  Future<void> _search() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final found = await widget.api.list('orders', _params());
      if (!mounted) return;
      setState(() {
        _rows = found.items;
        _total = found.totalCount;
        _selected.removeWhere(
            (key) => !found.items.any((row) => row['orderNo'] == key));
      });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _sortBy(String field) {
    setState(() {
      if (_sortField == field) {
        _ascending = !_ascending;
      } else {
        _sortField = field;
        _ascending = true;
      }
      _page = 0;
    });
    _search();
  }

  int get _bulkLimit {
    var widest = -1;
    for (final role in widget.session.roles) {
      final found = _bulkLimitByRole[role];
      if (found != null && found > widest) widest = found;
    }
    return widest >= 0 ? widest : _bulkLimitDefault;
  }

  Future<void> _bulkCancel() async {
    // 押す前の確認。**文言も件数も定義から来ない**ので、ここに書く。
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('受注の取消'),
        content: Text('選んだ ${_selected.length} 件を取消にします。よろしいですか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('やめる'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('取消にする'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      final body = await widget.api
          .post('/bulk/cancel', {'keys': _selected.toList()});
      final succeeded = (body['succeeded'] as num? ?? 0).toInt();
      final rejected = (body['rejected'] as List? ?? const []).whereType<Map>();
      if (!mounted) return;
      // 終わったあとの文言も手で組む（hatake 版は `onSuccess` / `onError` の1行）。
      final message = rejected.isEmpty
          ? '$succeeded 件を取消にしました'
          : '${rejected.length} 件が取り消せませんでした'
              '（失敗した行: ${rejected.map((one) => one['key']).join(', ')}）';
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
      _selected.clear();
      await _search();
    } on ApiError catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _exportCsv() async {
    // 一覧に出ている列と同じ並びで CSV を作る。**列の定義が2か所になる**ので、
    // 列を足したらここも直す（忘れても誰も言わない）。
    final columns = _columns();
    final buffer = StringBuffer()
      ..writeln(columns.map((one) => _csv(one.label)).join(','));
    // 画面に出ている分だけでなく全件を出す（`scope: all` 相当）。
    final all = await widget.api.list('orders', {
      ..._params(),
      'page': ['0'],
      'pageSize': ['1000'],
    });
    for (final row in all.items) {
      buffer.writeln(
          columns.map((one) => _csv(one.text(row))).join(','));
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('受注一覧.csv'),
        content: SizedBox(
          width: 560,
          height: 320,
          child: SingleChildScrollView(
            child: SelectableText(buffer.toString()),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () =>
                Clipboard.setData(ClipboardData(text: buffer.toString())),
            child: const Text('コピー'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  static String _csv(String value) =>
      value.contains(RegExp('[,"\n]')) ? '"${value.replaceAll('"', '""')}"' : value;

  /// 一覧の列。**API 側の `ColumnRoles` と同じ出し分けをここにも書く**。
  List<_Column> _columns() => [
        _Column('orderNo', '受注番号', 125, sortable: true),
        _Column('customerName', '取引先', null, sortable: true),
        _Column('orderDate', '受注日', 100, sortable: true),
        _Column('dueDate', '納期', 100, sortable: true),
        _Column('orderStatus', '受注状態', 85, text: orderStatusLabel),
        _Column('lineCount', '明細', 60, numeric: true),
        _Column('totalAmount', '合計', 105, numeric: true, sortable: true, text: yen),
        if (_canSeeCreatedBy) _Column('createdBy', '入力者', 85),
      ];

  @override
  Widget build(BuildContext context) {
    final columns = _columns();
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('受注照会', style: Theme.of(context).textTheme.headlineSmall),
              const Spacer(),
              if (_canBulk)
                OutlinedButton(
                  onPressed: _selected.isEmpty || _selected.length > _bulkLimit
                      ? null
                      : _bulkCancel,
                  child: Text(_selected.isEmpty
                      ? 'まとめて取り消す（行を選んでください）'
                      : _selected.length > _bulkLimit
                          ? '1回に実行できるのは $_bulkLimit 件までです'
                          : 'まとめて取り消す（${_selected.length} 件）'),
                ),
              const SizedBox(width: 8),
              if (_canExport)
                FilledButton(onPressed: _exportCsv, child: const Text('CSV 出力')),
            ],
          ),
          const SizedBox(height: 12),
          _searchArea(),
          const SizedBox(height: 12),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          Expanded(child: _table(columns)),
          _pager(),
        ],
      ),
    );
  }

  Widget _searchArea() => Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          SizedBox(
            width: 200,
            child: TextField(
              controller: _orderNo,
              decoration: const InputDecoration(
                  labelText: '受注番号', border: OutlineInputBorder()),
            ),
          ),
          SizedBox(
            width: 240,
            child: DropdownButtonFormField<String?>(
              initialValue: _customerCode,
              isExpanded: true,
              decoration: const InputDecoration(
                  labelText: '取引先', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: null, child: Text('—')),
                for (final one in _customers)
                  DropdownMenuItem(
                    value: '${one['customerCode']}',
                    child: Text('${one['customerName']}',
                        overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (value) => setState(() => _customerCode = value),
            ),
          ),
          _dateRange('受注日', _orderDate, (value) => setState(() => _orderDate = value)),
          _dateRange('納期', _dueDate, (value) => setState(() => _dueDate = value)),
          SizedBox(
            width: 260,
            child: InputDecorator(
              decoration: const InputDecoration(
                  labelText: '受注状態', border: OutlineInputBorder()),
              child: Wrap(
                spacing: 4,
                children: [
                  for (final entry in orderStatusLabels.entries)
                    FilterChip(
                      label: Text(entry.value),
                      selected: _orderStatus.contains(entry.key),
                      onSelected: (on) => setState(() {
                        if (on) {
                          _orderStatus.add(entry.key);
                        } else {
                          _orderStatus.remove(entry.key);
                        }
                      }),
                    ),
                ],
              ),
            ),
          ),
          SizedBox(
            width: 220,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _totalFrom,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: '合計（以上）', border: OutlineInputBorder()),
                  ),
                ),
                const Text(' 〜 '),
                Expanded(
                  child: TextField(
                    controller: _totalTo,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: '以下', border: OutlineInputBorder()),
                  ),
                ),
              ],
            ),
          ),
          FilledButton.icon(
            onPressed: _loading
                ? null
                : () {
                    _page = 0;
                    _search();
                  },
            icon: const Icon(Icons.search),
            label: const Text('検索'),
          ),
        ],
      );

  Widget _dateRange(
    String label,
    DateTimeRange? value,
    ValueChanged<DateTimeRange?> onChanged,
  ) =>
      SizedBox(
        width: 230,
        child: InputDecorator(
          decoration:
              InputDecoration(labelText: label, border: const OutlineInputBorder()),
          child: Row(
            children: [
              Expanded(
                child: Text(value == null
                    ? '—'
                    : '${_ymd(value.start)} 〜 ${_ymd(value.end)}'),
              ),
              IconButton(
                icon: const Icon(Icons.date_range, size: 18),
                onPressed: () async {
                  final picked = await showDateRangePicker(
                    context: context,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2030),
                  );
                  if (picked != null) onChanged(picked);
                },
              ),
              if (value != null)
                IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () => onChanged(null),
                ),
            ],
          ),
        ),
      );

  Widget _table(List<_Column> columns) {
    if (_loading && _rows.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_rows.isEmpty) return const Center(child: Text('データがありません'));
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SingleChildScrollView(
        child: DataTable(
          showCheckboxColumn: _canBulk,
          sortColumnIndex: _sortField == null
              ? null
              : columns.indexWhere((one) => one.field == _sortField),
          sortAscending: _ascending,
          columns: [
            for (final one in columns)
              DataColumn(
                label: SizedBox(
                  width: one.width,
                  child: Text(one.label),
                ),
                numeric: one.numeric,
                onSort: one.sortable ? (_, __) => _sortBy(one.field) : null,
              ),
          ],
          rows: [
            for (final row in _rows)
              DataRow(
                selected: _selected.contains(row['orderNo']),
                onSelectChanged: _canBulk
                    ? (on) => setState(() {
                          final key = '${row['orderNo']}';
                          if (on == true) {
                            _selected.add(key);
                          } else {
                            _selected.remove(key);
                          }
                        })
                    : null,
                cells: [
                  for (final one in columns)
                    DataCell(
                      SizedBox(width: one.width, child: Text(one.text(row[one.field]))),
                      onTap: () => widget.onOpenDetail('${row['orderNo']}'),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _pager() => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(
          children: [
            Text('$_total 件'),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: _page == 0
                  ? null
                  : () {
                      setState(() => _page -= 1);
                      _search();
                    },
            ),
            Text('${_page + 1} / ${(_total / _pageSize).ceil().clamp(1, 9999)}'),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: (_page + 1) * _pageSize >= _total
                  ? null
                  : () {
                      setState(() => _page += 1);
                      _search();
                    },
            ),
            const SizedBox(width: 16),
            if (_rows.isNotEmpty)
              TextButton(
                onPressed: () => widget.onOpenEdit('${_rows.first['orderNo']}'),
                child: const Text('先頭の受注を修正'),
              ),
          ],
        ),
      );

  static String _ymd(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';
}

/// 一覧の列1つ。**hatake 版では定義に1行書くだけ**だった所。
class _Column {
  _Column(
    this.field,
    this.label,
    this.width, {
    this.numeric = false,
    this.sortable = false,
    String Function(Object?)? text,
  }) : _text = text;

  final String field;
  final String label;
  final double? width;
  final bool numeric;
  final bool sortable;
  final String Function(Object?)? _text;

  String text(Object? value) => _text?.call(value) ?? value?.toString() ?? '';
}
