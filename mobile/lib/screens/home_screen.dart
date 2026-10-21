import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/auth.dart';
import '../core/chats_store.dart';
import '../core/nav.dart';
import '../core/tasks_store.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'chats_screen.dart';
import 'clients_screen.dart';
import 'deals_screen.dart';
import 'profile_screen.dart';
import 'tasks_screen.dart';

/// Разделы с нижней панелью: «Чаты», «Задачи», «Сделки», «Клиенты», «Профиль» (по правам). Панель полупрозрачная, как в iOS.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _tab = 'chats';

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
    setState(() => _tab = t);
  }

  @override
  Widget build(BuildContext context) {
    final staff = context.watch<AuthState>().staff!;
    final unread = context.watch<ChatsStore>().unreadChats;
    final tasks = context.watch<TasksStore>();
    final c = context.c;
    final entries = <({String key, _TabItem item, Widget page})>[
      (key: 'chats', item: _TabItem('Чаты', LucideIcons.messageCircle, badge: unread), page: const ChatsScreen()),
      (key: 'tasks', item: _TabItem('Задачи', LucideIcons.squareCheck, badge: tasks.badge, badgeColor: tasks.overdueCount > 0 ? c.danger : null), page: const TasksScreen()),
      if (staff.can('deals.view')) (key: 'deals', item: const _TabItem('Сделки', LucideIcons.handshake), page: const DealsScreen()),
      if (staff.can('clients.view')) (key: 'clients', item: const _TabItem('Клиенты', LucideIcons.users), page: const ClientsScreen()),
      (key: 'profile', item: const _TabItem('Профиль', LucideIcons.user), page: const ProfileScreen()),
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
            decoration: BoxDecoration(color: c.bg.withValues(alpha: 0.86), border: Border(top: BorderSide(color: c.border, width: 0.6))),
            child: SafeArea(
              top: false,
              child: SizedBox(
                height: 58,
                child: Row(children: [
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
                ]),
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
    return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Stack(clipBehavior: Clip.none, children: [
        AnimatedScale(scale: active ? 1.08 : 1, duration: const Duration(milliseconds: 160), child: Icon(item.icon, size: 25, color: color)),
        if (item.badge > 0) Positioned(right: -14, top: -6, child: CountBadge(item.badge, color: item.badgeColor)),
      ]),
      const SizedBox(height: 3),
      Text(item.label, style: TextStyle(fontSize: 11, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: color, letterSpacing: -0.1)),
    ]);
  }
}
