import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/cabinet.dart';
import 'order_screen.dart';
import 'shelf_screen.dart';

/// Кабинет на телефоне: нижняя панель «Мои книги», «Заказы», «Аккаунт» (как MobileNav кабинета сайта).
class ClientHome extends StatefulWidget {
  const ClientHome({super.key});

  @override
  State<ClientHome> createState() => _ClientHomeState();
}

class _ClientHomeState extends State<ClientHome> {
  int _tab = 0;
  // Вкладку заказов пересоздаём при каждом входе — статус и оплата всегда свежие.
  int _ordersKey = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _tab, children: [
        const ShelfScreen(),
        OrdersScreen(key: ValueKey(_ordersKey)),
        const _Account(),
      ]),
      bottomNavigationBar: CabinetTabBar(
        index: _tab,
        onTap: (i) => setState(() {
          if (i == 1 && _tab != 1) _ordersKey++;
          _tab = i;
        }),
      ),
    );
  }
}

/// Аккаунт: кто вошёл и выход (правка профиля, пароль и язык — на сайте, следующим выпуском).
class _Account extends StatelessWidget {
  const _Account();

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final session = context.watch<ClientSession>();
    final u = session.user;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const CabinetTopBar(title: 'Аккаунт'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 32), children: [
        Text(u?.name ?? '', style: AppText.serif(context, size: 30, weight: FontWeight.w500)),
        if ((u?.phone ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(u!.phone, style: TextStyle(fontSize: 15.5, color: c.textMuted))),
        const SizedBox(height: 28),
        CabinetButton(
          label: 'Выйти',
          icon: LucideIcons.logOut,
          kind: CabBtn.outline,
          onPressed: () async {
            if (await confirm(context, title: 'Выйти из аккаунта?', message: 'Несохранённые без сети ответы на этом телефоне пропадут.', ok: 'Выйти', destructive: true)) await session.logout();
          },
        ),
      ]),
    );
  }
}
