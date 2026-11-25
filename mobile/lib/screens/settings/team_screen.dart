import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../../widgets/crm_form.dart';
import '../crm_web_screen.dart';
import '../money/money_widgets.dart';

/// «Команда» (API v1 crmTeam): сотрудники — роль, добавочный, телефон для напоминаний, отключить, сбросить пароль, забрать
/// доступ; «+» — добавить сотрудника. Роли и их права, планы продаж — страницей CRM.
class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  v1api.Team? _t;
  String? _error;
  bool _loading = false;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final t = await v1(_api, (c) => c.crmTeam());
      if (mounted) setState(() => _t = t);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _done(Future<v1api.Done> Function(v1api.MybookApi) call) async {
    try {
      final r = await v1(_api, call);
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Сохранено');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _member(v1api.Team t, v1api.TeamMember m) async {
    if (m.locked) return _toast(m.isSelf ? 'Себя менять нельзя' : 'Владельца меняет только владелец');
    final pick = await showAppSheet<String>(context, title: m.name.isEmpty ? m.email : m.name, builder: (sheet) {
      return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        GroupCard(padding: EdgeInsets.zero, children: [
          GroupTile(title: 'Роль', subtitle: m.roleName, icon: LucideIcons.shieldCheck, onTap: () => Navigator.pop(sheet, 'role')),
          GroupTile(title: 'Добавочный номер', subtitle: m.extension.isEmpty ? 'нет' : m.extension, icon: LucideIcons.phone, onTap: () => Navigator.pop(sheet, 'ext')),
          GroupTile(title: 'Телефон для напоминаний', subtitle: m.phone.isEmpty ? 'нет' : m.phone, icon: LucideIcons.smartphone, onTap: () => Navigator.pop(sheet, 'phone')),
          GroupTile(title: m.disabled ? 'Включить вход' : 'Отключить вход', icon: m.disabled ? LucideIcons.userCheck : LucideIcons.userX, onTap: () => Navigator.pop(sheet, 'disable')),
          GroupTile(title: 'Сбросить пароль', subtitle: 'новый придёт сотруднику на почту', icon: LucideIcons.keyRound, onTap: () => Navigator.pop(sheet, 'password')),
          GroupTile(title: 'Забрать доступ к CRM', subtitle: 'аккаунт станет клиентским', icon: LucideIcons.ban, onTap: () => Navigator.pop(sheet, 'revoke')),
        ]),
      ]);
    });
    if (pick == null || !mounted) return;
    switch (pick) {
      case 'role':
        final v = await pickChoice(context, title: 'Роль', options: [for (final r in t.roles) (r.id, r.label)], current: m.roleId);
        if (v != null && v.isNotEmpty && v != m.roleId) await _done((c) => c.crmTeamMember(userId: m.id, body: v1api.TeamMemberPatch(roleId: v)));
      case 'ext':
        final v = await promptText(context, title: 'Добавочный номер', hint: '101', initial: m.extension);
        if (v != null) await _done((c) => c.crmTeamMember(userId: m.id, body: v1api.TeamMemberPatch(extension: v.trim())));
      case 'phone':
        final v = await promptText(context, title: 'Телефон для напоминаний', hint: '+7 701 …', initial: m.phone);
        if (v != null) await _done((c) => c.crmTeamMember(userId: m.id, body: v1api.TeamMemberPatch(phone: v.trim())));
      case 'disable':
        if (await confirm(context, title: m.disabled ? 'Включить вход?' : 'Отключить вход?', message: m.disabled ? null : 'Сотрудник не сможет войти, его сделки останутся за ним.', ok: m.disabled ? 'Включить' : 'Отключить', destructive: !m.disabled)) {
          await _done((c) => c.crmTeamMember(userId: m.id, body: v1api.TeamMemberPatch(disabled: !m.disabled)));
        }
      case 'password':
        if (await confirm(context, title: 'Сбросить пароль?', message: 'Прежние входы сотрудника завершатся.', ok: 'Сбросить')) await _done((c) => c.crmTeamPassword(userId: m.id));
      case 'revoke':
        if (await confirm(context, title: 'Забрать доступ к CRM?', message: 'Аккаунт станет клиентским; вернуть доступ — пригласить заново.', ok: 'Забрать', destructive: true)) await _done((c) => c.crmTeamRevoke(userId: m.id));
    }
  }

  Future<void> _invite(v1api.Team t) async {
    final email = TextEditingController();
    final name = TextEditingController();
    String? role = t.inviteRoles.isEmpty ? null : t.inviteRoles.first.id;
    final ok = await showAppSheet<bool>(context, title: 'Новый сотрудник', builder: (sheet) {
      return StatefulBuilder(builder: (context, set) {
        return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
          LabeledField(label: 'Почта', controller: email, keyboard: TextInputType.emailAddress, autocorrect: false),
          LabeledField(label: 'Имя', controller: name, autocorrect: false, capitalization: TextCapitalization.words),
          GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
            ChoiceRow(
              label: 'Роль',
              icon: LucideIcons.shieldCheck,
              value: t.inviteRoles.where((r) => r.id == role).map((r) => r.label).firstOrNull ?? 'выбрать',
              onTap: () async {
                final v = await pickChoice(context, title: 'Роль', options: [for (final r in t.inviteRoles) (r.id, r.label)], current: role);
                if (v != null && v.isNotEmpty) set(() => role = v);
              },
            ),
          ]),
          Text('Пароль придумает система и отправит на почту.', style: AppText.caption(context)),
          const SizedBox(height: 12),
          PrimaryButton(label: 'Добавить', icon: LucideIcons.userPlus, onPressed: () => Navigator.pop(sheet, true)),
        ]);
      });
    });
    if (ok != true || !mounted) return;
    if (role == null) return _toast('Выберите роль');
    await _done((c) => c.crmTeamInvite(body: v1api.TeamInviteBody(email: email.text.trim(), name: name.text.trim(), password: '', roleId: role!, extension: '')));
  }

  @override
  Widget build(BuildContext context) {
    final t = _t;
    final c = context.c;
    return MoneyPage(
      title: 'Команда',
      subtitle: 'Роли и права ролей, планы продаж — в CRM на сайте',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [if (t != null && t.inviteRoles.isNotEmpty) RoundIconButton(icon: LucideIcons.userPlus, size: 44, iconSize: 22, color: c.brand, tooltip: 'Добавить сотрудника', onTap: () => _invite(t))],
      children: t == null
          ? const []
          : [
              GroupCard(padding: EdgeInsets.zero, children: [
                for (final m in t.members)
                  GroupTile(
                    title: '${m.name.isEmpty ? m.email : m.name}${m.isSelf ? ' (вы)' : ''}',
                    subtitle: [
                      m.roleName.isEmpty ? 'владелец' : m.roleName,
                      if (m.disabled) 'вход отключён' else if (m.onShift) 'на смене',
                      'сделок ${m.openDeals}',
                      if (m.calls7d > 0) 'звонков за неделю ${m.calls7d}',
                      if (m.lastSeen != null) 'был ${m.lastSeen}',
                    ].join(' · '),
                    icon: m.disabled ? LucideIcons.userX : LucideIcons.user,
                    onTap: m.locked ? null : () => _member(t, m),
                  ),
              ]),
              MoneySection(title: 'Роли и планы', hint: 'редакторы прав и планов — страницами CRM'),
              GroupCard(padding: EdgeInsets.zero, children: [
                GroupTile(title: 'Роли и права', icon: LucideIcons.lockKeyhole, onTap: () => openCrm(context, '/admin/team/roles', title: 'Роли и права').then((_) => _load())),
                GroupTile(title: 'Планы продаж', icon: LucideIcons.target, onTap: () => openCrm(context, '/admin/team/plans', title: 'Планы продаж')),
              ]),
            ],
    );
  }
}
