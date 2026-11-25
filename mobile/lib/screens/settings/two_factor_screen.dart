import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../crm_web_screen.dart';
import '../money/money_widgets.dart';

/// Нативный экран «Безопасность и 2FA» (API v1 crmSecurity*):
/// статус 2FA, включение по TOTP (QR, otpauth URI, ключ и 6-значный код), резервные коды, отключение,
/// а для руководителей (settings.manage + team.manage) — обязательная 2FA, IP-фильтр и сброс 2FA сотрудникам.
class TwoFactorScreen extends StatefulWidget {
  const TwoFactorScreen({
    super.key,
    this.loader,
    this.onStart,
    this.onConfirm,
    this.onBackup,
    this.onDisable,
    this.onSaveRules,
    this.onResetStaff,
  });

  /// Необязательные коллбэки для виджет-тестов (в приложении — живой API v1).
  final Future<v1api.CrmSecurity> Function()? loader;
  final Future<v1api.CrmTwoFactorStart> Function()? onStart;
  final Future<v1api.CrmTwoFactorCodes> Function(String code)? onConfirm;
  final Future<v1api.CrmTwoFactorCodes> Function(String code)? onBackup;
  final Future<v1api.Done> Function(String code)? onDisable;
  final Future<v1api.Done> Function(v1api.CrmSecurityRulesBody body)? onSaveRules;
  final Future<v1api.Done> Function(String userId)? onResetStaff;

  @override
  State<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends State<TwoFactorScreen> {
  v1api.CrmSecurity? _s;
  v1api.CrmTwoFactorStart? _setup;
  List<String>? _codes;
  final _codeCtrl = TextEditingController();
  String? _error;
  bool _loading = false;
  bool _busy = false;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final s = widget.loader != null ? await widget.loader!() : await v1(_api, (c) => c.crmSecurity());
      if (mounted) setState(() => _s = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _runBusy(Future<void> Function() fn) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await fn();
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startSetup() => _runBusy(() async {
        final setup = widget.onStart != null
            ? await widget.onStart!()
            : await v1(_api, (c) => c.crmSecurity2faStart());
        if (mounted) {
          setState(() {
            _setup = setup;
            _codeCtrl.clear();
          });
        }
      });

  Future<void> _confirmSetup() => _runBusy(() async {
        final code = _codeCtrl.text.trim();
        if (code.replaceAll(RegExp(r'\D'), '').length != 6) {
          _toast('Введите 6-значный код из приложения');
          return;
        }
        final res = widget.onConfirm != null
            ? await widget.onConfirm!(code)
            : await v1(_api, (c) => c.crmSecurity2faConfirm(body: v1api.CrmTwoFactorCodeBody(code: code)));
        HapticFeedback.lightImpact();
        if (mounted) {
          setState(() {
            _setup = null;
            _codes = res.codes;
            _codeCtrl.clear();
          });
        }
      });

  Future<void> _regenerateBackup() => _runBusy(() async {
        final code = _codeCtrl.text.trim();
        if (code.isEmpty) {
          _toast('Введите код из приложения или резервный код');
          return;
        }
        final res = widget.onBackup != null
            ? await widget.onBackup!(code)
            : await v1(_api, (c) => c.crmSecurity2faBackup(body: v1api.CrmTwoFactorCodeBody(code: code)));
        HapticFeedback.lightImpact();
        if (mounted) {
          setState(() {
            _codes = res.codes;
            _codeCtrl.clear();
          });
        }
      });

  Future<void> _disable2fa() async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) {
      _toast('Введите код из приложения или резервный код');
      return;
    }
    final ok = await confirm(
      context,
      title: 'Отключить двухфакторный вход?',
      message: 'Для входа снова будет достаточно пароля.',
      ok: 'Отключить',
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _runBusy(() async {
      final res = widget.onDisable != null
          ? await widget.onDisable!(code)
          : await v1(_api, (c) => c.crmSecurity2faDisable(body: v1api.CrmTwoFactorCodeBody(code: code)));
      HapticFeedback.lightImpact();
      _codeCtrl.clear();
      _toast(res.message ?? '2FA отключена');
      await _load();
    });
  }

  Future<void> _toggleRequire2fa(bool value) => _runBusy(() async {
        final body = v1api.CrmSecurityRulesBody(require2fa: value);
        final res = widget.onSaveRules != null
            ? await widget.onSaveRules!(body)
            : await v1(_api, (c) => c.crmSecurityRules(body: body));
        HapticFeedback.lightImpact();
        _toast(res.message ?? 'Сохранено');
        await _load();
      });

  Future<void> _editIpAllowlist(v1api.CrmSecurity s) async {
    final text = await promptText(
      context,
      title: 'Разрешённые сети (IP)',
      hint: 'По одному адресу или подсети CIDR в строке. Пусто — без ограничений.\nВаш IP: ${s.currentIp}',
      initial: s.ipAllowlist,
      lines: 5,
      ok: 'Сохранить',
    );
    if (text == null || !mounted) return;
    await _runBusy(() async {
      final body = v1api.CrmSecurityRulesBody(ipAllowlist: text);
      final res = widget.onSaveRules != null
          ? await widget.onSaveRules!(body)
          : await v1(_api, (c) => c.crmSecurityRules(body: body));
      HapticFeedback.lightImpact();
      _toast(res.message ?? 'Сохранено');
      await _load();
    });
  }

  Future<void> _resetStaff(v1api.CrmSecurityTeamMember member) async {
    final ok = await confirm(
      context,
      title: 'Сбросить 2FA сотруднику ${member.name}?',
      message: 'Он войдёт по паролю и настроит 2FA заново.',
      ok: 'Сбросить',
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _runBusy(() async {
      final res = widget.onResetStaff != null
          ? await widget.onResetStaff!(member.id)
          : await v1(_api, (c) => c.crmSecurityStaffReset(userId: member.id));
      HapticFeedback.lightImpact();
      _toast(res.message ?? '2FA сброшена');
      await _load();
    });
  }

  Uint8List? _decodeQr(String dataUrl) {
    final i = dataUrl.indexOf('base64,');
    if (i < 0) return null;
    try {
      return base64Decode(dataUrl.substring(i + 7));
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final c = context.c;
    return MoneyPage(
      title: 'Безопасность',
      subtitle: 'Двухфакторный вход (2FA) и правила команды',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [
        RoundIconButton(
          icon: LucideIcons.externalLink,
          size: 44,
          iconSize: 19,
          color: c.textMuted,
          tooltip: 'Открыть в CRM',
          onTap: () => openCrm(context, '/admin/security', title: 'Безопасность').then((_) => _load()),
        ),
      ],
      children: s == null
          ? const []
          : [
              if (_codes != null) _backupCodesCard(context, _codes!),
              if (_codes == null) _my2faCard(context, s),
              if (s.canManage) ...[
                const MoneySection(title: 'Правила команды', hint: 'Обязательная 2FA и разрешённые сети'),
                GroupCard(
                  padding: EdgeInsets.zero,
                  children: [
                    GroupTile(
                      icon: LucideIcons.shieldAlert,
                      iconColor: s.require2fa ? c.success : c.textMuted,
                      title: 'Обязательная 2FA для всех',
                      subtitle: !s.enabled && !s.require2fa
                          ? 'Сначала включите 2FA себе'
                          : s.require2fa
                              ? 'Без 2FA открыта только страница безопасности'
                              : 'Сотрудники включают по желанию',
                      trailing: Switch.adaptive(
                        value: s.require2fa,
                        activeTrackColor: c.brand,
                        onChanged: _busy ? null : _toggleRequire2fa,
                      ),
                    ),
                    GroupTile(
                      icon: LucideIcons.network,
                      iconColor: s.ipAllowlist.trim().isNotEmpty ? c.success : c.textMuted,
                      title: 'Вход с адресов (IP)',
                      subtitle: s.ipAllowlist.trim().isNotEmpty
                          ? 'Только разрешённые сети · ваш IP ${s.currentIp}'
                          : 'Без ограничений · ваш IP ${s.currentIp}',
                      onTap: _busy ? null : () => _editIpAllowlist(s),
                    ),
                  ],
                ),
                if (s.team.isNotEmpty) ...[
                  MoneySection(
                    title: '2FA у сотрудников',
                    hint: 'Включена у ${s.team.where((u) => u.enabled).length} из ${s.team.length}',
                  ),
                  GroupCard(
                    padding: EdgeInsets.zero,
                    children: [
                      for (final u in s.team)
                        GroupTile(
                          icon: u.enabled ? LucideIcons.shieldCheck : LucideIcons.shieldOff,
                          iconColor: u.enabled ? c.success : c.textFaint,
                          title: u.name,
                          subtitle: u.enabled
                              ? 'включена${u.since != null ? ' с ${u.since}' : ''}'
                              : 'не настроена',
                          trailing: u.canReset
                              ? TextButton(
                                  onPressed: _busy ? null : () => _resetStaff(u),
                                  style: TextButton.styleFrom(foregroundColor: c.danger),
                                  child: const Text('Сбросить'),
                                )
                              : const SizedBox.shrink(),
                        ),
                    ],
                  ),
                ],
              ] else ...[
                const SizedBox(height: 12),
                GroupCard(
                  padding: EdgeInsets.zero,
                  children: [
                    GroupTile(
                      icon: LucideIcons.globe,
                      iconColor: c.textMuted,
                      title: 'Ваш текущий IP',
                      subtitle: s.currentIp,
                      trailing: const SizedBox.shrink(),
                    ),
                  ],
                ),
              ],
            ],
    );
  }

  Widget _backupCodesCard(BuildContext context, List<String> codes) {
    final c = context.c;
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.surfaceRaised,
        borderRadius: BorderRadius.circular(Rd.md),
        border: Border.all(color: c.success.withValues(alpha: 0.45), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(LucideIcons.keyRound, size: 18, color: c.success),
              const SizedBox(width: 8),
              Expanded(child: Text('Сохраните резервные коды', style: AppText.headline(context))),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Каждый код срабатывает один раз. Больше они не покажутся — сохраните их сейчас.',
            style: AppText.caption(context),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final code in codes)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(8)),
                  child: SelectableText(code, style: TextStyle(fontFamily: 'monospace', fontSize: 14, fontWeight: FontWeight.w600, color: c.text)),
                ),
            ],
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: codes.join('\n')));
              _toast('Резервные коды скопированы');
            },
            icon: const Icon(LucideIcons.copy, size: 16),
            label: const Text('Скопировать все'),
          ),
          const SizedBox(height: 8),
          PrimaryButton(
            label: 'Я сохранил коды',
            icon: LucideIcons.check,
            onPressed: () {
              setState(() => _codes = null);
              _load();
            },
          ),
        ],
      ),
    );
  }

  Widget _my2faCard(BuildContext context, v1api.CrmSecurity s) {
    final c = context.c;
    final setup = _setup;
    final qrBytes = setup == null ? null : _decodeQr(setup.qrDataUrl);
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.surfaceRaised,
        borderRadius: BorderRadius.circular(Rd.md),
        border: Border.all(color: c.border, width: 0.7),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(s.enabled ? LucideIcons.shieldCheck : LucideIcons.shieldAlert, size: 20, color: s.enabled ? c.success : c.warn),
              const SizedBox(width: 8),
              Expanded(child: Text('Ваш двухфакторный вход', style: AppText.headline(context))),
              Tag(
                s.enabled ? 'включён' : 'выключен',
                fg: s.enabled ? c.success : c.warn,
                bg: s.enabled ? c.success.withValues(alpha: 0.14) : c.warnBg,
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (s.enabled) ...[
            Text(
              'Включён${s.since != null ? ' с ${s.since}' : ''} · осталось резервных кодов: ${s.backupLeft}',
              style: AppText.sub(context),
            ),
            const SizedBox(height: 14),
            Text('Код из приложения или резервный код', style: AppText.caption(context)),
            const SizedBox(height: 6),
            TextField(
              controller: _codeCtrl,
              keyboardType: TextInputType.text,
              textAlign: TextAlign.center,
              style: TextStyle(fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, color: c.text),
              decoration: const InputDecoration(hintText: '123456'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : _regenerateBackup,
              icon: const Icon(LucideIcons.keyRound, size: 17),
              label: const Text('Новые резервные коды'),
            ),
            if (s.canDisable) ...[
              const SizedBox(height: 8),
              PrimaryButton(
                label: 'Отключить 2FA',
                icon: LucideIcons.shieldOff,
                danger: true,
                busy: _busy,
                onPressed: _disable2fa,
              ),
            ] else ...[
              const SizedBox(height: 8),
              Text('Руководитель сделал 2FA обязательной — отключить её нельзя.', style: AppText.caption(context)),
            ],
          ] else if (setup == null) ...[
            Text(
              'Защищает CRM, даже если пароль утёк: при входе кроме пароля нужен код из приложения-аутентификатора (Google Authenticator, Яндекс Ключ, 1Password).',
              style: AppText.sub(context),
            ),
            const SizedBox(height: 14),
            PrimaryButton(
              label: 'Включить 2FA',
              icon: LucideIcons.shieldCheck,
              busy: _busy,
              onPressed: _startSetup,
            ),
          ] else ...[
            Text('1. Откройте в приложении-аутентификаторе или введите ключ вручную:', style: AppText.sub(context)),
            if (qrBytes != null) ...[
              const SizedBox(height: 12),
              Center(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    color: Colors.white,
                    padding: const EdgeInsets.all(8),
                    child: Image.memory(qrBytes, width: 180, height: 180),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => launchUrl(Uri.parse(setup.otpauthUrl), mode: LaunchMode.externalApplication),
              icon: const Icon(LucideIcons.smartphone, size: 17),
              label: const Text('Открыть в аутентификаторе'),
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(10)),
              child: Row(
                children: [
                  Expanded(
                    child: SelectableText(
                      setup.secret,
                      style: TextStyle(fontFamily: 'monospace', fontSize: 13.5, color: c.text),
                    ),
                  ),
                  IconButton(
                    icon: Icon(LucideIcons.copy, size: 18, color: c.brand),
                    tooltip: 'Скопировать ключ',
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: setup.secret));
                      _toast('Ключ скопирован');
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Text('2. Введите 6-значный код из приложения:', style: AppText.sub(context)),
            const SizedBox(height: 6),
            TextField(
              controller: _codeCtrl,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              maxLength: 6,
              style: TextStyle(fontFamily: 'monospace', fontSize: 20, letterSpacing: 4, color: c.text),
              decoration: const InputDecoration(hintText: '123456', counterText: ''),
            ),
            const SizedBox(height: 10),
            PrimaryButton(
              label: 'Подтвердить и включить',
              icon: LucideIcons.check,
              busy: _busy,
              onPressed: _confirmSetup,
            ),
            TextButton(
              onPressed: _busy ? null : () => setState(() => _setup = null),
              child: const Text('Отмена'),
            ),
          ],
        ],
      ),
    );
  }
}
