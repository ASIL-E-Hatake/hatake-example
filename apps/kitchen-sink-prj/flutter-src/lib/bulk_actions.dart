import 'dart:convert';

import 'package:hatake_material/hatake_material.dart';
import 'package:http/http.dart' as http;

/// 定義が `plugin: reprice` / `plugin: archive` と言っている中身。
///
/// 網羅アプリなので業務は持ちません。**確かめたいのは渡され方**です:
///
/// | 定義に書いたもの | ここに届くもの |
/// |---|---|
/// | `prompt.fields` | `context.input`（押す前に聞いた値） |
/// | `scope: selection` | `context.records`（選んだ行） |
/// | `batchSize` | **区切って何度も呼ばれる**（1回ぶんずつ届く） |
/// | `onError` の `{failedKeys}` | `ActionOutcome.rejected(rows:)` に入れた行 |
///
/// `batchSize` が効いているかは、**呼ばれた回数**で分かります。区切りが効いていれば
/// 12件を選んで（区切り5で）3回呼ばれ、効いていなければ1回で全部届きます。
/// 数えて画面に出すために、呼ばれた回数をここで持っています。
ActionHandler bulkAction(String baseUrl, String path, {required BatchCounter counter}) =>
    (context) async {
      counter.calls += 1;
      counter.rows += context.records.length;

      final keys = [
        for (final row in context.records)
          if (row['itemCode'] != null) row['itemCode'].toString(),
      ];
      final response = await http.post(
        Uri.parse('$baseUrl/bulk/$path'),
        headers: const {'content-type': 'application/json'},
        body: jsonEncode({
          'keys': keys,
          // 押す前に聞いた値。`prompt` を書いていないボタンでは空。
          'input': context.input,
        }),
      );
      final body = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, Object?>;
      if (response.statusCode != 200) {
        throw StateError(body['message']?.toString() ?? '処理できませんでした');
      }

      final rejected = (body['rejected'] as List? ?? const []).whereType<Map>();
      if (rejected.isEmpty) return;

      // **失敗した行を名指しで**返すと、定義の `onError` の `{failedKeys}` が埋まる。
      context.report(ActionOutcome.rejected(
        succeeded: (body['succeeded'] as num? ?? 0).toInt(),
        rows: [
          for (final row in rejected)
            FailedRow(row['key'], reason: row['reason']?.toString()),
        ],
      ));
    };

/// 区切って呼ばれた回数（`batchSize` が効いているかを見るため）。
class BatchCounter {
  int calls = 0;
  int rows = 0;

  String get summary => calls == 0 ? 'まだ押していません' : '$calls 回に分けて $rows 行';

  void reset() {
    calls = 0;
    rows = 0;
  }
}

/// 定義が `plugin: saveItem` と言っている中身（モックなので投げるだけ）。
ActionHandler saveItem(String baseUrl) => (context) async {
      final record = context.record ?? const <String, Object?>{};
      final key = record['itemCode']?.toString();
      final url = Uri.parse(key == null ? '$baseUrl/items' : '$baseUrl/items/$key');
      final response = await http.post(
        url,
        headers: const {'content-type': 'application/json'},
        body: jsonEncode(record),
      );
      if (response.statusCode >= 400) {
        final body = jsonDecode(utf8.decode(response.bodyBytes));
        throw StateError(
          body is Map && body['message'] != null
              ? '${body['message']}'
              : '保存できませんでした（${response.statusCode}）',
        );
      }
    };
