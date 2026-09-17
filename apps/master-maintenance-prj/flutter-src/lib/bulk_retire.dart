import 'dart:convert';

import 'package:hatake_material/hatake_material.dart';
import 'package:http/http.dart' as http;

import 'session.dart';

/// 「まとめて退職にする」（定義の `plugin: bulkRetire`）。
///
/// 定義に書いてあるのは**そこまで**:
///   ・選んだ行に対して実行する（`scope: selection`）
///   ・1回 50 件まで（hr は 20 件）
///   ・押す前に確認する。文言は `confirm.message`
///   ・終わったあとの文言は `onSuccess` / `onError`
///
/// **中身はアプリ側**（前書きで `where: plugin` と宣言してある）。ここがやるのは
/// 「API を1回叩いて、結果を枠組みに報告する」だけ。
///
/// 報告の仕方が肝で、`ActionOutcome.rejected` に**失敗した行を名指しで**渡すと、
/// 定義の `onError` に書いた `{failedKeys}` がそこで埋まる（押した人が、どの行を
/// もう一度見ればいいか分かる）。
ActionHandler bulkRetire(String baseUrl, Session session) => (ctx) async {
      final keys = [
        for (final row in ctx.records)
          if (row['employeeNo'] != null) row['employeeNo'].toString(),
      ];

      final response = await http.post(
        Uri.parse('$baseUrl/bulk/retire'),
        headers: {
          'content-type': 'application/json',
          if (session.token != null) 'authorization': 'Bearer ${session.token}',
        },
        body: jsonEncode({'keys': keys}),
      );

      final body = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, Object?>;
      if (response.statusCode != 200) {
        // 上限超えなどはサーバが**定義から出した文**で返してくる（画面と同じ数字）。
        throw StateError(body['message']?.toString() ?? '処理できませんでした');
      }

      final rejected = (body['rejected'] as List? ?? const []).cast<Map<String, Object?>>();
      if (rejected.isEmpty) return;

      ctx.report(ActionOutcome.rejected(
        succeeded: (body['succeeded'] as num? ?? 0).toInt(),
        rows: [
          for (final one in rejected)
            FailedRow(one['key'], reason: one['reason']?.toString()),
        ],
      ));
    };
