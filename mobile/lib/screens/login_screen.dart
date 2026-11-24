import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../core/version.dart';

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
    // Как CRM на сайте (DESIGN.md, html.crm): лист без украшений, знак и подпись слева, поля с подписями и рамкой,
    // одна винная кнопка, служебное (адрес сервера, версия) — мелко внизу.
    InputDecoration field(String hint, {Widget? prefix, Widget? suffix}) => InputDecoration(
          hintText: hint,
          prefixIcon: prefix,
          suffixIcon: suffix,
          filled: true,
          fillColor: c.surfaceRaised,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Rd.sm), borderSide: BorderSide(color: c.border)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Rd.sm), borderSide: BorderSide(color: c.brand, width: 1.5)),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(Rd.sm), borderSide: BorderSide(color: c.border)),
        );
    Widget label(String t) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: c.textMuted)));
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.asset('assets/images/logo_mark.png', fit: BoxFit.cover, width: 40, height: 40)),
                  const SizedBox(width: 12),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('MyBooks', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.text, height: 1.1)),
                    Text('CRM для команды', style: TextStyle(fontSize: 13, color: c.textMuted)),
                  ]),
                ]),
                const SizedBox(height: 40),
                Text(needsCode ? 'Подтверждение входа' : 'Вход в CRM', style: AppText.largeTitle(context).copyWith(fontSize: 28, letterSpacing: -0.5)),
                const SizedBox(height: 6),
                Text(needsCode ? 'Введите код из приложения-аутентификатора' : 'Чаты, сделки, задачи и заказы — как на сайте, в телефоне', style: AppText.sub(context).copyWith(fontSize: 15.5)),
                const SizedBox(height: 28),
                if (auth.notice != null && _error == null) _Notice(auth.notice!, warn: true),
                if (_error != null) _Notice(_error!, warn: false),
                if (!needsCode) ...[
                  label('Электронная почта'),
                  TextField(
                    controller: _login,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    autofillHints: const [AutofillHints.username],
                    textInputAction: TextInputAction.next,
                    onSubmitted: (_) => _passwordFocus.requestFocus(),
                    style: TextStyle(fontSize: 16.5, color: c.text),
                    decoration: field('name@mybooks.kz'),
                  ),
                  const SizedBox(height: 16),
                  label('Пароль'),
                  TextField(
                    controller: _password,
                    focusNode: _passwordFocus,
                    obscureText: _hide,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _submit(),
                    style: TextStyle(fontSize: 16.5, color: c.text),
                    decoration: field(
                      'Пароль',
                      suffix: IconButton(icon: Icon(_hide ? LucideIcons.eyeOff : LucideIcons.eye, size: 19, color: c.textFaint), tooltip: _hide ? 'Показать пароль' : 'Скрыть пароль', onPressed: () => setState(() => _hide = !_hide)),
                    ),
                  ),
                ] else ...[
                  label('Код'),
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    autofocus: true,
                    maxLength: 12,
                    textAlign: TextAlign.center,
                    onSubmitted: (_) => _submit(),
                    style: TextStyle(fontSize: 24, letterSpacing: 6, fontWeight: FontWeight.w600, color: c.text),
                    decoration: field('••••••').copyWith(counterText: ''),
                  ),
                ],
                const SizedBox(height: 24),
                PrimaryButton(label: needsCode ? 'Подтвердить' : 'Войти', busy: _busy, onPressed: _submit),
                if (needsCode) Padding(padding: const EdgeInsets.only(top: 8), child: TextButton(onPressed: auth.cancelCode, child: Text('Назад', style: TextStyle(color: c.textMuted, fontSize: 16)))),
                const SizedBox(height: 28),
                Divider(color: c.border, height: 1),
                const SizedBox(height: 8),
                Row(children: [
                  TextButton.icon(
                    onPressed: () => setState(() => _showServer = !_showServer),
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: c.textMuted),
                    icon: Icon(LucideIcons.server, size: 15, color: c.textFaint),
                    label: Text(_showServer ? 'Скрыть адрес сервера' : 'Адрес сервера', style: TextStyle(color: c.textMuted, fontSize: 13.5)),
                  ),
                  const Spacer(),
                  Text('Версия $appVersion', style: TextStyle(color: c.textFaint, fontSize: 13)),
                ]),
                if (_showServer) ...[const SizedBox(height: 6), TextField(controller: _server, keyboardType: TextInputType.url, autocorrect: false, style: TextStyle(color: c.text), decoration: field('https://mybooks.kz'))],
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: warn ? c.warnBg : c.dangerBg, borderRadius: BorderRadius.circular(Rd.sm)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(warn ? LucideIcons.info : LucideIcons.circleAlert, size: 18, color: fg),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: TextStyle(color: fg, fontSize: 14.5, height: 1.3, fontWeight: FontWeight.w500))),
      ]),
    );
  }
}
