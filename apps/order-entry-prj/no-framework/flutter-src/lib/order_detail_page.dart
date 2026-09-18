import 'package:flutter/material.dart';

import 'api.dart';
import 'session.dart';
import 'totals.dart';

/// 受注詳細（フレームワーク**無し**版）。読み取りだけ。
///
/// hatake 版では `type: detail` に枠と項目を並べるだけ（明細のグリッドも
/// `type: subTable` を1つ書くだけ）。この版は枠も行もラベルも書式も自分で置く。
///
/// **役割で隠す項目**（入力者・最終更新）も、ここで手で分ける ──
/// API 側の `ColumnRoles` と同じことをもう一度書いている。
class OrderDetailPage extends StatefulWidget {
  const OrderDetailPage({
    super.key,
    required this.api,
    required this.session,
    required this.orderNo,
    required this.onBack,
  });

  final Api api;
  final Session session;
  final String orderNo;
  final VoidCallback onBack;

  @override
  State<OrderDetailPage> createState() => _OrderDetailPageState();
}

class _OrderDetailPageState extends State<OrderDetailPage> {
  Map<String, Object?>? _order;
  String? _error;

  bool get _canSeeHistory =>
      widget.session.roles.any({'clerk', 'manager'}.contains);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final found = await widget.api.one('orders', widget.orderNo);
      if (mounted) setState(() => _order = found);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(child: Text(_error!));
    }
    final order = _order;
    if (order == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final lines = [
      for (final one in (order['lines'] as List? ?? const []))
        Map<String, Object?>.from(one as Map),
    ];

    return Padding(
      padding: const EdgeInsets.all(16),
      child: ListView(
        children: [
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: widget.onBack,
              ),
              Text('受注詳細', style: Theme.of(context).textTheme.headlineSmall),
            ],
          ),
          const SizedBox(height: 16),
          _section('受注情報', [
            _row('受注番号', order['orderNo']),
            _row('取引先', order['customerName']),
            _row('受注日', order['orderDate']),
            _row('納期', order['dueDate']),
            _row('受注状態', orderStatusLabel(order['orderStatus'])),
            _row('担当', order['salesPersonName']),
            _row('納入先', order['deliveryPlace']),
            _row('備考', order['note']),
          ]),
          const SizedBox(height: 16),
          _section('明細', [_lineTable(lines)]),
          const SizedBox(height: 16),
          _section('金額', [
            _row('小計', yen(order['subtotalAmount'])),
            _row('消費税', yen(order['taxAmount'])),
            _row('合計', yen(order['totalAmount'])),
          ]),
          if (_canSeeHistory) ...[
            const SizedBox(height: 16),
            _section('履歴', [
              _row('入力者', order['createdBy']),
              _row('最終更新', order['updatedAt']),
            ]),
          ],
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> children) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              ...children,
            ],
          ),
        ),
      );

  Widget _row(String label, Object? value) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 140,
              child: Text(label,
                  style: TextStyle(color: Theme.of(context).colorScheme.outline)),
            ),
            Expanded(child: Text('${value ?? ''}')),
          ],
        ),
      );

  Widget _lineTable(List<Map<String, Object?>> lines) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          columns: const [
            DataColumn(label: Text('商品コード')),
            DataColumn(label: Text('商品名')),
            DataColumn(label: Text('数量'), numeric: true),
            DataColumn(label: Text('単価'), numeric: true),
            DataColumn(label: Text('税率'), numeric: true),
            DataColumn(label: Text('金額'), numeric: true),
            DataColumn(label: Text('取消')),
          ],
          rows: [
            for (final line in lines)
              DataRow(cells: [
                DataCell(Text('${line['productCode'] ?? ''}')),
                DataCell(Text('${line['productName'] ?? ''}')),
                DataCell(Text('${line['quantity'] ?? ''}')),
                DataCell(Text(yen(line['unitPrice']))),
                DataCell(Text(percent(line['taxRate']))),
                DataCell(Text(yen(line['amount']))),
                DataCell(Icon(
                  line['cancelled'] == true
                      ? Icons.check_box
                      : Icons.check_box_outline_blank,
                  size: 18,
                )),
              ]),
          ],
        ),
      );
}
