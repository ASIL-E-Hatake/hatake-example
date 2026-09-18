import 'package:flutter/material.dart';

import 'session.dart';

/// ログイン画面。
///
/// **ここだけは定義で作っていない。** `npx hatake where 認証` に聞くと
/// 「枠組みの外（hatake は持たない）」と返る＝画面は定義でも作れるが、資格を
/// 確かめるのは API の担当なので、この案件では画面ごとアプリ側に置いた。
class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.session});

  final Session session;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _userId = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _signIn() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await widget.session.signIn(_userId.text, _password.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = ok ? null : 'ID かパスワードが違います';
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('受注管理（枠組み無し）', style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    const Text('見本です。admin / hr / viewer でお試しください'),
                    const SizedBox(height: 24),
                    TextField(
                      controller: _userId,
                      decoration: const InputDecoration(labelText: 'ユーザー ID'),
                      onSubmitted: (_) => _signIn(),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _password,
                      decoration: const InputDecoration(labelText: 'パスワード'),
                      obscureText: true,
                      onSubmitted: (_) => _signIn(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _busy ? null : _signIn,
                      child: Text(_busy ? '確認しています…' : 'ログイン'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
