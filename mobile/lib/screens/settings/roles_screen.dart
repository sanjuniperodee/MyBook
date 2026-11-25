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
import '../money/money_widgets.dart';

/// Нативный экран «Роли и права» (API v1 crmRoles / crmRoleSave / crmRoleDelete):
/// просмотр всех ролей, матрицы прав и видимости, создание, правка и удаление пользовательских ролей.
class RolesScreen extends StatefulWidget {
  const RolesScreen({
    super.key,
    this.loader,
    this.onSave,
    this.onDelete,
  });

  /// Необязательные коллбэки для виджет-тестов (в приложении — живой API v1).
  final Future<v1api.CrmRoles> Function()? loader;
  final Future<v1api.Done> Function(v1api.CrmRoleSaveBody body)? onSave;
  final Future<v1api.Done> Function(String roleId)? onDelete;

  @override
  State<RolesScreen> createState() => _RolesScreenState();
}

class _RolesScreenState extends State<RolesScreen> {
  v1api.CrmRoles? _data;
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
      final data = widget.loader != null ? await widget.loader!() : await v1(_api, (c) => c.crmRoles());
      if (mounted) setState(() => _data = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openRole(v1api.CrmRoles data, v1api.CrmRole? role) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => RoleDetailScreen(
          role: role,
          groups: data.groups,
          totalPermissions: data.totalPermissions,
          onSave: widget.onSave,
          onDelete: widget.onDelete,
        ),
      ),
    );
    if (changed == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final c = context.c;
    return MoneyPage(
      title: 'Роли и права',
      subtitle: 'Набор прав и видимость записей (все или только свои)',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [
        if (data != null)
          RoundIconButton(
            icon: LucideIcons.plus,
            size: 44,
            iconSize: 22,
            color: c.brand,
            tooltip: 'Новая роль',
            onTap: () => _openRole(data, null),
          ),
      ],
      children: data == null
          ? const []
          : [
              GroupCard(
                padding: EdgeInsets.zero,
                children: [
                  for (final role in data.roles)
                    GroupTile(
                      icon: role.locked
                          ? LucideIcons.shieldCheck
                          : role.system
                              ? LucideIcons.lock
                              : LucideIcons.keyRound,
                      iconColor: role.locked ? c.brand : c.brandDeep,
                      title: '${role.name}${role.isOwnRole ? ' (ваша)' : ''}',
                      subtitle: [
                        role.scope == 'all' ? 'Видит всё' : 'Только свои',
                        'прав ${role.permissions.length} из ${data.totalPermissions}',
                        'сотрудников ${role.members}',
                        if (role.system) 'системная',
                      ].join(' · '),
                      onTap: () => _openRole(data, role),
                    ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(top: 12, left: 4, right: 4),
                child: Text(
                  '«Только свои» — сотрудник видит сделки, чаты и клиентов, где он ответственный, плюс неразобранные. Руководитель всегда видит всё.',
                  style: AppText.caption(context),
                ),
              ),
            ],
    );
  }
}

/// Просмотр и редактирование одной роли (или создание новой): название, видимость, матрица прав с поиском и фильтром.
class RoleDetailScreen extends StatefulWidget {
  const RoleDetailScreen({
    super.key,
    required this.role,
    required this.groups,
    required this.totalPermissions,
    this.onSave,
    this.onDelete,
  });

  final v1api.CrmRole? role;
  final List<v1api.CrmPermissionGroup> groups;
  final int totalPermissions;
  final Future<v1api.Done> Function(v1api.CrmRoleSaveBody body)? onSave;
  final Future<v1api.Done> Function(String roleId)? onDelete;

  @override
  State<RoleDetailScreen> createState() => _RoleDetailScreenState();
}

class _RoleDetailScreenState extends State<RoleDetailScreen> {
  late final TextEditingController _name;
  late String _scope;
  late Set<String> _perms;
  String _query = '';
  bool _onlyGranted = false;
  bool _busy = false;

  bool get _locked => widget.role?.locked == true;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.role?.name ?? '');
    _scope = widget.role?.scope ?? 'own';
    _perms = Set<String>.from(widget.role?.permissions ?? const ['deals.view', 'chats.view', 'clients.view']);
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  void _togglePerm(String key) {
    if (_locked) return;
    HapticFeedback.selectionClick();
    setState(() {
      if (_perms.contains(key)) {
        _perms.remove(key);
      } else {
        _perms.add(key);
      }
    });
  }

  void _toggleGroup(v1api.CrmPermissionGroup group, bool selectAll) {
    if (_locked) return;
    HapticFeedback.selectionClick();
    setState(() {
      for (final item in group.items) {
        if (selectAll) {
          _perms.add(item.key);
        } else {
          _perms.remove(item.key);
        }
      }
    });
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.length < 2) {
      _toast('Название роли — хотя бы 2 символа');
      return;
    }
    setState(() => _busy = true);
    try {
      final body = v1api.CrmRoleSaveBody(
        id: widget.role?.id,
        name: name,
        scope: _scope,
        permissions: _perms.toList(),
      );
      final res = widget.onSave != null
          ? await widget.onSave!(body)
          : await v1(context.read<AuthState>().api, (c) => c.crmRoleSave(body: body));
      HapticFeedback.lightImpact();
      _toast(res.message ?? 'Роль сохранена');
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final role = widget.role;
    if (role == null || role.system) return;
    final ok = await confirm(
      context,
      title: 'Удалить роль «${role.name}»?',
      message: role.members > 0 ? 'Сначала переведите сотрудников с этой роли на другую.' : null,
      ok: 'Удалить',
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final res = widget.onDelete != null
          ? await widget.onDelete!(role.id)
          : await v1(context.read<AuthState>().api, (c) => c.crmRoleDelete(roleId: role.id));
      HapticFeedback.lightImpact();
      _toast(res.message ?? 'Роль удалена');
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final role = widget.role;
    final needle = _query.trim().toLowerCase();
    final filtered = [
      for (final g in widget.groups)
        (
          group: g,
          items: [
            for (final item in g.items)
              if ((needle.isEmpty || item.label.toLowerCase().contains(needle) || g.label.toLowerCase().contains(needle)) &&
                  (!_onlyGranted || _perms.contains(item.key)))
                item,
          ],
        ),
    ].where((x) => x.items.isNotEmpty).toList();

    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        title: Text(role?.name ?? 'Новая роль', style: AppText.headline(context)),
        actions: [
          if (role != null && !role.system)
            IconButton(
              icon: Icon(LucideIcons.trash2, size: 20, color: c.danger),
              tooltip: 'Удалить роль',
              onPressed: _busy ? null : _delete,
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
        children: [
          if (role != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (role.system) Tag('системная', fg: c.textMuted, bg: c.border.withValues(alpha: 0.6), icon: LucideIcons.lock),
                  if (role.isOwnRole) Tag('ваша роль', fg: c.brandDeep, bg: c.brand.withValues(alpha: 0.12)),
                  Tag('сотрудников: ${role.members}', fg: c.textMuted, bg: c.surfaceRaised),
                  Tag('выдано ${_perms.length} из ${widget.totalPermissions}', fg: c.violet, bg: c.violetBg),
                ],
              ),
            ),
          if (_locked)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  Icon(LucideIcons.shieldCheck, size: 16, color: c.warn),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'У руководителя всегда все права — его нельзя ограничить.',
                      style: TextStyle(fontSize: 13, color: c.warn, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
          if (!_locked)
            LabeledField(
              label: 'Название роли',
              controller: _name,
              hint: 'Например, «Старший менеджер»',
              capitalization: TextCapitalization.sentences,
            ),
          GroupCard(
            title: 'Что видит',
            padding: const EdgeInsets.only(bottom: 14),
            children: [
              GroupTile(
                icon: LucideIcons.eye,
                iconColor: _scope == 'all' ? c.brand : c.textMuted,
                title: 'Видит всё',
                subtitle: 'Все сделки, чаты и клиентов',
                trailing: Icon(_scope == 'all' ? LucideIcons.circleCheck : LucideIcons.circle, size: 20, color: _scope == 'all' ? c.brand : c.textFaint),
                onTap: _locked ? null : () => setState(() => _scope = 'all'),
              ),
              GroupTile(
                icon: LucideIcons.userCheck,
                iconColor: _scope == 'own' ? c.brand : c.textMuted,
                title: 'Только свои',
                subtitle: 'Где ответственный, плюс неразобранные',
                trailing: Icon(_scope == 'own' ? LucideIcons.circleCheck : LucideIcons.circle, size: 20, color: _scope == 'own' ? c.brand : c.textFaint),
                onTap: _locked ? null : () => setState(() => _scope = 'own'),
              ),
            ],
          ),
          Row(
            children: [
              Expanded(child: Text('Права', style: AppText.headline(context))),
              Text('${_perms.length} из ${widget.totalPermissions}', style: AppText.caption(context)),
            ],
          ),
          const SizedBox(height: 8),
          AppSearchField(
            hint: 'Найти право: «звонки», «скидки»',
            onChanged: (v) => setState(() => _query = v),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: FilterPill(
              label: 'Только выданные',
              selected: _onlyGranted,
              onTap: () => setState(() => _onlyGranted = !_onlyGranted),
            ),
          ),
          const SizedBox(height: 12),
          if (filtered.isEmpty)
            EmptyState(
              icon: LucideIcons.search,
              title: 'Таких прав нет',
              hint: 'Попробуйте другое слово или уберите фильтр.',
              action: 'Сбросить поиск',
              onAction: () => setState(() {
                _query = '';
                _onlyGranted = false;
              }),
            )
          else
            for (final entry in filtered) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 6, 4, 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${entry.group.label} · ${entry.group.items.where((i) => _perms.contains(i.key)).length} из ${entry.group.items.length}',
                        style: AppText.label(context),
                      ),
                    ),
                    if (!_locked)
                      GestureDetector(
                        onTap: () {
                          final allOn = entry.group.items.every((i) => _perms.contains(i.key));
                          _toggleGroup(entry.group, !allOn);
                        },
                        child: Text(
                          entry.group.items.every((i) => _perms.contains(i.key)) ? 'Снять все' : 'Выбрать все',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.brandDeep),
                        ),
                      ),
                  ],
                ),
              ),
              GroupCard(
                padding: const EdgeInsets.only(bottom: 10),
                children: [
                  for (final item in entry.items)
                    GroupTile(
                      title: item.label,
                      trailing: Switch.adaptive(
                        value: _perms.contains(item.key),
                        activeTrackColor: c.brand,
                        onChanged: _locked ? null : (_) => _togglePerm(item.key),
                      ),
                      onTap: _locked ? null : () => _togglePerm(item.key),
                    ),
                ],
              ),
            ],
        ],
      ),
      bottomNavigationBar: _locked
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: PrimaryButton(
                  label: role != null ? 'Сохранить права' : 'Создать роль',
                  icon: LucideIcons.check,
                  busy: _busy,
                  onPressed: _save,
                ),
              ),
            ),
    );
  }
}
