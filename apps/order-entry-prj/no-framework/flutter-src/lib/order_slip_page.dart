import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'totals.dart';

/// 注文請書（帳票）— フレームワーク**無し**版。
///
/// hatake 版では `type: report` に紙の作りを書くだけだった:
///
/// ```yaml
/// report:
///   paper: { size: A4, orientation: portrait }
///   rowsPerPage: 30
///   sort: { field: orderNo }
///   groupBy: [{ field: orderNo, label: 受注番号, pageBreak: true }]
///   totals: [{ field: amount, aggregate: sum }, { field: amount, aggregate: count }]
/// ```
///
/// これだけで、**コントロールブレイク（受注が変わったら小計を出して改ページ）**も
/// 明細の列も CSV も PDF も出た。この版で自分で書くのは:
///
///   ・出力条件の欄
///   ・並べ替えた行を**受注番号で区切って**小計を差し込む所
///   ・小計・総計の集計
///   ・CSV の組み立て
///
/// **PDF は作っていません。** 紙の組版（用紙の大きさ・1枚に載る行数・改ページ・
/// 日本語フォントの埋め込み）を自分で書くのは、この比較の中では割に合わないと
/// 判断しました ── これ自体が測定結果の一部です
/// （hatake 版は `hatake_print` を入れて `reportPdf(...)` を1回呼ぶだけ）。
class OrderSlipPage extends StatefulWidget {
  const OrderSlipPage({super.key, required this.api});

  final Api api;

  @override
  State<OrderSlipPage> createState() => _OrderSlipPageState();
}

class _OrderSlipPageState extends State<OrderSlipPage> {
  static const _rowsPerPage = 30;

  final _orderNo = TextEditingController();
  List<Map<String, Object?>> _lines = const [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _search();
  }

  @override
  void dispose() {
    _orderNo.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final found = await widget.api.list('order-lines', {
        if (_orderNo.text.trim().isNotEmpty) 'orderNo': [_orderNo.text.trim()],
        'pageSize': ['200'],
      });
      if (mounted) setState(() => _lines = found.items);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// 明細を受注番号で区切って、小計の行を差し込む（コントロールブレイク）。
  ///
  /// **並んでいることが前提**なので、サーバが並べて返してくれている必要がある
  /// （並んでいないと小計が壊れる ── hatake 版も同じ前提だが、区切る所は枠組みが持つ）。
  List<_Block> get _blocks {
    final blocks = <_Block>[];
    String? current;
    var sum = 0;
    var count = 0;
    for (final line in _lines) {
      final orderNo = '${line['orderNo']}';
      if (orderNo != current) {
        if (current != null) {
          blocks.add(_Block.subtotal(current, sum, count));
        }
        blocks.add(_Block.header(orderNo, line));
        current = orderNo;
        sum = 0;
        count = 0;
      }
      blocks.add(_Block.detail(line));
      sum += _int(line['amount']);
      count += 1;
    }
    if (current != null) blocks.add(_Block.subtotal(current, sum, count));
    return blocks;
  }

  static int _int(Object? value) =>
      value is num ? value.toInt() : int.tryParse('${value ?? ''}') ?? 0;

  Future<void> _exportCsv() async {
    final buffer = StringBuffer()
      ..writeln('受注番号,受注日,取引先,商品コード,商品名,数量,単価,税率,金額');
    for (final line in _lines) {
      buffer.writeln([
        line['orderNo'],
        line['orderDate'],
        line['customerName'],
        line['productCode'],
        line['productName'],
        line['quantity'],
        line['unitPrice'],
        line['taxRate'],
        line['amount'],
      ].map((one) => _csv('${one ?? ''}')).join(','));
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('注文請書.csv'),
        content: SizedBox(
          width: 560,
          height: 320,
          child: SingleChildScrollView(child: SelectableText(buffer.toString())),
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

  @override
  Widget build(BuildContext context) {
    final blocks = _blocks;
    final pages = (blocks.length / _rowsPerPage).ceil().clamp(1, 9999);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('注文請書', style: Theme.of(context).textTheme.headlineSmall),
              const Spacer(),
              FilledButton(onPressed: _exportCsv, child: const Text('CSV 出力')),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('PDF はこの版では作っていません（README を参照）'),
                  ),
                ),
                child: const Text('印刷'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              SizedBox(
                width: 260,
                child: TextField(
                  controller: _orderNo,
                  decoration: const InputDecoration(
                      labelText: '受注番号', border: OutlineInputBorder()),
                ),
              ),
              const SizedBox(width: 12),
              FilledButton.icon(
                onPressed: _loading ? null : _search,
                icon: const Icon(Icons.search),
                label: const Text('検索'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_error != null)
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          Expanded(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Text('注文請書',
                            style: Theme.of(context).textTheme.titleMedium),
                        const Spacer(),
                        Text('1 / $pages'),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _heading(),
                    const Divider(),
                    Expanded(
                      child: ListView(
                        children: [for (final block in blocks) _line(block)],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _heading() => DefaultTextStyle(
        style: TextStyle(
            fontSize: 12, color: Theme.of(context).colorScheme.outline),
        child: const Row(
          children: [
            SizedBox(width: 90, child: Text('商品コード')),
            SizedBox(width: 200, child: Text('商品名')),
            SizedBox(width: 60, child: Text('数量', textAlign: TextAlign.right)),
            SizedBox(width: 90, child: Text('単価', textAlign: TextAlign.right)),
            SizedBox(width: 60, child: Text('税率', textAlign: TextAlign.right)),
            SizedBox(width: 100, child: Text('金額', textAlign: TextAlign.right)),
          ],
        ),
      );

  Widget _line(_Block block) => switch (block.kind) {
        _BlockKind.header => Container(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            child: Text(
              '受注番号: ${block.orderNo}'
              '　取引先: ${block.row?['customerName'] ?? ''}'
              '　受注日: ${block.row?['orderDate'] ?? ''}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        _BlockKind.detail => Padding(
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
            child: Row(
              children: [
                SizedBox(width: 90, child: Text('${block.row!['productCode']}')),
                SizedBox(width: 200, child: Text('${block.row!['productName']}')),
                SizedBox(
                    width: 60,
                    child: Text('${block.row!['quantity']}',
                        textAlign: TextAlign.right)),
                SizedBox(
                    width: 90,
                    child: Text(yen(block.row!['unitPrice']),
                        textAlign: TextAlign.right)),
                SizedBox(
                    width: 60,
                    child: Text(percent(block.row!['taxRate']),
                        textAlign: TextAlign.right)),
                SizedBox(
                    width: 100,
                    child:
                        Text(yen(block.row!['amount']), textAlign: TextAlign.right)),
              ],
            ),
          ),
        _BlockKind.subtotal => Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            child: Row(
              children: [
                const SizedBox(width: 350, child: Text('小計')),
                SizedBox(
                  width: 250,
                  child: Text(
                    '${yen(block.sum)} / ${block.count} 件',
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
      };
}

enum _BlockKind { header, detail, subtotal }

/// 紙に刷る1行（見出し / 明細 / 小計）。**hatake 版では枠組みが作る**もの。
class _Block {
  const _Block(this.kind, {this.orderNo, this.row, this.sum = 0, this.count = 0});

  factory _Block.header(String orderNo, Map<String, Object?> row) =>
      _Block(_BlockKind.header, orderNo: orderNo, row: row);

  factory _Block.detail(Map<String, Object?> row) =>
      _Block(_BlockKind.detail, row: row);

  factory _Block.subtotal(String orderNo, int sum, int count) =>
      _Block(_BlockKind.subtotal, orderNo: orderNo, sum: sum, count: count);

  final _BlockKind kind;
  final String? orderNo;
  final Map<String, Object?>? row;
  final int sum;
  final int count;
}
