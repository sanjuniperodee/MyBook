import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/cabinet.dart';

/// Аккаунт — как страница «Аккаунт» кабинета сайта (/account): группы «Профиль» (e-mail, имя, телефон), «Пароль»,
/// «Уведомления» (письма о заказе, напоминания), «Язык», «Данные и удаление» (документы и удаление — требования App
/// Store и Google Play), внизу — выход. Надписи, проверки и итог правки — с сервера (API v1 meAccount и правки).
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.AccountView? _v;
  v1api.DeletionInfo? _deletion;
  v1api.AppConfig? _config;
  String? _error;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _current = TextEditingController();
  final _next = TextEditingController();

  /// Какая форма ждёт ответа сервера: 'profile', 'password', 'reminders', 'locale'.
  String? _busy;

  /// Итог правки — под той формой, что его вызвала (как AccountState сайта).
  String? _noticeFor;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  void _apply(v1api.AccountView v, {bool fields = false}) {
    _v = v;
    _error = null;
    if (fields) {
      _name.text = v.profile.name;
      _phone.text = v.profile.phone;
    }
  }

  Future<void> _load() async {
    final api = _session.backend.contract;
    try {
      final v = await _session.backend.call(() => api.meAccount());
      if (!mounted) return;
      setState(() => _apply(v, fields: true));
      await _loadData(v.locale);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  /// Удаление и документы — на языке аккаунта (как вся страница).
  Future<void> _loadData(String locale) async {
    final api = _session.backend.contract;
    try {
      final r = await _session.backend.call(() => Future.wait<Object>([api.meDeletionInfo(locale: locale), api.appConfig(locale: locale)]));
      if (!mounted) return;
      setState(() {
        _deletion = r[0] as v1api.DeletionInfo;
        _config = r[1] as v1api.AppConfig;
      });
    } on ApiException catch (_) {}
  }

  Future<void> _run(String form, Future<v1api.AccountView> Function(v1api.MybookApi api) call, {bool fields = false}) async {
    setState(() {
      _busy = form;
      _noticeFor = form;
    });
    try {
      final v = await _session.backend.call(() => call(_session.backend.contract));
      if (!mounted) return;
      setState(() {
        _apply(v, fields: fields);
        if (form == 'password' && v.notice?.ok == true) {
          _current.clear();
          _next.clear();
        }
      });
      if (form == 'locale') await _loadData(v.locale);
      // Имя на полке и в шапке — из сессии: обновить её.
      if (form == 'profile' && v.notice?.ok == true) await _session.refreshUser();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _delete(v1api.DeletionInfo d) async {
    final done = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.c.bg,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Cab.sheet))),
      builder: (_) => _DeleteSheet(info: d),
    );
    // Выход — после того, как лист закрылся: экран входа сменит дерево целиком.
    if (done != null && mounted) await _session.accountDeleted(done);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final v = _v;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: CabinetTopBar(title: v?.labels.title ?? ''),
      body: v == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: _error!, action: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel, onAction: _load))
          : RefreshIndicator(
              color: c.brand,
              onRefresh: _load,
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 24, 16, 40),
                children: [
                  Text(v.labels.title, style: AppText.serif(context, size: 34, weight: FontWeight.w500).copyWith(height: 1.1)),
                  const SizedBox(height: 6),
                  Text(v.labels.lead, style: TextStyle(fontSize: 15.5, height: 1.5, color: c.textMuted)),
                  const SizedBox(height: 8),
                  _group(v.labels.groups.profile.title, v.labels.groups.profile.text, _profile(v)),
                  _group(v.labels.groups.password.title, v.labels.groups.password.text, _password(v)),
                  _group(v.labels.groups.notifications.title, v.labels.groups.notifications.text, _notifications(v)),
                  _group(v.labels.groups.language.title, v.labels.groups.language.text, _language(v)),
                  _group(v.labels.groups.data.title, v.labels.groups.data.text, _data(), last: true),
                  const SizedBox(height: 28),
                  CabinetButton(
                    label: v.labels.logout,
                    icon: LucideIcons.logOut,
                    kind: CabBtn.outline,
                    onPressed: () async {
                      if (await confirm(context, title: 'Выйти из аккаунта?', message: 'Несохранённые без сети ответы на этом телефоне пропадут.', ok: v.labels.logout, destructive: true)) await _session.logout();
                    },
                  ),
                ],
              ),
            ),
    );
  }

  /// Группа настроек (Group сайта): название и пояснение, под ними — лист с содержимым; группы разделены линией.
  Widget _group(String title, String text, Widget child, {bool last = false}) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 24),
      decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: c.border))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(text, style: TextStyle(fontSize: 14, height: 1.45, color: c.textMuted)),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: c.border)),
          child: child,
        ),
      ]),
    );
  }

  Widget _label(String t) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)));

  /// Итог правки формы: зелёный «сохранено» или ошибка без поля (у поля — под ним).
  Widget? _noticeOf(String form, {Set<String> fieldsHere = const {}}) {
    final n = _v?.notice;
    if (_noticeFor != form || n == null || (!n.ok && n.field != null && fieldsHere.contains(n.field))) return null;
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(n.text, style: TextStyle(fontSize: 13.5, color: n.ok ? c.success : c.danger)),
    );
  }

  String? _fieldError(String form, String field) {
    final n = _v?.notice;
    return _noticeFor == form && n != null && !n.ok && n.field == field ? n.text : null;
  }

  Widget _profile(v1api.AccountView v) {
    final l = v.labels;
    final c = context.c;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _label(l.email),
      TextField(controller: TextEditingController(text: v.profile.email), enabled: false),
      const SizedBox(height: 4),
      Text(l.emailHint, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      const SizedBox(height: 14),
      _label(l.name),
      TextField(controller: _name, maxLength: v.limits.name, autofillHints: const [AutofillHints.name], textCapitalization: TextCapitalization.words, decoration: InputDecoration(counterText: '', errorText: _fieldError('profile', 'name'))),
      const SizedBox(height: 14),
      _label(l.phone),
      TextField(controller: _phone, keyboardType: TextInputType.phone, autofillHints: const [AutofillHints.telephoneNumber], decoration: InputDecoration(hintText: '+7 7__ ___ __ __', errorText: _fieldError('profile', 'phone'))),
      const SizedBox(height: 16),
      CabinetButton(
        label: l.save,
        large: false,
        busy: _busy == 'profile',
        onPressed: _busy != null ? null : () => _run('profile', (api) => api.meProfileUpdate(body: v1api.ProfileBody(name: _name.text, phone: _phone.text)), fields: true),
      ),
      ?_noticeOf('profile', fieldsHere: {'name', 'phone'}),
    ]);
  }

  Widget _password(v1api.AccountView v) {
    final l = v.labels;
    return AutofillGroup(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _label(l.current),
        TextField(controller: _current, obscureText: true, autofillHints: const [AutofillHints.password], decoration: InputDecoration(errorText: _fieldError('password', 'current'))),
        const SizedBox(height: 14),
        _label(l.next),
        TextField(controller: _next, obscureText: true, autofillHints: const [AutofillHints.newPassword], decoration: InputDecoration(errorText: _fieldError('password', 'next'))),
        const SizedBox(height: 16),
        ListenableBuilder(
          listenable: Listenable.merge([_current, _next]),
          builder: (_, _) => CabinetButton(
            label: l.change,
            large: false,
            busy: _busy == 'password',
            onPressed: _busy != null || _current.text.isEmpty || _next.text.length < v.limits.passwordMin
                ? null
                : () => _run('password', (api) => api.mePasswordChange(body: v1api.PasswordBody(current: _current.text, next: _next.text))),
          ),
        ),
        ?_noticeOf('password', fieldsHere: {'current', 'next'}),
      ]),
    );
  }

  Widget _notifications(v1api.AccountView v) {
    final c = context.c;
    final n = v.labels.notifications;
    Widget fact(String label, Widget value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(children: [
            Expanded(child: Text(label, style: TextStyle(fontSize: 14.5, color: c.text.withValues(alpha: 0.85)))),
            const SizedBox(width: 12),
            value,
          ]),
        );
    Widget badge(String text, bool on) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(color: on ? c.success.withValues(alpha: 0.12) : c.surface, borderRadius: BorderRadius.circular(99)),
          child: Text(text, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: on ? c.success : c.textMuted)),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      fact(n.orderMail, Text(n.orderMailValue, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500))),
      Divider(height: 1, color: c.border),
      fact(n.reminders, badge(v.remindersOn ? n.on : n.off, v.remindersOn)),
      const SizedBox(height: 8),
      Text(v.remindersOn ? n.onHint : n.offHint, style: TextStyle(fontSize: 13.5, height: 1.45, color: c.textMuted)),
      const SizedBox(height: 12),
      Align(
        alignment: Alignment.centerLeft,
        child: CabinetButton(
          label: v.remindersOn ? n.turnOff : n.turnOn,
          kind: CabBtn.outline,
          large: false,
          busy: _busy == 'reminders',
          onPressed: _busy != null ? null : () => _run('reminders', (api) => api.meRemindersSet(body: v1api.RemindersBody(on: !v.remindersOn))),
        ),
      ),
      ?_noticeOf('reminders'),
    ]);
  }

  Widget _language(v1api.AccountView v) {
    final c = context.c;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          for (final l in v.locales)
            Expanded(
              child: GestureDetector(
                onTap: _busy != null || l.id == v.locale ? null : () => _run('locale', (api) => api.meLocaleSet(body: v1api.LocaleBody(locale: l.id))),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(
                    color: l.id == v.locale ? c.surfaceRaised : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: l.id == v.locale ? [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)] : null,
                  ),
                  child: Text(l.label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: l.id == v.locale ? c.text : c.textMuted)),
                ),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 10),
      Text(v.labels.languageText, style: TextStyle(fontSize: 13.5, height: 1.45, color: c.textMuted)),
    ]);
  }

  /// «Данные и удаление»: документы и удаление аккаунта (что удалится, что останется, пароль, подтверждение).
  Widget _data() {
    final c = context.c;
    final d = _deletion;
    final cfg = _config;
    Widget link(String label, String url) => InkWell(
          onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.inAppBrowserView),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(children: [
              Icon(LucideIcons.fileText, size: 18, color: c.textMuted),
              const SizedBox(width: 12),
              Expanded(child: Text(label, style: const TextStyle(fontSize: 15.5))),
              Icon(LucideIcons.chevronRight, size: 17, color: c.textFaint),
            ]),
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (d != null) ...[
        Text(d.labels.intro, style: TextStyle(fontSize: 14, height: 1.45, color: c.text.withValues(alpha: 0.85))),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            style: TextButton.styleFrom(padding: EdgeInsets.zero),
            onPressed: () => _delete(d),
            icon: Icon(LucideIcons.trash2, size: 17, color: c.danger),
            label: Text(d.labels.next, style: TextStyle(color: c.danger, fontSize: 15, fontWeight: FontWeight.w600)),
          ),
        ),
      ],
      if (cfg != null) ...[
        if (d != null) Divider(height: 24, color: c.border),
        link(cfg.labels.privacy, cfg.privacyUrl),
        Divider(height: 1, color: c.border),
        link(cfg.labels.terms, cfg.termsUrl),
      ],
    ]);
  }
}

/// Удаление: что удалится (пунктами), что останется (заказы в работе, учёт), пароль; затем «Удалить навсегда?».
/// Возвращает сообщение сервера «Аккаунт удалён».
class _DeleteSheet extends StatefulWidget {
  const _DeleteSheet({required this.info});
  final v1api.DeletionInfo info;

  @override
  State<_DeleteSheet> createState() => _DeleteSheetState();
}

class _DeleteSheetState extends State<_DeleteSheet> {
  late final ClientSession _session = context.read<ClientSession>();
  final _password = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = widget.info.labels;
    final sure = await confirm(context, title: l.confirmTitle, message: l.intro, ok: l.confirm, destructive: true);
    if (!sure || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await _session.backend.call(() => _session.backend.contract.meDelete(body: v1api.DeleteAccountBody(password: _password.text)));
      if (mounted) Navigator.pop(context, r.labels.done);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final d = widget.info;
    final l = d.labels;
    Widget point(String text, {IconData icon = LucideIcons.x}) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.only(top: 2), child: Icon(icon, size: 15, color: c.textMuted)),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: TextStyle(fontSize: 14, height: 1.4, color: c.text))),
          ]),
        );
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.title, style: AppText.serif(context, size: 26, weight: FontWeight.w500)),
          const SizedBox(height: 8),
          Text(l.intro, style: TextStyle(fontSize: 14.5, height: 1.45, color: c.textMuted)),
          const SizedBox(height: 14),
          for (final x in d.items) point(x),
          for (final x in d.kept) point(x, icon: LucideIcons.archive),
          const SizedBox(height: 10),
          Text(l.password, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(controller: _password, obscureText: true, decoration: InputDecoration(errorText: _error), onChanged: (_) => setState(() {})),
          const SizedBox(height: 6),
          Text(l.forgot, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
          const SizedBox(height: 18),
          Row(children: [
            Expanded(child: CabinetButton(label: l.cancel, kind: CabBtn.outline, large: false, onPressed: _busy ? null : () => Navigator.pop(context))),
            const SizedBox(width: 10),
            Expanded(
              child: Material(
                color: c.danger.withValues(alpha: _password.text.isEmpty ? 0.45 : 1),
                borderRadius: BorderRadius.circular(Cab.ctl),
                child: InkWell(
                  borderRadius: BorderRadius.circular(Cab.ctl),
                  onTap: _busy || _password.text.isEmpty ? null : _submit,
                  child: SizedBox(
                    height: Cab.btn,
                    child: Center(
                      child: _busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(l.next, style: const TextStyle(color: Colors.white, fontSize: 15.5, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}
