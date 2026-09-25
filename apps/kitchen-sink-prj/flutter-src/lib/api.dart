import 'dart:convert';

import 'package:hatake_http/hatake_http.dart';
import 'package:http/http.dart' as http;

/// `hatake_http` に渡す「送る人」。
///
/// **通信そのものは枠組みが持たない**（`package:http` でも dio でも社内の
/// インターセプタでも差せるように）。アプリが書くのはこの関数1つだけ。
HttpSend httpSend() => (HttpRequest request) async {
      final sent = http.Request(request.method, request.url)
        ..headers.addAll(request.headers);
      if (request.body != null) sent.body = request.body!;
      final response = await http.Response.fromStream(await sent.send());
      // 文字化けを避けるため、**バイトから UTF-8 で読む**（日本語の氏名が入る）。
      return HttpResponse(response.statusCode, utf8.decode(response.bodyBytes));
    };

/// 画面の定義をサーバから読む。
///
/// 定義のコピーを画面側に持たない＝**フロントとバックが同じ1枚を読む**が実行時にも
/// そのまま本当になる（画面を直したいときは定義を差し替えるだけで済む）。
Future<String> fetchDefinition(String baseUrl) async {
  final response = await http.get(Uri.parse('$baseUrl/definition.yaml'));
  if (response.statusCode != 200) {
    throw StateError('定義を読めませんでした（${response.statusCode}）');
  }
  return utf8.decode(response.bodyBytes);
}
