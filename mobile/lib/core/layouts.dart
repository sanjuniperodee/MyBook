import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../screens/boards/boards_screen.dart';
import '../screens/books_screen.dart';
import '../screens/calls_screen.dart';
import '../screens/catalog_screen.dart';
import '../screens/chats_screen.dart';
import '../screens/clients_screen.dart';
import '../screens/deals_screen.dart';
import '../screens/money/expenses_screen.dart';
import '../screens/marketing/design_ai_screen.dart';
import '../screens/marketing/gifts_screen.dart';
import '../screens/marketing/links_screen.dart';
import '../screens/marketing/promos_screen.dart';
import '../screens/marketing/reviews_screen.dart';
import '../screens/money/analytics_screen.dart';
import '../screens/money/finance_screen.dart';
import '../screens/money/lead_stats_screen.dart';
import '../screens/money/profit_screen.dart';
import '../screens/money/sales_register_screen.dart';
import '../screens/orders_screen.dart';
import '../screens/settings/pricing_screen.dart';
import '../screens/settings/reply_templates_screen.dart';
import '../screens/settings/roles_screen.dart';
import '../screens/settings/sales_settings_screen.dart';
import '../screens/settings/site_settings_screen.dart';
import '../screens/settings/team_screen.dart';
import '../screens/settings/two_factor_screen.dart';
import '../screens/overview_screen.dart';
import '../screens/tasks_screen.dart';
import '../screens/tickets_screen.dart';
import 'auth.dart';

/// Раздел приложения: подпись, значок, право, без которого его нет, и сам экран.
class AppSection {
  const AppSection(this.key, this.label, this.icon, this.allowed, this.page, {this.group});
  final String key;
  /// Группа в «Профиле» / «Ещё» рядом с разделами CRM той же группы («Деньги», «Маркетинг»…); null — «Разделы».
  final String? group;
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
  // Каталог WhatsApp — API v1 crmCatalog.
  'catalog': AppSection('catalog', 'Каталог WhatsApp', LucideIcons.shoppingBag, (s) => s.can('catalog.manage'), () => const CatalogScreen(), group: 'Продажи'),
  // Книги клиентов — API v1 crmBooks.
  'books': AppSection('books', 'Книги', LucideIcons.bookOpen, (s) => s.can('clients.view'), () => const BooksScreen(), group: 'Выпуск'),
  // Деньги — API v1 crmFinance / crmExpenses / crmProfit (те же модели экранов, что на сайте).
  'finance': AppSection('finance', 'Финансы', LucideIcons.wallet, (s) => s.can('analytics.view'), () => const FinanceScreen(), group: 'Деньги'),
  'expenses': AppSection('expenses', 'Расходы', LucideIcons.receiptText, (s) => s.can('finance.view'), () => const ExpensesScreen(), group: 'Деньги'),
  'profit': AppSection('profit', 'Прибыль', LucideIcons.trendingUp, (s) => s.can('finance.view'), () => const ProfitScreen(), group: 'Деньги'),
  // Отчёты руководителя — API v1 crmSalesRegister / crmAnalytics / crmLeadStats.
  'register': AppSection('register', 'Реестр продаж', LucideIcons.scrollText, (s) => s.can('analytics.view'), () => const SalesRegisterScreen(), group: 'Деньги'),
  'analytics': AppSection('analytics', 'Аналитика продаж', LucideIcons.chartColumn, (s) => s.can('analytics.view'), () => const AnalyticsScreen(), group: 'Деньги'),
  // Маркетинг — API v1 crmPromos / crmGifts / crmReviews.
  'links': AppSection('links', 'Ссылки и каналы', LucideIcons.link2, (s) => s.can('analytics.view') || s.can('promo.manage'), () => const LinksScreen(), group: 'Маркетинг'),
  'promos': AppSection('promos', 'Промокоды', LucideIcons.tag, (s) => s.can('promo.manage'), () => const PromosScreen(), group: 'Маркетинг'),
  'gifts': AppSection('gifts', 'Сертификаты', LucideIcons.gift, (s) => s.can('gifts.manage'), () => const GiftsScreen(), group: 'Маркетинг'),
  'designAi': AppSection('designAi', 'ИИ-дизайнер', LucideIcons.sparkles, (s) => s.can('analytics.view'), () => const DesignAiScreen(), group: 'Маркетинг'),
  'reviews': AppSection('reviews', 'Отзывы', LucideIcons.star, (s) => s.can('reviews.manage'), () => const ReviewsScreen(), group: 'Маркетинг'),
  // Настройки отдела продаж и режим AI-продажника — API v1 crmSettingsSales; остальные настройки — страницами CRM.
  'salesSettings': AppSection('salesSettings', 'Отдел продаж', LucideIcons.slidersHorizontal, (s) => s.can('settings.manage'), () => const SalesSettingsScreen(), group: 'Настройки'),
  'replyTemplates': AppSection('replyTemplates', 'Общие шаблоны ответов', LucideIcons.messageSquareText, (s) => s.can('settings.manage'), () => const ReplyTemplatesScreen(), group: 'Настройки'),
  'pricing': AppSection('pricing', 'Цены и тарифы', LucideIcons.coins, (s) => s.can('settings.manage'), () => const PricingScreen(), group: 'Настройки'),
  'site': AppSection('site', 'Сайт', LucideIcons.globe, (s) => s.can('settings.manage'), () => const SiteSettingsScreen(), group: 'Настройки'),
  'team': AppSection('team', 'Команда', LucideIcons.shieldCheck, (s) => s.can('team.manage'), () => const TeamScreen(), group: 'Настройки'),
  'roles': AppSection('roles', 'Роли и права', LucideIcons.keyRound, (s) => s.can('team.manage'), () => const RolesScreen(), group: 'Настройки'),
  'security': AppSection('security', 'Безопасность (2FA)', LucideIcons.lockKeyhole, (_) => true, () => const TwoFactorScreen(), group: 'Настройки'),
  'leads': AppSection('leads', 'Статистика лидов', LucideIcons.activity, (s) => s.can('analytics.view'), () => const LeadStatsScreen(), group: 'Деньги'),
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
      if (!inTabs.contains(s.key) && s.group == null && s.allowed(staff)) s,
  ];
}

/// Разделы приложения своей группы («Деньги»…) — в «Профиле» / «Ещё» над разделами CRM той же группы.
List<AppSection> groupSections(Staff staff, String group) => [
      for (final s in appSections.values)
        if (s.group == group && s.allowed(staff)) s,
    ];

/// Порядок групп — как в боковой панели CRM.
const _groupOrder = ['Сегодня', 'Продажи', 'Выпуск', 'Деньги', 'Маркетинг', 'Настройки'];

/// Группы «Профиля» / «Ещё» по порядку боковой панели CRM: разделы приложения с группой и разделы CRM.
List<String> sectionGroups(Staff staff) {
  final groups = {
    for (final w in crmWebSections)
      if (w.allowed(staff)) w.group,
    for (final s in appSections.values)
      if (s.group != null && s.allowed(staff)) s.group!,
  }.toList();
  int rank(String g) => _groupOrder.contains(g) ? _groupOrder.indexOf(g) : _groupOrder.length;
  groups.sort((a, b) => rank(a).compareTo(rank(b)));
  return groups;
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
  CrmWebSection('Настройки', '/admin/automations', 'Автоматизации', LucideIcons.workflow, ['settings.manage']),
  CrmWebSection('Настройки', '/admin/settings', 'Интеграции', LucideIcons.settings, ['settings.manage']),
  CrmWebSection('Настройки', '/admin/ai-limits', 'Лимиты AI', LucideIcons.gauge, ['settings.manage']),
];
