import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// ログインした人（**hatake の外**）。
///
/// 枠組みは認証を持たないので、トークンも役割もアプリが持つ。定義に書いた `roles` は
/// ここが配る名前と突き合わされる（案件の前書きの `role-source` の答え＝
/// 「役割はログイン時にこのシステムが返す」）。
class Session extends ChangeNotifier {
  Session(this.baseUrl);

  final String baseUrl;

  String? _token;
  String? _displayName;
  Set<String> _roles = const {};

  bool get signedIn => _token != null;
  String? get token => _token;
  String? get displayName => _displayName;

  /// いま見ている人の役割。`HatakeScope(roles:)` に渡す。
  Set<String> get roles => _roles;

  /// 合っていれば true。**理由は返さない**（サーバも分けて返していない）。
  Future<bool> signIn(String userId, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'userId': userId, 'password': password}),
    );
    if (response.statusCode != 200) return false;
    final body = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, Object?>;
    final user = body['user'] as Map<String, Object?>;
    _token = body['token'] as String;
    _displayName = user['displayName'] as String?;
    _roles = {for (final role in user['roles'] as List) role.toString()};
    notifyListeners();
    return true;
  }

  void signOut() {
    _token = null;
    _displayName = null;
    _roles = const {};
    notifyListeners();
  }
}
