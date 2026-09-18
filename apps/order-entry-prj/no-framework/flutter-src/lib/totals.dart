/// 金額の計算（フレームワーク**無し**版）。
///
/// **ここも二重書き。** 同じ数え方が API 側の
/// `no-framework/java-src/.../OrderTotals.java` にも書いてある。
/// 2つが同じ答えを出すことは、誰も保証してくれない
/// （hatake 版は枠組みの `computeInvoice` を両方から呼ぶので、3版で同じ答えになる
/// ことが共有フィクスチャで縛られていた）。
///
/// 数え方（適格請求書）:
///   1. 税率ごとに金額を畳む
///   2. 税率ごとに**1回だけ**切り捨てる（明細ごとに丸めると請求書と1円ずれる）
///   3. 丸めた税額を足す
library;

class Totals {
  const Totals({
    required this.subtotalAmount,
    required this.taxAmount,
    required this.totalAmount,
    required this.lineCount,
  });

  final int subtotalAmount;
  final int taxAmount;
  final int totalAmount;
  final int lineCount;

  static const empty = Totals(
    subtotalAmount: 0,
    taxAmount: 0,
    totalAmount: 0,
    lineCount: 0,
  );
}

/// 明細1行の金額 = 数量 × 単価。
int amountOf(Map<String, Object?> line) =>
    (_num(line['quantity']) * _num(line['unitPrice'])).round();

/// 取り消した行は数えない（絞らないと業務の合計にならない）。
Totals totalsOf(List<Map<String, Object?>> lines) {
  // 税率 → その税率ぶんの金額。並び順を保つ（同じ入力なら同じ答えにする）。
  final byRate = <num, int>{};
  var subtotal = 0;
  var count = 0;

  for (final line in lines) {
    if (line['cancelled'] == true) continue;
    final amount = amountOf(line);
    final rate = _num(line['taxRate']);
    subtotal += amount;
    count += 1;
    byRate[rate] = (byRate[rate] ?? 0) + amount;
  }

  var tax = 0;
  byRate.forEach((rate, amount) {
    tax += (amount * rate).floor();
  });
  return Totals(
    subtotalAmount: subtotal,
    taxAmount: tax,
    totalAmount: subtotal + tax,
    lineCount: count,
  );
}

num _num(Object? value) {
  if (value is num) return value;
  if (value is String) return num.tryParse(value.trim()) ?? 0;
  return 0;
}

/// 金額の見せ方（`¥1,234`）。**hatake 版では `format: currency` の1語**だった所。
String yen(Object? value) {
  final n = _num(value).round();
  final digits = n.abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return '${n < 0 ? '-' : ''}¥$buffer';
}

/// 税率の見せ方（`10%`）。
String percent(Object? value) => '${(_num(value) * 100).round()}%';

/// 受注状態のコード → 業務の言葉。**API 側の表と同じものを持つ**
/// （サーバはコードで返すので、名前にするのは画面の担当）。
const orderStatusLabels = <String, String>{
  'draft': '入力中',
  'confirmed': '確定',
  'shipped': '出荷済',
  'cancelled': '取消',
};

String orderStatusLabel(Object? code) =>
    orderStatusLabels[code?.toString()] ?? code?.toString() ?? '';
