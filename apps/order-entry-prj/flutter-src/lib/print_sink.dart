import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_print/hatake_print.dart';

/// `type: print` のボタンが作った帳票を、どこへ出すか。
///
/// **枠組みが渡すのは「紙の中身」まで**（この定義と、いま画面に出ている行）。
/// そこから PDF のバイト列にするのは opt-in の `hatake_print`、それをプリンタや
/// ファイルに送るのはアプリの担当 ── だから帳票の無い案件は印刷のコードを1行も
/// 持たない（1本目がまさにそう）。
///
/// 見本なので、枚数と大きさを出して Base64 をコピーさせている。実案件では
/// ブラウザに落とす／プリンタに送る／保管庫に置く、のどれかになる。
PrintSink showPrintPreview(GlobalKey<NavigatorState> navigatorKey) =>
    (request) async {
      // ここが1行。**列も見出しも改ページも小計も定義から決まっている**ので、
      // 紙の作り方をアプリが書くことは無い。
      final bytes = reportPdf(
        request.page,
        request.rows,
        formatters: request.formatters,
        // 役割で隠した列は**紙にも出さない**（画面と紙で見えるものを変えない）。
        roles: request.roles,
      );

      final context = navigatorKey.currentContext;
      if (context == null) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(request.filename),
          content: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${request.rows.length} 行 / ${bytes.length} バイトの PDF を作りました。'),
                const SizedBox(height: 8),
                const Text(
                  '見本なので画面には出さず、中身をコピーできるようにしてあります。'
                  '実案件ではここでブラウザに落とすか、プリンタに送ります。',
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Clipboard.setData(
                ClipboardData(text: base64Encode(bytes)),
              ),
              child: const Text('Base64 をコピー'),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('閉じる'),
            ),
          ],
        ),
      );
    };
