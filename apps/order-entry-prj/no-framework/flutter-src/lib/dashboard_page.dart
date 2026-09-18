import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'totals.dart';

/// 受注ダッシュボード（フレームワーク**無し**版）。
///
/// hatake 版ではカードを7枚並べるのに定義を7ブロック書くだけで、
/// **集計も畳み込みもグラフも枠組みがやった**（`value: { aggregate: sum, field: … }`、
/// `chart: { kind: bar, labelField: …, valueField: …, aggregate: sum }`）。
///
/// この版で自分で書くことになったもの:
///   ・カードの並べ方（幅・段組み）
///   ・**集計**（件数・合計・平均・条件つきの件数）
///   ・**ラベルで畳む**所（取引先別・日別）と、その並べ替え
///   ・グラフの見た目（目盛り・ラベルの向き・値の表示）
///   ・「直近の受注」の一覧（列も書式も）
class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.api, required this.onOpenOrders});

  final Api api;
  final VoidCallback onOpenOrders;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  List<Map<String, Object?>> _orders = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      // カードごとに引くと同じものを7回取りに行くので、1回引いて画面側で畳む。
      // （hatake 版はカードごとに条件を書けて、枠組みがまとめてくれる所。）
      final found = await widget.api.list('orders', {
        'pageSize': ['1000'],
        'sortField': ['orderDate'],
        'sortAscending': ['true'],
      });
      if (mounted) setState(() => _orders = found.items);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int get _count => _orders.length;

  int get _sum => _orders.fold(0, (total, one) => total + _int(one['totalAmount']));

  int get _average => _orders.isEmpty ? 0 : (_sum / _orders.length).round();

  int get _cancelled =>
      _orders.where((one) => one['orderStatus'] == 'cancelled').length;

  /// ラベルで畳む（取引先別）。**並べ替えも自分でやる**。
  List<({String label, int value})> get _byCustomer {
    final sums = <String, int>{};
    for (final one in _orders) {
      final label = '${one['customerName'] ?? ''}';
      sums[label] = (sums[label] ?? 0) + _int(one['totalAmount']);
    }
    return [for (final e in sums.entries) (label: e.key, value: e.value)];
  }

  /// 日別（受注日で畳む。並びは日付順）。
  List<({String label, int value})> get _byDay {
    final sums = <String, int>{};
    for (final one in _orders) {
      final label = '${one['orderDate'] ?? ''}';
      sums[label] = (sums[label] ?? 0) + _int(one['totalAmount']);
    }
    final keys = sums.keys.toList()..sort();
    return [for (final key in keys) (label: key, value: sums[key]!)];
  }

  /// 直近の受注5件（受注日の降順）。
  List<Map<String, Object?>> get _recent {
    final rows = [..._orders]..sort((a, b) =>
        '${b['orderDate']}'.compareTo('${a['orderDate']}'));
    return rows.take(5).toList();
  }

  static int _int(Object? value) =>
      value is num ? value.toInt() : int.tryParse('${value ?? ''}') ?? 0;

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text(_error!));

    return Padding(
      padding: const EdgeInsets.all(16),
      child: ListView(
        children: [
          Row(
            children: [
              Text('受注ダッシュボード',
                  style: Theme.of(context).textTheme.headlineSmall),
              const Spacer(),
              FilledButton(
                onPressed: widget.onOpenOrders,
                child: const Text('受注照会'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _metric('受注件数', '$_count'),
              _metric('受注金額', yen(_sum)),
              _metric('平均受注額', yen(_average)),
              _metric('取消', '$_cancelled'),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 260,
            child: Row(
              children: [
                Expanded(child: _barCard('取引先別の受注金額', _byCustomer)),
                const SizedBox(width: 12),
                Expanded(child: _lineCard('日別の受注金額', _byDay)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _recentCard(),
        ],
      ),
    );
  }

  Widget _metric(String title, String value) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.outline)),
                const SizedBox(height: 8),
                Text(value, style: Theme.of(context).textTheme.headlineSmall),
              ],
            ),
          ),
        ),
      );

  Widget _barCard(String title, List<({String label, int value})> points) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              const SizedBox(height: 12),
              Expanded(
                child: BarChart(
                  BarChartData(
                    barGroups: [
                      for (var i = 0; i < points.length; i += 1)
                        BarChartGroupData(x: i, barRods: [
                          BarChartRodData(
                            toY: points[i].value.toDouble(),
                            color: Theme.of(context).colorScheme.primary,
                            width: 18,
                          ),
                        ]),
                    ],
                    titlesData: FlTitlesData(
                      leftTitles: const AxisTitles(),
                      topTitles: const AxisTitles(),
                      rightTitles: const AxisTitles(),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 44,
                          getTitlesWidget: (value, _) {
                            final at = value.toInt();
                            if (at < 0 || at >= points.length) {
                              return const SizedBox.shrink();
                            }
                            return Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                points[at].label,
                                style: const TextStyle(fontSize: 9),
                                maxLines: 2,
                                textAlign: TextAlign.center,
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    gridData: const FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  Widget _lineCard(String title, List<({String label, int value})> points) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              const SizedBox(height: 12),
              Expanded(
                child: LineChart(
                  LineChartData(
                    lineBarsData: [
                      LineChartBarData(
                        spots: [
                          for (var i = 0; i < points.length; i += 1)
                            FlSpot(i.toDouble(), points[i].value.toDouble()),
                        ],
                        color: Theme.of(context).colorScheme.primary,
                        barWidth: 2,
                      ),
                    ],
                    titlesData: FlTitlesData(
                      leftTitles: const AxisTitles(),
                      topTitles: const AxisTitles(),
                      rightTitles: const AxisTitles(),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 32,
                          interval: 1,
                          getTitlesWidget: (value, _) {
                            final at = value.toInt();
                            if (at < 0 || at >= points.length) {
                              return const SizedBox.shrink();
                            }
                            return Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(points[at].label,
                                  style: const TextStyle(fontSize: 8)),
                            );
                          },
                        ),
                      ),
                    ),
                    gridData: const FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  Widget _recentCard() => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('直近の受注',
                  style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              const SizedBox(height: 8),
              DataTable(
                columns: const [
                  DataColumn(label: Text('受注番号')),
                  DataColumn(label: Text('取引先')),
                  DataColumn(label: Text('受注日')),
                  DataColumn(label: Text('受注状態')),
                  DataColumn(label: Text('合計'), numeric: true),
                ],
                rows: [
                  for (final row in _recent)
                    DataRow(cells: [
                      DataCell(Text('${row['orderNo']}')),
                      DataCell(Text('${row['customerName']}')),
                      DataCell(Text('${row['orderDate']}')),
                      // **コードを名前にするのも画面の担当**（サーバはコードで返す）。
                      DataCell(Text(orderStatusLabel(row['orderStatus']))),
                      DataCell(Text(yen(row['totalAmount']))),
                    ]),
                ],
              ),
            ],
          ),
        ),
      );
}
