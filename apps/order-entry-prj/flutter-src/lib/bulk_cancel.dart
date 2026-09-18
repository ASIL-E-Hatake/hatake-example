import 'dart:convert';

import 'package:hatake_material/hatake_material.dart';
import 'package:http/http.dart' as http;

import 'session.dart';

/// 定義が `plugin: bulkCancel` と言っている中身。
///
/// **定義に書けるのはここまで**: 選んだ行にまとめて実行する・確認を出す・1回の上限・
/// 終わったときと失敗したときの文言。何をするかはアプリの担当なので、ここで API を叩く
/// （案件の前書きで `where: plugin` と宣言してある）。
///
/// 返す [ActionOutcome] が大事で、**失敗した行を名指しで返す**と定義の
/// `onError: "... {failedKeys}"` がその名前で埋まる。名指ししないと、押した人は
/// 「何件か失敗した」までしか分からず、どれをやり直せばいいか分からない。
ActionHandler bulkCancel(String baseUrl, Session session) => (context) async {
      final keys = context.records
          .map((record) => record['orderNo'])
          .whereType<Object>()
          .toList();

      final response = await http.post(
        Uri.parse('$baseUrl/bulk/cancel'),
        headers: {
          'Content-Type': 'application/json',
          ..._bearer(session),
        },
        body: jsonEncode({'keys': keys}),
      );
      final body = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, Object?>;

      if (response.statusCode != 200) {
        // 上限を超えた・役割が足りない、など。**サーバが言った言葉をそのまま投げる**
        // （こちらで言い換えると、API を直接叩いた人と違う説明になる）。
        // 上限はサーバも**同じ定義から**出しているので、画面と同じ数字が返る。
        throw StateError(body['message']?.toString() ?? '取り消せませんでした');
      }

      final rejected = (body['rejected'] as List? ?? const []).whereType<Map>();
      // 全部通ったときは何も言わない＝枠組みが `onSuccess` を出す。
      if (rejected.isEmpty) return;

      // **失敗した行を名指しで**返すと、定義の `onError` の `{failedKeys}` が埋まる。
      // 「3件失敗しました」だけだと、押した人は全部やり直すしかない。
      context.report(ActionOutcome.rejected(
        succeeded: (body['succeeded'] as num? ?? 0).toInt(),
        rows: [
          for (final row in rejected)
            FailedRow(row['key'], reason: row['reason']?.toString()),
        ],
      ));
    };

/// ログインしている人の合言葉。`api.dart` の `authHeaders` は `hatake_http` に渡す形
/// （非同期で毎回聞く）なので、ここは素の Map で持つ。
Map<String, String> _bearer(Session session) =>
    session.token == null ? const {} : {'Authorization': 'Bearer ${session.token}'};
