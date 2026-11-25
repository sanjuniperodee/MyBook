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
import 'order_screen.dart';
import 'shelf_screen.dart';

/// Кабинет на телефоне: нижняя панель «Мои книги», «Заказы», «Аккаунт» (как MobileNav кабинета сайта).
class ClientHome extends StatefulWidget {
  const ClientHome({super.key});

  @override
  State<ClientHome> createState() => _ClientHomeState();
}

class _ClientHomeState extends State<ClientHome> {
  int _tab = 0;
  // Вкладку заказов пересоздаём при каждом входе — статус и оплата всегда свежие.
  int _ordersKey = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _tab, children: [
        const ShelfScreen(),
        OrdersScreen(key: ValueKey(_ordersKey)),
        const _Account(),
      ]),
      bottomNavigationBar: CabinetTabBar(
        index: _tab,
        onTap: (i) => setState(() {
          if (i == 1 && _tab != 1) _ordersKey++;
          _tab = i;
        }),
      ),
    );
  }
}

/// Аккаунт: кто вошёл, выход, документы (политика конфиденциальности, оферта) и удаление аккаунта — требования App
/// Store и Google Play. Как «Аккаунт → Данные и удаление» кабинета: что удалится, что останется (заказы в работе), пароль,
/// затем «Удалить навсегда?». Тексты и адреса — с сервера (API v1 appConfig, meDeletionInfo, meDelete).
class _Account extends StatefulWidget {
  const _Account();

  @override
  State<_Account> createState() => _AccountState();
}

class _AccountState extends State<_Account> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.DeletionInfo? _deletion;
  v1api.AppConfig? _config;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = _session.backend.contract;
    try {
      final r = await _session.backend.call(() => Future.wait<Object>([api.meDeletionInfo(), api.appConfig()]));
      if (mounted) {
        setState(() {
          _deletion = r[0] as v1api.DeletionInfo;
          _config = r[1] as v1api.AppConfig;
        });
      }
    } on ApiException catch (_) {}
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
    final session = context.watch<ClientSession>();
    final u = session.user;
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
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const CabinetTopBar(title: 'Аккаунт'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 32), children: [
        Text(u?.name ?? '', style: AppText.serif(context, size: 30, weight: FontWeight.w500)),
        if ((u?.phone ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(u!.phone, style: TextStyle(fontSize: 15.5, color: c.textMuted))),
        const SizedBox(height: 28),
        CabinetButton(
          label: 'Выйти',
          icon: LucideIcons.logOut,
          kind: CabBtn.outline,
          onPressed: () async {
            if (await confirm(context, title: 'Выйти из аккаунта?', message: 'Несохранённые без сети ответы на этом телефоне пропадут.', ok: 'Выйти', destructive: true)) await session.logout();
          },
        ),
        if (cfg != null) ...[
          const SizedBox(height: 28),
          link(cfg.labels.privacy, cfg.privacyUrl),
          Divider(height: 1, color: c.border),
          link(cfg.labels.terms, cfg.termsUrl),
        ],
        if (d != null) ...[
          const SizedBox(height: 28),
          Text(d.labels.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text(d.labels.intro, style: TextStyle(fontSize: 14, height: 1.45, color: c.textMuted)),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => _delete(d),
              icon: Icon(LucideIcons.trash2, size: 17, color: c.danger),
              label: Text(d.labels.next, style: TextStyle(color: c.danger, fontSize: 15, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ]),
    );
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
