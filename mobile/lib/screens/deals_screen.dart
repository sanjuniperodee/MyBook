import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../core/format.dart';
import '../core/live.dart';
import '../models/deal.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'deal_screen.dart';
import 'new_deal_sheet.dart';

Color hexColor(String s) {
  final h = s.replaceAll('#', '');
  final v = int.tryParse(h.length == 6 ? 'FF$h' : h, radix: 16);
  return v == null ? Colors.grey : Color(v);
}

/// Воронка: этапы «пилюлями» со счётчиками, карточки сделок выбранного этапа, «Мои» и поиск.
class DealsScreen extends StatefulWidget {
  const DealsScreen({super.key});

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  DealsData? _data;
  String? _error;
  String? _stageId; // null — все открытые
  bool _mine = false;
  String _q = '';
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
    context.read<LiveService>().events.listen((e) {
      if (mounted && (e.type == 'tick' || e.type == 'notify')) _load(silent: true);
    });
  }

  Future<void> _load({bool silent = false}) async {
    if (_loading) return;
    _loading = true;
    try {
      final r = await context.read<AuthState>().api.get('/api/mobile/deals', query: {'mine': _mine ? '1' : null, 'q': _q}) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _data = DealsData.fromJson(r);
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted && !silent) setState(() => _error = e.message);
    }
    _loading = false;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final data = _data;
    final stages = data?.stages ?? const <Stage>[];
    final stageById = {for (final s in stages) s.id: s};
    var deals = data?.deals ?? const <DealRow>[];
    deals = _stageId == null ? deals.where((d) => stageById[d.stageId]?.kind == 'open').toList() : deals.where((d) => d.stageId == _stageId).toList();
    int count(String? id) => (data?.deals ?? const <DealRow>[]).where((d) => id == null ? stageById[d.stageId]?.kind == 'open' : d.stageId == id).length;
    final top = MediaQuery.of(context).padding.top;
    Widget body;
    if (data == null && _error == null) {
      body = const SliverFillRemaining(hasScrollBody: false, child: SizedBox(height: 500, child: ChatListSkeleton(rows: 6)));
    } else if (deals.isEmpty) {
      body = SliverFillRemaining(
        hasScrollBody: false,
        child: _error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: _error, action: 'Повторить', onAction: _load) : EmptyState(icon: LucideIcons.handshake, title: 'Сделок нет', hint: _q.isEmpty ? 'В этом этапе пока ничего' : 'Попробуйте другой запрос'),
      );
    } else {
      body = SliverList.separated(
        itemCount: deals.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, i) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _DealCard(
            deal: deals[i],
            stage: stageById[deals[i].stageId],
            onTap: () async {
              await Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => DealScreen(dealId: deals[i].id)));
              _load(silent: true);
            },
          ),
        ),
      );
    }
    return Scaffold(
      backgroundColor: c.surface,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
        slivers: [
          CupertinoSliverRefreshControl(onRefresh: _load),
          SliverToBoxAdapter(
            child: Container(
              color: c.bg,
              padding: EdgeInsets.fromLTRB(20, top + 10, 20, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text('Сделки', style: AppText.largeTitle(context))),
                  if (data?.pipelineName.isNotEmpty == true) Flexible(child: Text(data!.pipelineName, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.sub(context))),
                  if (context.read<AuthState>().staff!.can('deals.edit'))
                    RoundIconButton(
                      icon: LucideIcons.plus,
                      size: 44,
                      color: c.brandDeep,
                      tooltip: 'Новая сделка',
                      onTap: () async {
                        final id = await showNewDealSheet(context, api: context.read<AuthState>().api);
                        if (id == null || !context.mounted) return;
                        await Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => DealScreen(dealId: id)));
                        _load(silent: true);
                      },
                    ),
                ]),
                const SizedBox(height: 12),
                AppSearchField(
                  hint: 'Название, имя, телефон или №',
                  onChanged: (v) => _q = v,
                  onSubmitted: (_) => _load(),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 36,
                  child: ListView(scrollDirection: Axis.horizontal, clipBehavior: Clip.none, children: [
                    Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: 'Мои', selected: _mine, onTap: () {
                      setState(() => _mine = !_mine);
                      _load();
                    })),
                    Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: 'Все открытые', count: count(null), selected: _stageId == null, onTap: () => setState(() => _stageId = null))),
                    for (final s in stages) Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: s.name, count: count(s.id), dot: hexColor(s.color), selected: _stageId == s.id, onTap: () => setState(() => _stageId = s.id))),
                  ]),
                ),
                const SizedBox(height: 14),
                Divider(color: c.border),
              ]),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
          body,
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  const _DealCard({required this.deal, required this.stage, required this.onTap});
  final DealRow deal;
  final Stage? stage;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final stageColor = stage == null ? c.textFaint : hexColor(stage!.color);
    final progress = deal.amount > 0 ? (deal.paid / deal.amount).clamp(0.0, 1.0) : 0.0;
    return Material(
      color: c.surfaceRaised,
      borderRadius: BorderRadius.circular(Rd.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(Rd.lg),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(Rd.lg), border: Border.all(color: c.border, width: 0.6)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(deal.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.headline(context).copyWith(fontSize: 16.5))),
              if (deal.unread > 0) ...[const SizedBox(width: 8), CountBadge(deal.unread)],
            ]),
            const SizedBox(height: 3),
            Text('№${deal.number}${deal.contactName.isNotEmpty ? ' · ${deal.contactName}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.sub(context)),
            if (deal.amount > 0) ...[
              const SizedBox(height: 10),
              Row(children: [
                Text(money(deal.amount), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: -0.4, color: c.text)),
                const Spacer(),
                if (deal.paid > 0) Text('внесено ${money(deal.paid)}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.success)),
              ]),
              if (deal.paid > 0) Padding(padding: const EdgeInsets.only(top: 7), child: ClipRRect(borderRadius: BorderRadius.circular(3), child: LinearProgressIndicator(value: progress, minHeight: 5, backgroundColor: c.surface, valueColor: AlwaysStoppedAnimation(c.success)))),
            ],
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
              if (stage != null) Tag(stage!.name, fg: stageColor, bg: stageColor.withValues(alpha: 0.14)),
              if (deal.taskAt != null) Tag('задача ${listTime(deal.taskAt)}', fg: deal.taskOverdue ? c.danger : c.textMuted, bg: deal.taskOverdue ? c.danger.withValues(alpha: 0.12) : c.surface, icon: LucideIcons.clock) else if (stage?.kind == 'open') Tag('нет задачи', fg: c.warn, bg: c.warnBg, icon: LucideIcons.circleAlert),
              if (deal.unsorted) Tag('неразобранная', fg: c.warn, bg: c.warnBg),
              if (deal.assignee != null) Text(deal.assignee!, style: AppText.caption(context)),
            ]),
          ]),
        ),
      ),
    );
  }
}
