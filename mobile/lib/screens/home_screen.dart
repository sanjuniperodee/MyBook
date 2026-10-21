import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/auth.dart';
import '../core/chats_store.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'chats_screen.dart';
import 'deals_screen.dart';
import 'profile_screen.dart';

/// Три раздела с нижней панелью: «Чаты», «Сделки», «Профиль». Панель полупрозрачная, как в iOS.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final staff = context.watch<AuthState>().staff!;
    final unread = context.watch<ChatsStore>().unreadChats;
    final c = context.c;
    final showDeals = staff.can('deals.view');
    final tabs = <Widget>[const ChatsScreen(), if (showDeals) const DealsScreen(), const ProfileScreen()];
    final items = <_TabItem>[
      _TabItem('Чаты', LucideIcons.messageCircle, badge: unread),
      if (showDeals) const _TabItem('Сделки', LucideIcons.handshake),
      const _TabItem('Профиль', LucideIcons.user),
    ];
    final index = _tab.clamp(0, tabs.length - 1);
    return Scaffold(
      backgroundColor: c.bg,
      extendBody: true,
      body: IndexedStack(index: index, children: tabs),
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
                  for (var i = 0; i < items.length; i++)
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          if (i != index) HapticFeedback.selectionClick();
                          setState(() => _tab = i);
                        },
                        child: _TabButton(item: items[i], active: i == index),
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
  const _TabItem(this.label, this.icon, {this.badge = 0});
  final String label;
  final IconData icon;
  final int badge;
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
        if (item.badge > 0) Positioned(right: -14, top: -6, child: CountBadge(item.badge)),
      ]),
      const SizedBox(height: 3),
      Text(item.label, style: TextStyle(fontSize: 11, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: color, letterSpacing: -0.1)),
    ]);
  }
}
