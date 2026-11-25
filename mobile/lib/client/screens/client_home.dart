import 'package:flutter/material.dart';

import '../ui/cabinet.dart';
import 'account_screen.dart';
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
      body: IndexedStack(
        index: _tab,
        children: [
          const ShelfScreen(),
          OrdersScreen(key: ValueKey(_ordersKey)),
          const AccountScreen(),
        ],
      ),
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
