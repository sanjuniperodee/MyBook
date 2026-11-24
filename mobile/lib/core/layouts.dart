import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../screens/boards/boards_screen.dart';
import '../screens/calls_screen.dart';
import '../screens/chats_screen.dart';
import '../screens/clients_screen.dart';
import '../screens/deals_screen.dart';
import '../screens/orders_screen.dart';
import '../screens/overview_screen.dart';
import '../screens/tasks_screen.dart';
import '../screens/tickets_screen.dart';
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
  // Доски задач (как «Задачи → Доски» в CRM) и календарь задач — API v1 boards.
  // Обращения в поддержку (свои; руководителю — все) — API v1 crmSupport*.
  'support': AppSection('support', 'Обращения', LucideIcons.lifeBuoy, (_) => true, () => const TicketsScreen()),
  'boards': AppSection('boards', 'Доски задач', LucideIcons.squareKanban, (_) => true, () => const BoardsScreen()),
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

/// Раздел CRM, которого нет в приложении экраном: открывается во встроенном браузере (тот же вход и права, что на сайте).
class CrmWebSection {
  const CrmWebSection(this.group, this.path, this.label, this.icon, [this.perms = const []]);
  final String group;
  final String path;
  final String label;
  final IconData icon;

  /// Хотя бы одно из прав (как `perm` в боковой панели CRM, AdminNav.tsx); пусто — всем сотрудникам.
  final List<String> perms;
  bool allowed(Staff s) => perms.isEmpty || perms.any(s.can);
}

/// Боковая панель CRM (src/components/admin/AdminNav.tsx) без разделов, которые в приложении есть экранами.
const crmWebSections = <CrmWebSection>[
  CrmWebSection('Продажи', '/admin/deals', 'Воронка (доска и фильтры)', LucideIcons.kanban, ['deals.view']),
  CrmWebSection('Продажи', '/admin/catalog', 'Каталог WhatsApp', LucideIcons.shoppingBag, ['catalog.manage']),
  CrmWebSection('Выпуск', '/admin/board', 'Канбан заказов', LucideIcons.kanban, ['orders.view']),
  CrmWebSection('Выпуск', '/admin/books', 'Книги', LucideIcons.bookOpen, ['clients.view']),
  CrmWebSection('Деньги', '/admin/finance', 'Финансы', LucideIcons.wallet, ['analytics.view']),
  CrmWebSection('Деньги', '/admin/expenses', 'Расходы', LucideIcons.receiptText, ['finance.view']),
  CrmWebSection('Деньги', '/admin/profit', 'Прибыль', LucideIcons.trendingUp, ['finance.view']),
  CrmWebSection('Деньги', '/admin/sales', 'Реестр продаж', LucideIcons.scrollText, ['analytics.view']),
  CrmWebSection('Деньги', '/admin/analytics', 'Аналитика продаж', LucideIcons.chartColumn, ['analytics.view']),
  CrmWebSection('Деньги', '/admin/leads', 'Статистика лидов', LucideIcons.activity, ['analytics.view']),
  CrmWebSection('Маркетинг', '/admin/marketing', 'Ссылки и каналы', LucideIcons.link2, ['analytics.view', 'promo.manage']),
  CrmWebSection('Маркетинг', '/admin/promo', 'Промокоды', LucideIcons.tag, ['promo.manage']),
  CrmWebSection('Маркетинг', '/admin/gifts', 'Сертификаты', LucideIcons.gift, ['gifts.manage']),
  CrmWebSection('Маркетинг', '/admin/reviews', 'Отзывы', LucideIcons.star, ['reviews.manage']),
  CrmWebSection('Маркетинг', '/admin/ai-designer', 'ИИ-дизайнер', LucideIcons.sparkles, ['analytics.view']),
  CrmWebSection('Настройки', '/admin/automations', 'Автоматизации', LucideIcons.workflow, ['settings.manage']),
  CrmWebSection('Настройки', '/admin/pricing', 'Цены и тарифы', LucideIcons.coins, ['settings.manage']),
  CrmWebSection('Настройки', '/admin/site', 'Сайт', LucideIcons.globe, ['settings.manage']),
  CrmWebSection('Настройки', '/admin/settings', 'Интеграции', LucideIcons.settings, ['settings.manage']),
  CrmWebSection('Настройки', '/admin/ai-limits', 'Лимиты AI', LucideIcons.gauge, ['settings.manage']),
  CrmWebSection('Настройки', '/admin/team', 'Команда', LucideIcons.shieldCheck, ['team.manage']),
  CrmWebSection('Настройки', '/admin/security', 'Безопасность', LucideIcons.lockKeyhole),
];
