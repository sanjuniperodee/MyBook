import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../core/notifier.dart';
import '../ui/avatar.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Профиль сотрудника: кто вошёл, уведомления, сервер и выход.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final staff = auth.staff!;
    final notifier = context.read<Notifier>();
    final c = context.c;
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: c.surface,
      body: ListView(
        physics: const BouncingScrollPhysics(),
        padding: EdgeInsets.only(top: top + 10, bottom: 100),
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 16), child: Text('Профиль', style: AppText.largeTitle(context))),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
            child: Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Rd.lg), border: Border.all(color: c.border, width: 0.6)),
              child: Row(children: [
                AppAvatar(name: staff.name, size: 64),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(staff.name, style: AppText.title(context)),
                    const SizedBox(height: 2),
                    Text(staff.role, style: AppText.sub(context)),
                    Text(staff.email, style: AppText.caption(context)),
                  ]),
                ),
              ]),
            ),
          ),
          GroupCard(title: 'Уведомления', children: [
            GroupTile(
              icon: LucideIcons.bellRing,
              title: 'Сообщения и напоминания',
              subtitle: 'Сообщения, сроки задач, новые заявки',
              trailing: Switch.adaptive(
                value: notifier.enabled,
                activeTrackColor: c.brand,
                onChanged: (v) async {
                  await notifier.setEnabled(v);
                  setState(() {});
                },
              ),
            ),
            GroupTile(icon: LucideIcons.smartphone, title: 'Непрочитанных в CRM', trailing: ValueListenableBuilder<int>(valueListenable: notifier.unreadListenable, builder: (_, n, _) => Text('$n', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.textMuted)))),
          ]),
          GroupCard(title: 'Работа', children: [
            GroupTile(
              icon: staff.onShift ? LucideIcons.briefcase : LucideIcons.briefcaseBusiness,
              title: 'На смене',
              subtitle: staff.onShift ? 'Новые заявки распределяются вам' : 'Заявки вам не приходят',
              trailing: Switch.adaptive(
                value: staff.onShift,
                activeTrackColor: c.brand,
                onChanged: (v) async {
                  setState(() => staff.onShift = v);
                  try {
                    await auth.api.post('/api/mobile/me/shift', body: {'onShift': v});
                  } on ApiException catch (e) {
                    setState(() => staff.onShift = !v);
                    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                  }
                },
              ),
            ),
            GroupTile(icon: LucideIcons.server, iconColor: c.textMuted, title: 'Сервер', subtitle: auth.server),
          ]),
          GroupCard(children: [
            GroupTile(
              icon: LucideIcons.logOut,
              title: 'Выйти из аккаунта',
              destructive: true,
              onTap: () async {
                if (await confirm(context, title: 'Выйти из аккаунта?', ok: 'Выйти', destructive: true)) await auth.logout();
              },
            ),
          ]),
        ],
      ),
    );
  }
}
