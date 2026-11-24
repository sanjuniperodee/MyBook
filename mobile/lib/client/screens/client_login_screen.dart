import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';

/// Вход автора — как страница входа кабинета: тёплая бумага, заголовок засечками, одно поле телефона и пароль.
class ClientLoginScreen extends StatefulWidget {
  const ClientLoginScreen({super.key});

  @override
  State<ClientLoginScreen> createState() => _ClientLoginScreenState();
}

class _ClientLoginScreenState extends State<ClientLoginScreen> {
  final _login = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hide = true;
  String? _error;

  Future<void> _submit() async {
    if (_login.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Введите телефон и пароль');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<ClientSession>().login(_login.text, _password.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final notice = context.watch<ClientSession>().notice;
    return Scaffold(
      backgroundColor: c.wallpaper,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                ClipRRect(borderRadius: BorderRadius.circular(14), child: Image.asset('assets/client/icon.png', width: 56, height: 56)),
                const SizedBox(height: 28),
                Text('Книга вашей жизни', style: AppText.serif(context, size: 38, weight: FontWeight.w600).copyWith(height: 1.05, letterSpacing: -0.5)),
                const SizedBox(height: 10),
                Text('Отвечайте на вопросы, добавляйте фото — книга собирается сама. Войдите, чтобы продолжить с телефона.', style: AppText.sub(context).copyWith(fontSize: 15.5, height: 1.45)),
                const SizedBox(height: 28),
                if (notice != null) ...[_Note(text: notice, color: c.warn, bg: c.warnBg), const SizedBox(height: 14)],
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(14), border: Border.all(color: c.border)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('Телефон или почта', style: AppText.caption(context).copyWith(fontWeight: FontWeight.w600, color: c.text)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _login,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.telephoneNumber, AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(hintText: '+7 700 000 00 00'),
                    ),
                    const SizedBox(height: 14),
                    Text('Пароль', style: AppText.caption(context).copyWith(fontWeight: FontWeight.w600, color: c.text)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _password,
                      obscureText: _hide,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        suffixIcon: IconButton(icon: Icon(_hide ? LucideIcons.eye : LucideIcons.eyeOff, size: 19, color: c.textMuted), onPressed: () => setState(() => _hide = !_hide)),
                      ),
                    ),
                    if (_error != null) ...[const SizedBox(height: 12), _Note(text: _error!, color: c.danger, bg: c.dangerBg)],
                    const SizedBox(height: 18),
                    PrimaryButton(label: 'Войти', busy: _busy, onPressed: _submit),
                  ]),
                ),
                const SizedBox(height: 16),
                Text('Пароль — тот же, что на сайте mybooks.kz. Забыли — восстановите его на сайте.', style: AppText.caption(context)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text, required this.color, required this.bg});
  final String text;
  final Color color;
  final Color bg;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        child: Text(text, style: TextStyle(color: color, fontSize: 14, height: 1.35)),
      );
}
