import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'client/data/session.dart';
import 'client/screens/client_login_screen.dart';
import 'client/screens/client_home.dart';
import 'ui/tokens.dart';

/// Клиентское приложение «MyBooks» (flavor client, mobile/CLIENT-APP.md): автор пишет книгу с телефона.
/// Сборка: flutter run --flavor client -t lib/main_client.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  final session = ClientSession();
  await session.restore();
  runApp(ChangeNotifierProvider.value(value: session, child: const ClientApp()));
}

class ClientApp extends StatelessWidget {
  const ClientApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MyBooks',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light, client: true),
      darkTheme: buildTheme(Brightness.dark, client: true),
      locale: const Locale('ru'),
      supportedLocales: const [Locale('ru')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      home: const _Root(),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    return switch (context.watch<ClientSession>().status) {
      ClientStatus.loading => Scaffold(backgroundColor: context.c.bg, body: const Center(child: CircularProgressIndicator())),
      ClientStatus.loggedOut => const ClientLoginScreen(),
      ClientStatus.loggedIn => const ClientHome(),
    };
  }
}
