import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hatake_material/hatake_material.dart';

/// `type: export` のボタンが作った CSV を、どこへ出すか。
///
/// **枠組みが持つのは CSV を組むところまで**（列も見出しも順番も定義から決まる）。
/// 利用者に届けるのはアプリの仕事なので、ここで受ける。
///
/// 見本なのでダイアログに出してコピーさせている。実案件ではブラウザに落とす／
/// 共有フォルダに置く／メールで送る、のどれかになる ── **どれにするかは業務の
/// 決めごと**で、枠組みが決めることではない（だから口だけが開いている）。
ExportSink showCsvDialog(GlobalKey<NavigatorState> navigatorKey) => (request) async {
      final context = navigatorKey.currentContext;
      if (context == null) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(request.filename),
          content: SizedBox(
            width: 640,
            child: SingleChildScrollView(
              child: SelectableText(
                request.text,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: request.text));
                if (dialogContext.mounted) Navigator.of(dialogContext).pop();
              },
              child: const Text('コピーする'),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('閉じる'),
            ),
          ],
        ),
      );
    };
