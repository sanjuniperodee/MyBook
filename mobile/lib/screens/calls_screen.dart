import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../core/contact_actions.dart';
import '../core/format.dart';
import '../models/work.dart';
import '../ui/avatar.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Журнал звонков: пропущенные сверху (перезвонить в одно касание и отметить «обработан»), входящие, исходящие.
class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key});

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  String _f = 'missed';
  List<CallItem>? _calls;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await context.read<AuthState>().api.get('/api/mobile/calls', query: {'f': _f, 'days': '14'}) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _calls = [for (final c in (r['calls'] as List)) CallItem.fromJson(c as Map<String, dynamic>)];
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _select(String f) {
    setState(() {
      _f = f;
      _calls = null;
    });
    _load();
  }

  Future<void> _handled(CallItem call) async {
    setState(() => call.handled = true);
    try {
      await context.read<AuthState>().api.post('/api/mobile/calls/${call.id}/handled');
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => call.handled = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final calls = _calls;
    return Scaffold(
      backgroundColor: c.surface,
      body: Column(children: [
        Container(
          decoration: BoxDecoration(color: c.bg, border: Border(bottom: BorderSide(color: c.border, width: 0.6))),
          child: SafeArea(
            bottom: false,
            child: Column(children: [
              SizedBox(
                height: 52,
                child: Row(children: [
                  RoundIconButton(icon: LucideIcons.chevronLeft, size: 44, iconSize: 28, color: c.brandDeep, onTap: () => Navigator.of(context).maybePop()),
                  Expanded(child: Text('Звонки', style: AppText.headline(context))),
                ]),
              ),
              SizedBox(
                height: 36,
                child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16), children: [
                  for (final e in const {'missed': 'Пропущенные', 'all': 'Все', 'in': 'Входящие', 'out': 'Исходящие', 'mine': 'Мои'}.entries)
                    Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: e.value, selected: _f == e.key, onTap: () => _select(e.key))),
                ]),
              ),
              const SizedBox(height: 10),
            ]),
          ),
        ),
        Expanded(
          child: calls == null
              ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: _error, action: 'Повторить', onAction: _load) : const ChatListSkeleton(rows: 7))
              : calls.isEmpty
                  ? EmptyState(icon: LucideIcons.phone, title: _f == 'missed' ? 'Пропущенных нет' : 'Звонков нет', hint: 'За последние 14 дней')
                  : RefreshIndicator(
                      onRefresh: _load,
                      color: c.brand,
                      child: ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.only(bottom: 30),
                        itemCount: calls.length,
                        separatorBuilder: (_, _) => Divider(indent: 78, color: c.border),
                        itemBuilder: (_, i) => _CallRow(call: calls[i], onHandled: () => _handled(calls[i])),
                      ),
                    ),
        ),
      ]),
    );
  }
}

class _CallRow extends StatelessWidget {
  const _CallRow({required this.call, required this.onHandled});
  final CallItem call;
  final VoidCallback onHandled;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final missed = call.missedIncoming;
    final icon = missed ? LucideIcons.phoneMissed : call.direction == 'out' ? LucideIcons.phoneOutgoing : LucideIcons.phoneIncoming;
    final tone = missed && !call.handled ? c.danger : c.textMuted;
    final title = call.name ?? call.phone ?? 'Неизвестный номер';
    final canCall = call.phone != null || context.read<AuthState>().staff!.can('calls.make');
    final target = TaskTarget(dealId: call.dealId, clientId: call.clientId);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
      child: Row(children: [
        AppAvatar(name: title, size: 50),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headline(context).copyWith(fontSize: 16.5, color: missed && !call.handled ? c.danger : c.text)),
            const SizedBox(height: 2),
            Row(children: [
              Icon(icon, size: 14, color: tone),
              const SizedBox(width: 5),
              Flexible(child: Text([listTime(call.at), if (call.name != null && call.phone != null) call.phone!, if (call.durationSec > 0) duration(Duration(seconds: call.durationSec))].join(' · '), maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption(context).copyWith(fontSize: 13.5))),
            ]),
          ]),
        ),
        if (missed && !call.handled) RoundIconButton(icon: LucideIcons.check, size: 40, iconSize: 20, color: c.textMuted, onTap: onHandled),
        if (canCall) RoundIconButton(icon: LucideIcons.phone, size: 40, iconSize: 20, color: c.brandDeep, fill: c.brand.withValues(alpha: 0.12), onTap: () => ContactActions(context).call(phone: call.phone, target: target, callId: call.id)),
        const SizedBox(width: 6),
        RoundIconButton(icon: LucideIcons.messageCircle, size: 40, iconSize: 20, color: c.brandDeep, fill: c.brand.withValues(alpha: 0.12), onTap: () => ContactActions(context).chat(target: target, callId: call.id)),
      ]),
    );
  }
}
