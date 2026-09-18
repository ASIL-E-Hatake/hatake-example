/// 入力の規則（フレームワーク**無し**版）。
///
/// **ここが二重書きの本体。** 同じ規則が API 側の
/// `no-framework/java-src/.../form/OrderRequest.java` と
/// `.../form/CrossFieldRules.java` にも書いてある。どちらかを直したとき、
/// **もう片方を直し忘れても何も言われない**（画面は通るのにサーバが弾く、
/// またはその逆になる。しかも気づくのは使う人）。
///
/// hatake 版ではこのファイルが丸ごと無い。規則は定義 YAML に1回だけ書いてあり、
/// 画面もサーバも同じその1枚を読む。
library;

/// 1件ぶんの失敗（項目名 → 文言）。項目名はサーバと同じ字にしておく
/// （`lines[0].quantity` のような道まで合わせないと、欄の下に出せない）。
typedef Errors = Map<String, String>;

class OrderRules {
  const OrderRules._();

  static const int maxSalesPersonName = 20;
  static const int maxDeliveryPlace = 60;
  static const int maxNote = 200;
  static const int minQuantity = 1;
  static const int maxQuantity = 9999;

  /// ヘッダ（ステップ1）の規則。
  static Errors header({
    required String? customerCode,
    required String? orderDate,
    required String? dueDate,
    required String? salesPersonName,
    required String? deliveryPlace,
    required String? note,
  }) {
    final errors = <String, String>{};
    if (_blank(customerCode)) errors['customerCode'] = '必須項目です';
    if (_blank(orderDate)) errors['orderDate'] = '必須項目です';
    if (_blank(dueDate)) errors['dueDate'] = '必須項目です';
    if (_blank(salesPersonName)) {
      errors['salesPersonName'] = '必須項目です';
    } else if (salesPersonName!.length > maxSalesPersonName) {
      errors['salesPersonName'] = '$maxSalesPersonName文字以内で入力してください';
    }
    if (!_blank(deliveryPlace) && deliveryPlace!.length > maxDeliveryPlace) {
      errors['deliveryPlace'] = '$maxDeliveryPlace文字以内で入力してください';
    }
    if (!_blank(note) && note!.length > maxNote) {
      errors['note'] = '$maxNote文字以内で入力してください';
    }
    // 項目をまたぐ規則（納期 ≧ 受注日）。どちらも `yyyy-MM-dd` なので字のまま比べられる。
    if (!_blank(orderDate) && !_blank(dueDate) && dueDate!.compareTo(orderDate!) < 0) {
      errors['dueDate'] = '納期は受注日以降にしてください';
    }
    return errors;
  }

  /// 明細（ステップ2）の規則。行の中と、行をまたぐものの両方。
  static Errors lines(List<Map<String, Object?>> rows) {
    final errors = <String, String>{};
    if (rows.isEmpty) {
      errors['lines'] = '必須項目です';
      return errors;
    }
    final seen = <String>{};
    for (var i = 0; i < rows.length; i += 1) {
      final row = rows[i];
      final code = (row['productCode'] ?? '').toString();
      if (code.isEmpty) {
        errors['lines[$i].productCode'] = '必須項目です';
      } else if (!seen.add(code)) {
        // 行をまたぐ規則。**何行あっても1件だけ言う**（サーバと同じふるまい）。
        errors['lines'] = '同じ商品が複数行にあります';
      }
      final quantity = _int(row['quantity']);
      if (quantity == null) {
        errors['lines[$i].quantity'] = '必須項目です';
      } else if (quantity < minQuantity) {
        errors['lines[$i].quantity'] = '数量は$minQuantity以上にしてください';
      } else if (quantity > maxQuantity) {
        errors['lines[$i].quantity'] = '$maxQuantity以下で入力してください';
      }
      final unitPrice = _int(row['unitPrice']);
      if (unitPrice == null) {
        errors['lines[$i].unitPrice'] = '必須項目です';
      } else if (unitPrice < 0) {
        errors['lines[$i].unitPrice'] = '0以上で入力してください';
      }
    }
    return errors;
  }

  static bool _blank(String? value) => value == null || value.trim().isEmpty;

  static int? _int(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value.trim());
    return null;
  }
}
