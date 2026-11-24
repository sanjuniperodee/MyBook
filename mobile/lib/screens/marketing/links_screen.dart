import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../../widgets/crm_form.dart';
import '../money/money_widgets.dart';

/// «Ссылки и каналы» (API v1 crmMarketing): каналы привлечения за период — переходы, заявки, продажи, выручка, реклама,
/// стоимость заявки и ROMI; рекламные ссылки — скопировать, поделиться, в архив; «+» — новая короткая ссылка с UTM.
/// Расход на рекламу вносится в «Расходах» (категория «Реклама»).
class LinksScreen extends StatefulWidget {
  const LinksScreen({super.key});

  @override
  State<LinksScreen> createState() => _LinksScreenState();
}

class _LinksScreenState extends State<LinksScreen> {
  v1api.MarketingReport? _m;
  String? _error;
  bool _loading = false;
  String _period = '30';
  bool _archived = false;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final m = await v1(_api, (c) => c.crmMarketing(period: _period, archived: _archived ? '1' : '0'));
      if (mounted) setState(() => _m = m);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _archive(v1api.MarketingLink l) async {
    try {
      final r = await v1(_api, (c) => c.crmMarketingLinkArchive(id: l.id, body: v1api.ArchiveBody(archived: !l.archived)));
      _toast(r.message ?? 'Готово');
      _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = _m;
    final c = context.c;
    return MoneyPage(
      title: 'Ссылки и каналы',
      subtitle: 'Откуда приходят клиенты и что приносит каждая ссылка',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [
        if (m?.canManage == true)
          RoundIconButton(icon: LucideIcons.plus, size: 44, iconSize: 24, color: c.brand, tooltip: 'Новая ссылка', onTap: () async {
            final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _LinkForm(pages: m!.pages)));
            if (ok == true) _load();
          }),
      ],
      children: m == null
          ? const []
          : [
              SizedBox(
                height: 36,
                child: ListView(scrollDirection: Axis.horizontal, children: [
                  for (final (k, label) in const [('7', '7 дней'), ('30', '30 дней'), ('90', '90 дней'), ('0', 'Всё время')])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterPill(label: label, selected: _period == k, onTap: () {
                        _period = k;
                        _load();
                      }),
                    ),
                ]),
              ),
              const SizedBox(height: 14),
              if (m.showAnalytics) ...[
                StatGrid(tiles: [
                  StatTile(label: 'Заявок и регистраций', value: '${m.total.leads + m.total.registrations}', note: 'переходов ${m.total.clicks}'),
                  StatTile(label: 'Продаж', value: '${m.total.sales}', note: 'конверсия ${m.total.conversion}'),
                  StatTile(label: 'Выручка', value: money(m.total.revenue)),
                  StatTile(label: 'Реклама', value: m.total.spend > 0 ? money(m.total.spend) : '—', note: m.total.spend > 0 ? 'заявка ${m.total.costPerLead} · ROMI ${m.total.romi}' : 'внесите в «Расходах»'),
                ]),
                MoneySection(title: 'Каналы'),
                if (m.channels.isEmpty)
                  const MoneyEmpty('За период заявок нет')
                else
                  GroupCard(padding: EdgeInsets.zero, children: [
                    for (final ch in m.channels)
                      Container(
                        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6), width: 0.5))),
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(ch.label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text))),
                            Text(money(ch.revenue), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text)),
                          ]),
                          const SizedBox(height: 3),
                          Text('переходов ${ch.clicks} · заявок ${ch.leads} · регистраций ${ch.registrations} · продаж ${ch.sales} (${ch.conversion})', style: AppText.caption(context)),
                          if (ch.spend > 0) Text('реклама ${money(ch.spend)} · заявка ${ch.costPerLead} · ROMI ${ch.romi}', style: AppText.caption(context)),
                        ]),
                      ),
                  ]),
              ],
              MoneySection(
                title: _archived ? 'Ссылки в архиве' : 'Рекламные ссылки',
                trailing: TextButton(
                  onPressed: () {
                    _archived = !_archived;
                    _load();
                  },
                  child: Text(_archived ? 'Действующие' : 'Архив'),
                ),
              ),
              if (m.links.isEmpty)
                MoneyEmpty(_archived ? 'Архив пуст' : 'Ссылок пока нет — создайте кнопкой «+»: для шапки профиля, рассылки, блогера')
              else
                GroupCard(padding: EdgeInsets.zero, children: [
                  for (final l in m.links)
                    Container(
                      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6), width: 0.5))),
                      padding: const EdgeInsets.fromLTRB(16, 12, 8, 10),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(l.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text))),
                          if (l.revenue > 0) Padding(padding: const EdgeInsets.only(right: 8), child: Text(money(l.revenue), style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: c.text))),
                        ]),
                        const SizedBox(height: 2),
                        Text(l.shortUrl.replaceFirst(RegExp(r'^https?://'), ''), style: AppText.caption(context).copyWith(color: c.brand)),
                        Text('→ ${l.target} · ${l.createdLabel} · переходов ${l.clicks}, заявок ${l.leads + l.registrations}, продаж ${l.sales}', style: AppText.caption(context)),
                        Row(children: [
                          TextButton.icon(
                            icon: const Icon(LucideIcons.copy, size: 16),
                            label: const Text('Копировать'),
                            onPressed: () {
                              Clipboard.setData(ClipboardData(text: l.shortUrl));
                              _toast('Ссылка скопирована');
                            },
                          ),
                          TextButton.icon(icon: const Icon(LucideIcons.share, size: 16), label: const Text('Поделиться'), onPressed: () => SharePlus.instance.share(ShareParams(text: l.shortUrl, sharePositionOrigin: const Rect.fromLTWH(0, 0, 1, 1)))),
                          const Spacer(),
                          if (m.canManage) IconButton(tooltip: l.archived ? 'Вернуть' : 'В архив', icon: Icon(l.archived ? LucideIcons.archiveRestore : LucideIcons.archive, size: 18, color: c.textMuted), onPressed: () => _archive(l)),
                        ]),
                      ]),
                    ),
                ]),
            ],
    );
  }
}

class _LinkForm extends StatefulWidget {
  const _LinkForm({required this.pages});
  final List<v1api.MarketingReportPages> pages;

  @override
  State<_LinkForm> createState() => _LinkFormState();
}

class _LinkFormState extends State<_LinkForm> {
  final _name = TextEditingController();
  final _wa = TextEditingController();
  final _source = TextEditingController();
  final _medium = TextEditingController();
  final _campaign = TextEditingController();
  final _content = TextEditingController();
  String _kind = 'site';
  String _path = '/';
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _wa, _source, _medium, _campaign, _content]) {
      c.dispose();
    }
    super.dispose();
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _save() async {
    if (_name.text.trim().length < 2) return _toast('Назовите ссылку, например «Instagram — шапка профиля»');
    if (_source.text.trim().isEmpty) return _toast('Укажите источник, например instagram');
    setState(() => _busy = true);
    try {
      final r = await v1(
        context.read<AuthState>().api,
        (c) => c.crmMarketingLinkCreate(
          body: v1api.MarketingLinkBody(
            name: _name.text.trim(),
            kind: _kind,
            targetPath: _path,
            waText: _wa.text.trim(),
            utmSource: _source.text.trim(),
            utmMedium: _medium.text.trim(),
            utmCampaign: _campaign.text.trim(),
            utmContent: _content.text.trim(),
          ),
        ),
      );
      if (!mounted) return;
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Ссылка создана');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, title: Text('Новая ссылка', style: AppText.headline(context))),
      body: ListView(padding: const EdgeInsets.only(top: 16, bottom: 40), children: [
        FormSection(title: 'Куда ведёт', children: [
          LabeledField(label: 'Название', controller: _name, hint: 'Instagram — шапка профиля'),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(children: [
              FilterPill(label: 'На сайт', selected: _kind == 'site', onTap: () => setState(() => _kind = 'site')),
              const SizedBox(width: 8),
              FilterPill(label: 'В WhatsApp', selected: _kind == 'whatsapp', onTap: () => setState(() => _kind = 'whatsapp')),
            ]),
          ),
          if (_kind == 'site')
            GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
              ChoiceRow(
                label: 'Страница',
                icon: LucideIcons.globe,
                value: widget.pages.where((p) => p.path == _path).map((p) => p.label).firstOrNull ?? _path,
                onTap: () async {
                  final v = await pickChoice(context, title: 'Страница сайта', options: [for (final p in widget.pages) (p.path, p.label)], current: _path);
                  if (v != null && v.isNotEmpty) setState(() => _path = v);
                },
              ),
            ])
          else
            LabeledField(label: 'Первое сообщение в WhatsApp', controller: _wa, lines: 2, hint: 'Здравствуйте! Хочу книгу…'),
        ]),
        FormSection(title: 'Метки (UTM)', hint: 'по ним заявка попадёт в свой канал', children: [
          LabeledField(label: 'Источник (utm_source)', controller: _source, hint: 'instagram', autocorrect: false, capitalization: TextCapitalization.none),
          LabeledField(label: 'Тип (utm_medium)', controller: _medium, hint: 'bio, stories, cpc', autocorrect: false, capitalization: TextCapitalization.none),
          LabeledField(label: 'Кампания (utm_campaign)', controller: _campaign, hint: 'ноябрь', autocorrect: false, capitalization: TextCapitalization.none),
          LabeledField(label: 'Объявление (utm_content)', controller: _content, autocorrect: false, capitalization: TextCapitalization.none),
        ]),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: PrimaryButton(label: 'Создать ссылку', icon: LucideIcons.link2, busy: _busy, onPressed: _save)),
      ]),
    );
  }
}
