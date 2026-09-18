import 'package:flutter/material.dart';

import 'api.dart';
import 'rules.dart';
import 'totals.dart';

/// 受注入力（フレームワーク**無し**版）。3ステップのウィザード＋親子明細。
///
/// hatake 版では定義に `type: wizard` と `steps` を書き、明細は
/// `type: subTable` に列と入力項目を並べるだけだった。計算も `computed` の3行。
/// この版で自分で持つことになったもの:
///
///   ・ステップの進み方と、**そのステップだけを検証する**仕掛け
///   ・明細のグリッド（行の追加・削除・行ごとの入力・行ごとのエラー表示）
///   ・商品を選んだら**単価と税率をマスタから引いてくる**所
///   ・金額・小計・消費税・合計の**再計算のタイミング**
///   ・サーバが返した項目ごとのエラーを、どの欄の下に出すかの対応
class OrderEntryPage extends StatefulWidget {
  const OrderEntryPage({
    super.key,
    required this.api,
    required this.onDone,
    this.orderNo,
  });

  final Api api;
  final String? orderNo;
  final VoidCallback onDone;

  @override
  State<OrderEntryPage> createState() => _OrderEntryPageState();
}

class _OrderEntryPageState extends State<OrderEntryPage> {
  final _salesPersonName = TextEditingController();
  final _deliveryPlace = TextEditingController();
  final _note = TextEditingController();
  String? _customerCode;
  String? _orderDate;
  String? _dueDate;
  String? _updatedAt;

  final _lines = <Map<String, Object?>>[];
  List<Map<String, Object?>> _customers = const [];
  List<Map<String, Object?>> _products = const [];

  int _step = 0;
  Errors _errors = const {};
  bool _busy = false;
  String? _message;

  bool get _editing => widget.orderNo != null;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _salesPersonName.dispose();
    _deliveryPlace.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final customers = await widget.api.list('customers', {});
      final products = await widget.api.list('products', {});
      if (!mounted) return;
      setState(() {
        _customers = customers.items;
        _products = products.items;
      });
      if (_editing) {
        final order = await widget.api.one('orders', widget.orderNo!);
        if (!mounted) return;
        setState(() {
          _customerCode = order['customerCode']?.toString();
          _orderDate = order['orderDate']?.toString();
          _dueDate = order['dueDate']?.toString();
          _salesPersonName.text = order['salesPersonName']?.toString() ?? '';
          _deliveryPlace.text = order['deliveryPlace']?.toString() ?? '';
          _note.text = order['note']?.toString() ?? '';
          _updatedAt = order['updatedAt']?.toString();
          _lines
            ..clear()
            ..addAll([
              for (final one in (order['lines'] as List? ?? const []))
                Map<String, Object?>.from(one as Map),
            ]);
        });
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _message = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Errors _checkHeader() => OrderRules.header(
        customerCode: _customerCode,
        orderDate: _orderDate,
        dueDate: _dueDate,
        salesPersonName: _salesPersonName.text,
        deliveryPlace: _deliveryPlace.text,
        note: _note.text,
      );

  /// 「次へ」は**そのステップの項目だけ**を見る。
  void _next() {
    final errors = _step == 0 ? _checkHeader() : OrderRules.lines(_lines);
    setState(() => _errors = errors);
    if (errors.isEmpty) setState(() => _step += 1);
  }

  Future<void> _save() async {
    // 保存の前に**全部**見る（ステップを飛ばして押されることがある）。
    final errors = {..._checkHeader(), ...OrderRules.lines(_lines)};
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;

    setState(() {
      _busy = true;
      _message = null;
    });
    final body = <String, Object?>{
      'customerCode': _customerCode,
      'orderDate': _orderDate,
      'dueDate': _dueDate,
      'salesPersonName': _salesPersonName.text,
      'deliveryPlace': _deliveryPlace.text,
      'note': _note.text,
      if (_updatedAt != null) 'updatedAt': _updatedAt,
      'lines': [
        for (final line in _lines)
          {
            'productCode': line['productCode'],
            'quantity': line['quantity'],
            'unitPrice': line['unitPrice'],
            'cancelled': line['cancelled'] ?? false,
          },
      ],
    };
    try {
      final saved = _editing
          ? await widget.api.update('orders', widget.orderNo!, body)
          : await widget.api.create('orders', body);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${saved['orderNo']} を保存しました')),
      );
      widget.onDone();
    } on ApiError catch (e) {
      if (!mounted) return;
      // サーバが項目ごとに返したものを、欄の下に出せる形に移す。
      setState(() {
        _errors = e.fieldErrors;
        _message = e.fieldErrors.isEmpty ? e.message : null;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Totals get _totals => totalsOf(_lines);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(_editing ? '受注入力（修正）' : '受注入力',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            _stepHeader(),
            const SizedBox(height: 12),
            if (_message != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(_message!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            Expanded(
              child: SingleChildScrollView(
                child: switch (_step) {
                  0 => _headerStep(),
                  1 => _linesStep(),
                  _ => _confirmStep(),
                },
              ),
            ),
            const Divider(),
            Row(
              children: [
                if (_step > 0)
                  OutlinedButton(
                    onPressed: _busy ? null : () => setState(() => _step -= 1),
                    child: const Text('戻る'),
                  ),
                const Spacer(),
                if (_step < 2)
                  FilledButton(
                    onPressed: _busy ? null : _next,
                    child: const Text('次へ'),
                  )
                else
                  FilledButton(
                    onPressed: _busy ? null : _save,
                    child: const Text('保存'),
                  ),
              ],
            ),
          ],
        ),
      );

  Widget _stepHeader() => Row(
        children: [
          for (final (index, title) in [
            (0, '1. 取引先と納期'),
            (1, '2. 明細'),
            (2, '3. 確認'),
          ])
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Text(
                title,
                style: TextStyle(
                  fontWeight: _step == index ? FontWeight.bold : FontWeight.normal,
                  color: _step == index
                      ? Theme.of(context).colorScheme.primary
                      : Theme.of(context).colorScheme.outline,
                ),
              ),
            ),
        ],
      );

  Widget _headerStep() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('まず誰からの注文かを入れてください。受注番号はサーバが採番します。'),
          const SizedBox(height: 16),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: [
              SizedBox(
                width: 320,
                child: DropdownButtonFormField<String?>(
                  initialValue: _customerCode,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: '取引先 *',
                    border: const OutlineInputBorder(),
                    errorText: _errors['customerCode'],
                  ),
                  items: [
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
              _dateField('受注日 *', _orderDate, 'orderDate',
                  (value) => setState(() => _orderDate = value)),
              _dateField('納期 *', _dueDate, 'dueDate',
                  (value) => setState(() => _dueDate = value)),
              _textField('担当 *', _salesPersonName, 'salesPersonName', width: 240),
              _textField('納入先', _deliveryPlace, 'deliveryPlace', width: 320),
              _textField('備考', _note, 'note', width: 480, lines: 3),
            ],
          ),
        ],
      );

  Widget _textField(
    String label,
    TextEditingController controller,
    String field, {
    double width = 240,
    int lines = 1,
  }) =>
      SizedBox(
        width: width,
        child: TextField(
          controller: controller,
          maxLines: lines,
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            errorText: _errors[field],
          ),
        ),
      );

  Widget _dateField(
    String label,
    String? value,
    String field,
    ValueChanged<String?> onChanged,
  ) =>
      SizedBox(
        width: 220,
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            errorText: _errors[field],
          ),
          child: Row(
            children: [
              Expanded(child: Text(value ?? '—')),
              IconButton(
                icon: const Icon(Icons.date_range, size: 18),
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: DateTime.tryParse(value ?? '') ?? DateTime(2026, 9, 15),
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2030),
                  );
                  if (picked != null) {
                    onChanged('${picked.year.toString().padLeft(4, '0')}-'
                        '${picked.month.toString().padLeft(2, '0')}-'
                        '${picked.day.toString().padLeft(2, '0')}');
                  }
                },
              ),
            ],
          ),
        ),
      );

  Widget _linesStep() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('商品と数量を入れてください。金額は自動で出ます。'),
          const SizedBox(height: 8),
          if (_errors['lines'] != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_errors['lines']!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          // 明細のグリッド。**行の追加・削除・行ごとの入力・行ごとのエラー**を自分で組む。
          for (var i = 0; i < _lines.length; i += 1) _lineRow(i),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => setState(() => _lines.add({'cancelled': false})),
            icon: const Icon(Icons.add),
            label: const Text('行を足す'),
          ),
          const SizedBox(height: 16),
          Text('小計 ${yen(_totals.subtotalAmount)}',
              style: Theme.of(context).textTheme.titleMedium),
        ],
      );

  Widget _lineRow(int index) {
    final line = _lines[index];
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 300,
            child: DropdownButtonFormField<String?>(
              initialValue: line["productCode"]?.toString(),
              isExpanded: true,
              decoration: InputDecoration(
                labelText: '商品 *',
                border: const OutlineInputBorder(),
                errorText: _errors['lines[$index].productCode'],
              ),
              items: [
                for (final one in _products)
                  DropdownMenuItem(
                    value: '${one['productCode']}',
                    child: Text('${one['productName']}',
                        overflow: TextOverflow.ellipsis),
                  ),
              ],
              // **商品を選んだら単価と税率をマスタから引く**。hatake 版ではサーバが
              // 当て直すので画面は気にしなくてよかったが、金額をその場で出すには要る。
              onChanged: (value) => setState(() {
                line['productCode'] = value;
                final product = _products.firstWhere(
                  (one) => one['productCode'] == value,
                  orElse: () => const {},
                );
                line['unitPrice'] = product['unitPrice'];
                line['taxRate'] = product['taxRate'];
              }),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 110,
            child: TextFormField(
              initialValue: line['quantity']?.toString() ?? '',
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: '数量 *',
                border: const OutlineInputBorder(),
                errorText: _errors['lines[$index].quantity'],
              ),
              onChanged: (value) =>
                  setState(() => line['quantity'] = int.tryParse(value)),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 110,
            child: InputDecorator(
              decoration: const InputDecoration(
                  labelText: '単価', border: OutlineInputBorder()),
              child: Text(yen(line['unitPrice'])),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 80,
            child: InputDecorator(
              decoration: const InputDecoration(
                  labelText: '税率', border: OutlineInputBorder()),
              child: Text(percent(line['taxRate'])),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 120,
            child: InputDecorator(
              decoration: const InputDecoration(
                  labelText: '金額', border: OutlineInputBorder()),
              child: Text(yen(amountOf(line))),
            ),
          ),
          const SizedBox(width: 8),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              children: [
                Checkbox(
                  value: line['cancelled'] == true,
                  onChanged: (on) => setState(() => line['cancelled'] = on ?? false),
                ),
                const Text('取消'),
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => setState(() => _lines.removeAt(index)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _confirmStep() {
    final totals = _totals;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('金額を確かめて保存してください。保存する値の正はサーバです。'),
        const SizedBox(height: 16),
        _summary('取引先', _customers
            .firstWhere((one) => one['customerCode'] == _customerCode,
                orElse: () => const {})['customerName']
            ?.toString() ??
            ''),
        _summary('受注日', _orderDate ?? ''),
        _summary('納期', _dueDate ?? ''),
        _summary('担当', _salesPersonName.text),
        const Divider(height: 32),
        _summary('明細行数', '${totals.lineCount}'),
        _summary('小計', yen(totals.subtotalAmount)),
        _summary('消費税', yen(totals.taxAmount)),
        _summary('合計', yen(totals.totalAmount), bold: true),
        const SizedBox(height: 8),
        _summary(
          '商品',
          _lines
              .where((one) => one['cancelled'] != true)
              .take(5)
              .map((one) => one['productCode'])
              .join('、'),
        ),
      ],
    );
  }

  Widget _summary(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            SizedBox(width: 120, child: Text(label)),
            Text(
              value,
              style: bold ? const TextStyle(fontWeight: FontWeight.bold) : null,
            ),
          ],
        ),
      );
}
