import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/auth.dart';
import '../core/chats_store.dart';
import '../core/layouts.dart';
import '../core/nav.dart';
import '../core/tasks_store.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'profile_screen.dart';

/// Разделы с нижней панелью. Набор вкладок зависит от роли (core/layouts.dart): у руководителя «Обзор», чаты, сделки и
/// заказы; у продаж чаты, задачи, сделки и клиенты; у производства заказы и задачи; у поддержки переписка. Остальное по
/// правам — в «Профиле» / «Ещё». Панель полупрозрачная, как в iOS.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String? _tab;

  @override
  void initState() {
    super.initState();
    tabRequest.addListener(_onRequest);
  }

  @override
  void dispose() {
    tabRequest.removeListener(_onRequest);
    super.dispose();
  }

  void _onRequest() {
    final t = tabRequest.value;
    if (t == null) return;
    tabRequest.value = null;
    final staff = context.read<AuthState>().staff;
    // Раздела нет во вкладках этой роли (уведомление про чат у производства, «горит» у руководителя) — открываем поверх.
    if (staff != null && !layoutFor(staff).tabs.contains(t) && t != 'profile') {
      final section = appSections[t];
      if (section != null && section.allowed(staff)) {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SectionPage(section: section)));
        return;
      }
    }
    setState(() => _tab = t);
  }

  @override
  Widget build(BuildContext context) {
    final staff = context.watch<AuthState>().staff!;
    final unread = context.watch<ChatsStore>().unreadChats;
    final tasks = context.watch<TasksStore>();
    final c = context.c;
    final layout = layoutFor(staff);
    final entries = <({String key, _TabItem item, Widget page})>[
      for (final k in layout.tabs)
        (
          key: k,
          item: _TabItem(
            appSections[k]!.label,
            appSections[k]!.icon,
            badge: k == 'chats' ? unread : (k == 'tasks' ? tasks.badge : 0),
            badgeColor: k == 'tasks' && tasks.overdueCount > 0 ? c.danger : null,
          ),
          page: appSections[k]!.page(),
        ),
      (key: 'profile', item: _TabItem(layout.profileLabel, layout.profileLabel == 'Ещё' ? LucideIcons.ellipsis : LucideIcons.user), page: const ProfileScreen()),
    ];
    var index = entries.indexWhere((e) => e.key == _tab);
    if (index < 0) index = 0;
    return Scaffold(
      backgroundColor: c.bg,
      extendBody: true,
      body: IndexedStack(index: index, children: [for (final e in entries) e.page]),
      bottomNavigationBar: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          child: Container(
            decoration: BoxDecoration(
              color: c.bg.withValues(alpha: 0.86),
              border: Border(top: BorderSide(color: c.border, width: 0.6)),
            ),
            child: SafeArea(
              top: false,
              child: SizedBox(
                height: 58,
                child: Row(
                  children: [
                    for (var i = 0; i < entries.length; i++)
                      Expanded(
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            if (i != index) HapticFeedback.selectionClick();
                            setState(() => _tab = entries[i].key);
                          },
                          child: _TabButton(item: entries[i].item, active: i == index),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TabItem {
  const _TabItem(this.label, this.icon, {this.badge = 0, this.badgeColor});
  final String label;
  final IconData icon;
  final int badge;
  final Color? badgeColor;
}

class _TabButton extends StatelessWidget {
  const _TabButton({required this.item, required this.active});
  final _TabItem item;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final color = active ? c.brandDeep : c.textFaint;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            AnimatedScale(
              scale: active ? 1.08 : 1,
              duration: const Duration(milliseconds: 160),
              child: Icon(item.icon, size: 25, color: color),
            ),
            if (item.badge > 0) Positioned(right: -14, top: -6, child: CountBadge(item.badge, color: item.badgeColor)),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          item.label,
          style: TextStyle(fontSize: 11, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: color, letterSpacing: -0.1),
        ),
      ],
    );
  }
}

/// Раздел, открытый поверх вкладок (из «Профиля» / «Ещё» или по уведомлению): тонкая шапка с «назад» над экраном раздела.
class SectionPage extends StatelessWidget {
  const SectionPage({super.key, required this.section});
  final AppSection section;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        toolbarHeight: 48,
        leading: RoundIconButton(icon: LucideIcons.chevronLeft, iconSize: 28, color: c.brandDeep, onTap: () => Navigator.of(context).maybePop()),
      ),
      // У экранов разделов свой большой заголовок и отступ под статус-баром — шапка уже занимает это место.
      body: MediaQuery.removePadding(context: context, removeTop: true, child: section.page()),
    );
  }
}
