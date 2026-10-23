import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../screens/calls_screen.dart';
import '../screens/chats_screen.dart';
import '../screens/clients_screen.dart';
import '../screens/deals_screen.dart';
import '../screens/orders_screen.dart';
import '../screens/overview_screen.dart';
import '../screens/tasks_screen.dart';
import 'auth.dart';

/// Раздел приложения: подпись, значок, право, без которого его нет, и сам экран.
class AppSection {
  const AppSection(this.key, this.label, this.icon, this.allowed, this.page);
  final String key;
  final String label;
  final IconData icon;
  final bool Function(Staff) allowed;
  final Widget Function() page;
}

/// Все разделы приложения. Какие из них — вкладки, решает раскладка роли; остальные доступны из «Профиля» / «Ещё».
final appSections = <String, AppSection>{
  'overview': AppSection('overview', 'Обзор', LucideIcons.chartNoAxesColumn, (s) => s.can('analytics.view'), () => const OverviewScreen()),
  'chats': AppSection('chats', 'Чаты', LucideIcons.messageCircle, (s) => s.can('chats.view'), () => const ChatsScreen()),
  'tasks': AppSection('tasks', 'Задачи', LucideIcons.squareCheck, (_) => true, () => const TasksScreen()),
  'deals': AppSection('deals', 'Сделки', LucideIcons.handshake, (s) => s.can('deals.view'), () => const DealsScreen()),
  'clients': AppSection('clients', 'Клиенты', LucideIcons.users, (s) => s.can('clients.view'), () => const ClientsScreen()),
  'orders': AppSection('orders', 'Заказы', LucideIcons.package, (s) => s.can('orders.view'), () => const OrdersScreen()),
  'calls': AppSection('calls', 'Звонки', LucideIcons.phone, (s) => s.can('calls.view'), () => const CallsScreen()),
};

/// Вкладки нижней панели по раскладке роли (до «Профиля», он всегда последний). Недоступные по правам отбрасываются.
const _tabs = <String, List<String>>{
  // Руководитель: цифры, переписка, сделки и производство — остальное в «Ещё».
  'leader': ['overview', 'chats', 'deals', 'orders'],
  // Продажи: рабочий день менеджера.
  'sales': ['chats', 'tasks', 'deals', 'clients'],
  // Производство: доска заказов и свои задачи.
  'production': ['orders', 'tasks', 'clients'],
  // Аналитика: цифры и производство.
  'analyst': ['overview', 'orders'],
  // Поддержка: только переписка.
  'support': ['chats', 'tasks', 'clients'],
  'basic': ['tasks'],
};

/// Раскладка: ключи вкладок по порядку и подпись последней («Ещё» у руководителя, «Профиль» у остальных).
({List<String> tabs, String profileLabel}) layoutFor(Staff staff) {
  final keys = (_tabs[staff.layout] ?? _tabs['sales']!).where((k) => appSections[k]!.allowed(staff)).toList();
  if (keys.isEmpty) keys.add('tasks');
  return (tabs: keys, profileLabel: staff.layout == 'leader' ? 'Ещё' : 'Профиль');
}

/// Разделы, которых нет во вкладках, но по правам доступны: показываются списком в «Профиле» / «Ещё».
List<AppSection> extraSections(Staff staff) {
  final inTabs = layoutFor(staff).tabs.toSet();
  return [
    for (final s in appSections.values)
      if (!inTabs.contains(s.key) && s.allowed(staff)) s,
  ];
}

const layoutTitles = {'leader': 'Руководитель', 'sales': 'Продажи', 'production': 'Производство', 'analyst': 'Аналитика', 'support': 'Поддержка', 'basic': 'Сотрудник'};
