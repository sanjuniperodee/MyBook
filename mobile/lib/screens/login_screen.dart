import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Вход сотрудника: логин и пароль CRM, при включённой 2FA — код из приложения-аутентификатора.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _login = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  final _server = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _busy = false;
  bool _showServer = false;
  bool _hide = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _server.text = context.read<AuthState>().server;
  }

  Future<void> _submit() async {
    final auth = context.read<AuthState>();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await auth.setServer(_server.text);
      if (auth.needsCode) {
        await auth.verifyCode(_code.text);
      } else {
        await auth.login(_login.text.trim(), _password.text);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final c = context.c;
    final needsCode = auth.needsCode;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(
                  child: Container(
                    width: 84,
                    height: 84,
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), boxShadow: [BoxShadow(color: const Color(0xFF7A1F2B).withValues(alpha: 0.30), blurRadius: 26, offset: const Offset(0, 10))]),
                    child: ClipRRect(borderRadius: BorderRadius.circular(24), child: Image.asset('assets/images/logo_mark.png', fit: BoxFit.cover, width: 84, height: 84)),
                  ),
                ),
                const SizedBox(height: 28),
                Text(needsCode ? 'Подтверждение входа' : 'MyBooks CRM', textAlign: TextAlign.center, style: AppText.largeTitle(context).copyWith(fontSize: 28)),
                const SizedBox(height: 8),
                Text(needsCode ? 'Введите код из приложения-аутентификатора' : 'Войдите, чтобы вести чаты и сделки', textAlign: TextAlign.center, style: AppText.sub(context).copyWith(fontSize: 16)),
                const SizedBox(height: 32),
                if (auth.notice != null && _error == null) _Notice(auth.notice!, warn: true),
                if (_error != null) _Notice(_error!, warn: false),
                if (!needsCode) ...[
                  TextField(
                    controller: _login,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    autofillHints: const [AutofillHints.username],
                    textInputAction: TextInputAction.next,
                    onSubmitted: (_) => _passwordFocus.requestFocus(),
                    style: const TextStyle(fontSize: 17),
                    decoration: InputDecoration(hintText: 'E-mail', prefixIcon: Icon(LucideIcons.mail, size: 20, color: c.textFaint)),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _password,
                    focusNode: _passwordFocus,
                    obscureText: _hide,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _submit(),
                    style: const TextStyle(fontSize: 17),
                    decoration: InputDecoration(
                      hintText: 'Пароль',
                      prefixIcon: Icon(LucideIcons.lock, size: 20, color: c.textFaint),
                      suffixIcon: IconButton(icon: Icon(_hide ? LucideIcons.eyeOff : LucideIcons.eye, size: 20, color: c.textFaint), onPressed: () => setState(() => _hide = !_hide)),
                    ),
                  ),
                ] else
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    autofocus: true,
                    maxLength: 12,
                    textAlign: TextAlign.center,
                    onSubmitted: (_) => _submit(),
                    style: const TextStyle(fontSize: 26, letterSpacing: 6, fontWeight: FontWeight.w600),
                    decoration: const InputDecoration(hintText: '••••••', counterText: ''),
                  ),
                const SizedBox(height: 20),
                PrimaryButton(label: needsCode ? 'Подтвердить' : 'Войти', busy: _busy, onPressed: _submit),
                if (needsCode) Padding(padding: const EdgeInsets.only(top: 8), child: TextButton(onPressed: auth.cancelCode, child: Text('Назад', style: TextStyle(color: c.textMuted, fontSize: 16)))),
                const SizedBox(height: 16),
                Center(
                  child: TextButton.icon(
                    onPressed: () => setState(() => _showServer = !_showServer),
                    icon: Icon(LucideIcons.server, size: 16, color: c.textFaint),
                    label: Text(_showServer ? 'Скрыть адрес сервера' : 'Адрес сервера', style: TextStyle(color: c.textFaint, fontSize: 14.5)),
                  ),
                ),
                if (_showServer)
                  TextField(controller: _server, keyboardType: TextInputType.url, autocorrect: false, decoration: const InputDecoration(hintText: 'https://mybooks.kz')),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.text, {required this.warn});
  final String text;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final fg = warn ? c.warn : c.danger;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: warn ? c.warnBg : c.danger.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(warn ? LucideIcons.info : LucideIcons.circleAlert, size: 18, color: fg),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: TextStyle(color: fg, fontSize: 14.5, height: 1.3, fontWeight: FontWeight.w500))),
      ]),
    );
  }
}
