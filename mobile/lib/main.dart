import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'core/auth.dart';
import 'core/chats_store.dart';
import 'core/live.dart';
import 'core/nav.dart';
import 'core/notifications_store.dart';
import 'core/notifier.dart';
import 'core/tasks_store.dart';
import 'core/templates_store.dart';
import 'core/theme_controller.dart';
import 'screens/chat_screen.dart';
import 'screens/client_screen.dart';
import 'screens/deal_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'ui/tokens.dart';

final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  final auth = AuthState();
  await auth.restore();
  final theme = ThemeController();
  await theme.restore();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: theme),
      ],
      child: const SellerApp(),
    ),
  );
}

class SellerApp extends StatelessWidget {
  const SellerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MyBooks CRM',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: context.watch<ThemeController>().mode,
      locale: const Locale('ru'),
      supportedLocales: const [Locale('ru')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      // Рабочее пространство — над навигатором: экраны, открытые поверх вкладок (чат, сделка), видят те же провайдеры.
      builder: (context, child) => WorkspaceScope(child: child ?? const SizedBox.shrink()),
      home: const _Root(),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    switch (context.watch<AuthState>().status) {
      case AuthStatus.loading:
        return Scaffold(
          backgroundColor: context.c.bg,
          body: const Center(child: CircularProgressIndicator()),
        );
      case AuthStatus.loggedOut:
        return const LoginScreen();
      case AuthStatus.loggedIn:
        return const HomeScreen();
    }
  }
}

/// Поток событий CRM, список диалогов и уведомления живут, пока сотрудник вошёл.
class WorkspaceScope extends StatefulWidget {
  const WorkspaceScope({super.key, required this.child});
  final Widget child;

  @override
  State<WorkspaceScope> createState() => _WorkspaceScopeState();
}

class _WorkspaceScopeState extends State<WorkspaceScope> {
  LiveService? _live;
  ChatsStore? _chats;
  Notifier? _notifier;
  TasksStore? _tasks;
  NotificationsStore? _inbox;
  TemplatesStore? _templates;

  void _sync(AuthState auth) {
    final loggedIn = auth.status == AuthStatus.loggedIn;
    if (loggedIn && _live == null) {
      final live = LiveService(auth.api)..start();
      final chats = ChatsStore(auth.api, live)..load();
      final notifier = Notifier(api: auth.api, live: live, navigatorKey: navigatorKey, onOpen: _open)..init();
      final tasks = TasksStore(auth.api, live, notifier, myId: auth.staff!.id)..load();
      final inbox = NotificationsStore(auth.api, live);
      notifier.unreadListenable.addListener(() => auth.refreshMe());
      _live = live;
      _chats = chats;
      _notifier = notifier;
      _tasks = tasks;
      _inbox = inbox;
      _templates = TemplatesStore(auth.api)..load();
    } else if (!loggedIn && _live != null) {
      _teardown();
    }
  }

  void _open(NotificationTarget t) {
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    if (t.chatId != null) nav.push(MaterialPageRoute<void>(builder: (_) => ChatScreen(chatId: t.chatId!)));
    if (t.dealId != null) nav.push(MaterialPageRoute<void>(builder: (_) => DealScreen(dealId: t.dealId!)));
    if (t.clientId != null) nav.push(MaterialPageRoute<void>(builder: (_) => ClientScreen(clientId: t.clientId!)));
    if (t.tab != null) {
      nav.popUntil((r) => r.isFirst);
      tabRequest.value = t.tab;
    }
  }

  void _teardown() {
    _notifier?.dispose();
    _tasks?.dispose();
    _inbox?.dispose();
    _templates?.dispose();
    _chats?.dispose();
    _live?.stop();
    _live = null;
    _chats = null;
    _notifier = null;
    _tasks = null;
    _inbox = null;
    _templates = null;
  }

  @override
  void dispose() {
    _teardown();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    _sync(auth);
    if (_live == null) return widget.child;
    return MultiProvider(
      providers: [
        Provider<LiveService>.value(value: _live!),
        Provider<Notifier>.value(value: _notifier!),
        ChangeNotifierProvider<ChatsStore>.value(value: _chats!),
        ChangeNotifierProvider<TasksStore>.value(value: _tasks!),
        ChangeNotifierProvider<NotificationsStore>.value(value: _inbox!),
        ChangeNotifierProvider<TemplatesStore>.value(value: _templates!),
      ],
      child: widget.child,
    );
  }
}
