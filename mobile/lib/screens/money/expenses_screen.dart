import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../../widgets/crm_form.dart';
import 'money_widgets.dart';

/// «Расходы» как на сайте (API v1 crmExpenses): за период — сумма, группы и категории, все записи; внести, изменить и
/// удалить (право «Вести расходы»). Реклама хранится в расходах канала маркетинга — у неё канал вместо названия.
class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({super.key});

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  v1api.Expenses? _e;
  String? _error;
  bool _loading = false;
  MoneyPeriodQuery _q = const MoneyPeriodQuery();

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
      final e = await v1(_api, (c) => c.crmExpenses(p: _q.preset, from: _q.from, to: _q.to));
      if (mounted) setState(() => _e = e);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit([v1api.ExpenseRow? row]) async {
    final e = _e;
    if (e == null) return;
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => ExpenseFormScreen(options: e, row: row)));
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final e = _e;
    final c = context.c;
    return MoneyPage(
      title: 'Расходы',
      period: e?.period,
      onPeriod: (q) {
        _q = q;
        _load();
      },
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [if (e?.canManage == true) RoundIconButton(icon: LucideIcons.plus, size: 44, iconSize: 24, color: c.brand, tooltip: 'Внести расход', onTap: () => _edit())],
      children: e == null
          ? const []
          : [
              StatGrid(tiles: [
                StatTile(label: 'Расходы за период', value: money(e.total), note: '${e.rows.length} зап.'),
                for (final g in e.byGroup.where((g) => g.value > 0)) StatTile(label: g.label, value: money(g.value), note: e.total > 0 ? pct(g.value / e.total) : null),
              ]),
              if (e.byCategory.isNotEmpty) ...[MoneySection(title: 'По категориям'), BarList(bars: e.byCategory)],
              MoneySection(title: 'Записи', hint: e.canManage ? 'нажмите, чтобы изменить' : null),
              if (e.rows.isEmpty)
                MoneyEmpty(e.canManage ? 'За период расходов нет — внесите кнопкой «+»' : 'За период расходов нет')
              else
                GroupCard(padding: EdgeInsets.zero, children: [
                  for (final r in e.rows)
                    InkWell(
                      onTap: e.canManage ? () => _edit(r) : null,
                      child: Container(
                        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6), width: 0.5))),
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                        child: Row(children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(r.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text)),
                              const SizedBox(height: 2),
                              Text(
                                [
                                  '${r.day.substring(8)}.${r.day.substring(5, 7)}',
                                  r.categoryLabel,
                                  if (r.quantity != null) '${r.quantity} шт.',
                                  if (r.by.isNotEmpty) r.by,
                                ].join(' · '),
                                style: AppText.caption(context),
                              ),
                              if (r.note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(r.note, style: AppText.caption(context))),
                            ]),
                          ),
                          Text(money(r.amount), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text, fontFeatures: const [FontFeature.tabularFigures()])),
                        ]),
                      ),
                    ),
                ]),
            ],
    );
  }
}

/// Внести или изменить расход: категория, день, сумма, название (у рекламы — канал), количество, заметка. Рекламу не правят —
/// удаляют и вносят заново (как на сайте).
class ExpenseFormScreen extends StatefulWidget {
  const ExpenseFormScreen({super.key, required this.options, this.row});
  final v1api.Expenses options;
  final v1api.ExpenseRow? row;

  @override
  State<ExpenseFormScreen> createState() => _ExpenseFormScreenState();
}

class _ExpenseFormScreenState extends State<ExpenseFormScreen> {
  late String _category = widget.row?.category ?? '';
  late String _day = widget.row?.day ?? _today();
  late String? _channel = widget.row?.channel;
  late final _amount = TextEditingController(text: widget.row == null ? '' : '${widget.row!.amount}');
  late final _title = TextEditingController(text: widget.row?.title ?? '');
  late final _qty = TextEditingController(text: widget.row?.quantity?.toString() ?? '');
  late final _note = TextEditingController(text: widget.row?.note ?? '');
  bool _busy = false;

  static String _today() {
    final n = DateTime.now();
    return '${n.year}-${two(n.month)}-${two(n.day)}';
  }

  ApiClient get _api => context.read<AuthState>().api;
  bool get _ads => _category == 'ads';
  bool get _readonlyAds => widget.row?.source == 'ads';

  @override
  void dispose() {
    for (final c in [_amount, _title, _qty, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _save() async {
    final amount = int.tryParse(_amount.text.replaceAll(RegExp(r'\s'), ''));
    if (_category.isEmpty) return _toast('Выберите категорию');
    if (amount == null || amount <= 0) return _toast('Сумма — больше нуля');
    if (_ads && (_channel == null || _channel!.isEmpty)) return _toast('Выберите канал рекламы');
    if (!_ads && _title.text.trim().length < 2) return _toast('Назовите расход: что оплатили');
    setState(() => _busy = true);
    final body = v1api.ExpenseBody(
      category: _category,
      day: _day,
      amount: amount,
      title: _title.text.trim(),
      quantity: int.tryParse(_qty.text.trim()),
      note: _note.text.trim(),
      channel: _ads ? _channel : null,
    );
    try {
      final r = await v1(_api, (c) => widget.row == null ? c.crmExpenseAdd(body: body) : c.crmExpenseUpdate(expenseId: widget.row!.id, body: body));
      if (!mounted) return;
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Сохранено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    final row = widget.row!;
    if (!await confirm(context, title: 'Удалить расход?', message: '${row.name} — ${money(row.amount)}', ok: 'Удалить', destructive: true)) return;
    try {
      final r = await v1(_api, (c) => c.crmExpenseRemove(expenseId: row.id, source: row.source));
      if (!mounted) return;
      _toast(r.message ?? 'Удалено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final o = widget.options;
    final cats = o.categories;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        title: Text(widget.row == null ? 'Новый расход' : 'Расход', style: AppText.headline(context)),
        actions: [if (widget.row != null) RoundIconButton(icon: LucideIcons.trash2, size: 44, iconSize: 20, color: c.danger, tooltip: 'Удалить', onTap: _remove)],
      ),
      body: GestureDetector(
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.only(top: 16, bottom: 40),
          children: [
            if (_readonlyAds)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: Text('Рекламу не меняют: удалите запись и внесите заново — у неё канал вместо названия.', style: AppText.sub(context)),
              ),
            FormSection(title: 'Что оплатили', children: [
              GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                ChoiceRow(
                  label: 'Категория',
                  icon: LucideIcons.tag,
                  value: cats.where((x) => x.id == _category).map((x) => x.label).firstOrNull ?? 'выбрать',
                  onTap: _readonlyAds
                      ? null
                      : () async {
                          final v = await pickChoice(context, title: 'Категория расхода', options: [for (final x in cats) if (widget.row == null || x.id != 'ads') (x.id, x.label)], current: _category);
                          if (v != null && v.isNotEmpty) setState(() => _category = v);
                        },
                ),
                if (_ads)
                  ChoiceRow(
                    label: 'Канал рекламы',
                    icon: LucideIcons.megaphone,
                    value: o.channels.where((x) => x.id == _channel).map((x) => x.label).firstOrNull ?? 'выбрать',
                    onTap: _readonlyAds
                        ? null
                        : () async {
                            final v = await pickChoice(context, title: 'Канал рекламы', options: [for (final x in o.channels) (x.id, x.label)], current: _channel);
                            if (v != null && v.isNotEmpty) setState(() => _channel = v);
                          },
                  ),
                ChoiceRow(
                  label: 'День оплаты',
                  icon: LucideIcons.calendar,
                  value: _day.split('-').reversed.join('.'),
                  onTap: _readonlyAds
                      ? null
                      : () async {
                          final now = DateTime.now();
                          final d = await showDatePicker(context: context, firstDate: DateTime(now.year - 2), lastDate: now, initialDate: DateTime.parse(_day), locale: const Locale('ru'));
                          if (d != null) setState(() => _day = '${d.year}-${two(d.month)}-${two(d.day)}');
                        },
                ),
              ]),
              LabeledField(label: 'Сумма, ₸', controller: _amount, keyboard: TextInputType.number, enabled: !_readonlyAds),
              LabeledField(label: _ads ? 'Что за реклама (необязательно)' : 'Название', controller: _title, enabled: !_readonlyAds, hint: _ads ? 'Таргет на ноябрь' : 'Печать 5 книг'),
              if (_category == 'print') LabeledField(label: 'Книг', controller: _qty, keyboard: TextInputType.number, enabled: !_readonlyAds, note: 'для цены печати одной книги'),
              LabeledField(label: 'Заметка', controller: _note, lines: 2, enabled: !_readonlyAds),
            ]),
            if (!_readonlyAds)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: PrimaryButton(label: widget.row == null ? 'Внести расход' : 'Сохранить', icon: LucideIcons.check, busy: _busy, onPressed: _save),
              ),
          ],
        ),
      ),
    );
  }
}
