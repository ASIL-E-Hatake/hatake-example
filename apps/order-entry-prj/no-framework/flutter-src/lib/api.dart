import 'dart:convert';

import 'package:http/http.dart' as http;

import 'session.dart';

/// API との話し方（フレームワーク**無し**版）。
///
/// hatake 版では `RestRepository` に「どのコレクションか」を渡すだけで、
/// 一覧・1件・登録・修正・削除の5つが揃っていた。この版では**呼び口を全部書く**。
/// 返ってくる形の解釈（`{items, totalCount}`）も、ここで毎回書く。
class Api {
  Api(this.baseUrl, this.session);

  final String baseUrl;
  final Session session;

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        if (session.token != null) 'authorization': 'Bearer ${session.token}',
      };

  Future<Map<String, Object?>> _json(http.Response response) async {
    final text = utf8.decode(response.bodyBytes);
    final body = text.isEmpty ? <String, Object?>{} : jsonDecode(text);
    if (response.statusCode >= 400) {
      throw ApiError(response.statusCode, body is Map ? Map<String, Object?>.from(body) : {});
    }
    return body is Map ? Map<String, Object?>.from(body) : <String, Object?>{};
  }

  /// 一覧。`params` は `?a=1&a=2` の形も作れるように並びで受ける。
  Future<({List<Map<String, Object?>> items, int totalCount})> list(
    String collection,
    Map<String, List<String>> params,
  ) async {
    final query = <String>[];
    params.forEach((name, values) {
      for (final value in values) {
        if (value.isEmpty) continue;
        query.add('${Uri.encodeQueryComponent(name)}=${Uri.encodeQueryComponent(value)}');
      }
    });
    final url = '$baseUrl/$collection${query.isEmpty ? '' : '?${query.join('&')}'}';
    final body = await _json(await http.get(Uri.parse(url), headers: _headers));
    return (
      items: [
        for (final one in (body['items'] as List? ?? const []))
          Map<String, Object?>.from(one as Map),
      ],
      totalCount: (body['totalCount'] as num? ?? 0).toInt(),
    );
  }

  Future<Map<String, Object?>> one(String collection, String key) async =>
      _json(await http.get(Uri.parse('$baseUrl/$collection/$key'), headers: _headers));

  Future<Map<String, Object?>> create(String collection, Map<String, Object?> body) async =>
      _json(await http.post(Uri.parse('$baseUrl/$collection'),
          headers: _headers, body: jsonEncode(body)));

  Future<Map<String, Object?>> update(
          String collection, String key, Map<String, Object?> body) async =>
      _json(await http.put(Uri.parse('$baseUrl/$collection/$key'),
          headers: _headers, body: jsonEncode(body)));

  Future<void> remove(String collection, String key) async {
    final response =
        await http.delete(Uri.parse('$baseUrl/$collection/$key'), headers: _headers);
    if (response.statusCode >= 400) await _json(response);
  }

  Future<Map<String, Object?>> post(String path, Map<String, Object?> body) async =>
      _json(await http.post(Uri.parse('$baseUrl$path'),
          headers: _headers, body: jsonEncode(body)));
}

/// サーバが返したエラー。**文言はサーバのものをそのまま出す**
/// （言い換えると、API を直接叩いた人と違う説明になる）。
class ApiError implements Exception {
  ApiError(this.status, this.body);

  final int status;
  final Map<String, Object?> body;

  String get message => body['message']?.toString() ?? 'エラーが発生しました（$status）';

  /// 項目ごとの失敗（`{field: message}`）。検証で弾かれたときだけ入る。
  Map<String, String> get fieldErrors => {
        for (final one in (body['errors'] as List? ?? const []))
          if (one is Map) '${one['field']}': '${one['message']}',
      };

  @override
  String toString() => message;
}
