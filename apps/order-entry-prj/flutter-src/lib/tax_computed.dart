import 'package:hatake_core/hatake_core.dart';

/// 消費税の計算項目（`computed: { op: tax, ... }`）。
///
/// **なぜアプリが書くのか。** 組み込みの計算（`sum` / `product` …）には丸めが無い。
/// そして丸めは業務の決めごとなので、定義には書けない（案件の前書きで `rounding` の
/// 問いにこう答えてある＝「切り捨て。明細ごとには丸めず、伝票単位で1回だけ」）。
/// さらにこの案件は**軽減税率の商品が混ざる**ので、正確には「税率ごとに畳んで、
/// 税率ごとに1回だけ丸める」になる。
///
/// **でも計算そのものは書かない。** 枠組みが [computeInvoice] を持っていて、
/// これは適格請求書（インボイス）の数え方そのもの。Dart / TypeScript / Java の3版で
/// 同じ答えを出すことが共有フィクスチャで縛られているので、**画面の数字とサーバが
/// 保存する数字がずれない**（サーバ側は Java の `Tax.computeInvoice` を呼んでいる）。
///
/// 定義側の書き方:
///
/// ```yaml
/// computed:
///   op: tax
///   field: lines          # 畳む明細
///   of: amount            # 行の金額
///   rateField: taxRate    # 行の税率（伝票に1つではない）
///   rounding: floor       # 切り捨て
///   where: { field: cancelled, operator: notEquals, value: true }
/// ```
Object? taxOf(Map<String, Object?> computed, Map<String, Object?> record) {
  final rows = record[computed['field']?.toString() ?? 'lines'];
  if (rows is! List) return 0;

  final of = computed['of']?.toString() ?? 'amount';
  final rateField = computed['rateField']?.toString() ?? 'taxRate';
  final rounding = computed['rounding']?.toString() ?? 'floor';
  final where = computed['where'];

  final lines = <InvoiceLine>[];
  for (final row in rows) {
    if (row is! Map) continue;
    final line = <String, Object?>{for (final e in row.entries) '${e.key}': e.value};
    // 絞り方は定義の言葉そのまま（`visibleWhen` と同じ判定＝条件の書き方を2つ持たない）。
    if (where != null && rowsMatching([line], where).isEmpty) continue;
    lines.add(InvoiceLine(
      amount: _num(line[of]),
      rate: _num(line[rateField]),
    ));
  }
  if (lines.isEmpty) return 0;
  return computeInvoice(lines, rounding: rounding).total.tax;
}

num _num(Object? value) {
  if (value is num) return value;
  if (value is String) return num.tryParse(value.trim()) ?? 0;
  return 0;
}
