import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mime/mime.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/format.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../widgets/crm_form.dart';
import 'client_screen.dart';
import 'deal_screen.dart';

/// «Новый клиент» — как /admin/clients/new: клиент с доступом в кабинет, а по галочке — сделка с договорённостью
/// (тариф, сколько книг, цена, бесплатное), предоплата с формой оплаты и чеком, этап, ответственный и комментарий.
/// Сервер — тот же сценарий, что у сайта (API v1 crmClientCreate); чек предоплаты догружается к каждой сделке пакета.
class NewClientScreen extends StatefulWidget {
  const NewClientScreen({super.key});

  @override
  State<NewClientScreen> createState() => _NewClientScreenState();
}

class _NewClientScreenState extends State<NewClientScreen> {
  v1api.NewClientOptions? _o;
  String? _error;
  bool _busy = false;

  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _city = TextEditingController();
  final _password = TextEditingController();
  final _recipient = TextEditingController();
  final _agreed = TextEditingController();
  final _prepaid = TextEditingController();
  final _comment = TextEditingController();
  String? _channel;
  String _locale = 'ru';
  bool _deal = true;
  String? _plan;
  int _count = 1;
  String? _deadline;
  String? _payForm;
  String? _stageId;
  String? _assigneeId;
  final Set<String> _gifts = {};
  File? _receipt;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _city, _password, _recipient, _agreed, _prepaid, _comment]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final o = await v1(_api, (c) => c.crmClientNewOptions());
      if (!mounted) return;
      setState(() {
        _o = o;
        _error = null;
        _deal = o.canDeal;
        _stageId = o.defaultStageId;
        _assigneeId = o.me;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  int _num(TextEditingController c) => int.tryParse(c.text.replaceAll(RegExp(r'\D'), '')) ?? 0;

  /// Снимок из галереи называется «image_picker_…jpg» — показываем и отправляем понятное имя; у PDF оставляем своё.
  String _receiptName({bool upload = false}) {
    final name = _receipt!.uri.pathSegments.last;
    if (!name.startsWith('image_picker_')) return name;
    final ext = name.contains('.') ? name.split('.').last : 'jpg';
    return upload ? 'receipt.$ext' : 'Фото чека';
  }

  Future<void> _pickReceipt(String from) async {
    File? f;
    if (from == 'file') {
      final r = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf']);
      final path = r.isEmpty ? null : r.first.path;
      if (path != null) f = File(path);
    } else {
      final x = await ImagePicker().pickImage(source: from == 'camera' ? ImageSource.camera : ImageSource.gallery, imageQuality: 85);
      if (x != null) f = File(x.path);
    }
    if (f != null && mounted) setState(() => _receipt = f);
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _submit() async {
    final o = _o!;
    if (_name.text.trim().isEmpty) return _toast('Укажите имя клиента');
    if (_phone.text.replaceAll(RegExp(r'\D'), '').length < 10) return _toast('Проверьте номер телефона');
    if (_channel == null) return _toast('Укажите, откуда пришёл клиент');
    final agreed = _num(_agreed);
    final prepaid = _num(_prepaid);
    if (_deal) {
      if (_plan == null) return _toast('Выберите тариф, на который договорились');
      if (agreed <= 0) return _toast('Укажите цену книги');
      if (prepaid > agreed * _count) return _toast('Предоплата не может быть больше суммы договорённости');
      if (prepaid > 0 && _receipt == null) return _toast('Приложите чек предоплаты: фото, скриншот или PDF');
    }
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _busy = true);
    String? t(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    try {
      final r = await v1(
        _api,
        (c) => c.crmClientCreate(
          body: v1api.NewClientBody(
            name: _name.text.trim(),
            phone: _phone.text.trim(),
            email: t(_email),
            city: t(_city),
            channel: _channel!,
            locale: _locale,
            password: t(_password),
            deal: !_deal
                ? null
                : v1api.NewClientDeal(
                    plan: _plan!,
                    count: _count,
                    agreed: agreed,
                    prepaid: prepaid,
                    recipient: t(_recipient),
                    deadline: _deadline,
                    payForm: prepaid > 0 ? _payForm : null,
                    stageId: _stageId,
                    assigneeId: o.canAssign ? _assigneeId : null,
                    comment: t(_comment),
                    gifts: _gifts.isEmpty ? null : _gifts.toList(),
                  ),
          ),
        ),
      );
      // Чек предоплаты — к каждой сделке пакета (доля предоплаты у каждой своя), как форма сайта.
      final receiptErrors = <String>[];
      if (_receipt != null) {
        for (final p in r.parts.where((p) => p.prepaid > 0 && p.paymentId != null)) {
          try {
            final file = await http.MultipartFile.fromPath('file', _receipt!.path, filename: _receiptName(upload: true), contentType: MediaType.parse(lookupMimeType(_receipt!.path) ?? 'image/jpeg'));
            await v1(_api, (c) => c.crmDealReceipt(dealId: p.dealId, amount: '${p.prepaid}', paymentId: p.paymentId, files: [file]));
          } on ApiException catch (e) {
            receiptErrors.add('Д${p.dealNumber}: ${e.message}');
          }
        }
      }
      HapticFeedback.mediumImpact();
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => _CreatedScreen(r: r, receiptErrors: receiptErrors)));
    } on ApiException catch (e) {
      _toast(e.message);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final o = _o;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, title: Text('Новый клиент', style: AppText.headline(context))),
      body: o == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть форму', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : GestureDetector(
              onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.only(top: 16, bottom: 40),
                children: [
                  FormSection(title: 'Клиент', hint: 'Заведём аккаунт с логином и паролем — доступ отправите клиенту в WhatsApp', children: [
                    LabeledField(label: 'Имя', controller: _name, hint: 'Насиба', autocorrect: false, capitalization: TextCapitalization.words),
                    LabeledField(label: 'Телефон', controller: _phone, keyboard: TextInputType.phone, hint: '8 775 000 00 00'),
                    LabeledField(label: 'Почта', controller: _email, keyboard: TextInputType.emailAddress, hint: 'если есть', autocorrect: false),
                    LabeledField(label: 'Город', controller: _city, hint: 'Алматы', capitalization: TextCapitalization.words),
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      ChoiceRow(
                        label: 'Откуда пришёл',
                        icon: LucideIcons.signpost,
                        value: o.channels.where((x) => x.id == _channel).map((x) => x.label).firstOrNull ?? 'выбрать',
                        onTap: () async {
                          final v = await pickChoice(context, title: 'Канал продаж', options: [for (final x in o.channels) (x.id, x.label)], current: _channel);
                          if (v != null && v.isNotEmpty) setState(() => _channel = v);
                        },
                      ),
                      ChoiceRow(
                        label: 'Язык кабинета',
                        icon: LucideIcons.languages,
                        value: o.locales.where((x) => x.id == _locale).map((x) => x.label).firstOrNull ?? _locale,
                        onTap: () async {
                          final v = await pickChoice(context, title: 'Язык кабинета и писем', options: [for (final x in o.locales) (x.id, x.label)], current: _locale);
                          if (v != null && v.isNotEmpty) setState(() => _locale = v);
                        },
                      ),
                    ]),
                    LabeledField(label: 'Пароль', controller: _password, hint: 'создать автоматически'),
                  ]),
                  if (o.canDeal)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
                      child: GroupCard(padding: EdgeInsets.zero, children: [
                        SwitchListTile.adaptive(
                          title: Text('Сразу завести сделку', style: AppText.body(context)),
                          subtitle: Text('договорённость, предоплата и задачи', style: AppText.caption(context)),
                          value: _deal,
                          activeTrackColor: c.brand,
                          onChanged: (v) => setState(() => _deal = v),
                        ),
                      ]),
                    ),
                  if (_deal && o.canDeal) ..._dealFields(context, o),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: PrimaryButton(label: _deal ? 'Завести клиента и сделку' : 'Завести клиента', icon: LucideIcons.userPlus, busy: _busy, onPressed: _submit),
                  ),
                ],
              ),
            ),
    );
  }

  List<Widget> _dealFields(BuildContext context, v1api.NewClientOptions o) {
    final c = context.c;
    final plan = o.plans.where((p) => p.id == _plan).firstOrNull;
    final agreed = _num(_agreed);
    final total = agreed * _count;
    final prepaid = _num(_prepaid);
    final discount = plan != null && agreed > 0 && agreed < plan.price ? ((plan.price - agreed) * 100 / plan.price).round() : 0;
    final overLimit = o.maxDiscountPercent != null && discount > o.maxDiscountPercent!;
    return [
      FormSection(title: 'Договорённость', children: [
        LabeledField(label: 'Для кого книга', controller: _recipient, hint: 'Мужу'),
        GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
          ChoiceRow(
            label: 'Тариф',
            icon: LucideIcons.bookOpen,
            value: plan == null ? 'выбрать' : '${plan.label} · ${money(plan.price)}',
            onTap: () async {
              final v = await pickChoice(context, title: 'Тариф договорённости', options: [for (final p in o.plans) (p.id, '${p.label} — ${money(p.price)}')], current: _plan);
              if (v != null && v.isNotEmpty) {
                setState(() {
                  _plan = v;
                  if (_agreed.text.isEmpty) _agreed.text = '${o.plans.firstWhere((p) => p.id == v).price}';
                });
              }
            },
          ),
          ChoiceRow(
            label: 'Книг',
            icon: LucideIcons.copy,
            value: '$_count',
            onTap: () async {
              final v = await pickChoice(context, title: 'Сколько книг', options: [for (var i = 1; i <= 10; i++) ('$i', '$i')], current: '$_count');
              if (v != null && v.isNotEmpty) setState(() => _count = int.parse(v));
            },
          ),
          ChoiceRow(
            label: 'Нужна к',
            icon: LucideIcons.calendar,
            value: _deadline == null ? 'без срока' : _deadline!.split('-').reversed.join('.'),
            onTap: () async {
              final now = DateTime.now();
              final d = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 365)), initialDate: _deadline == null ? now.add(const Duration(days: 14)) : DateTime.parse(_deadline!), locale: const Locale('ru'));
              if (d != null) setState(() => _deadline = '${d.year}-${two(d.month)}-${two(d.day)}');
            },
          ),
        ]),
        LabeledField(
          label: _count > 1 ? 'Цена одной книги, ₸' : 'Цена книги, ₸',
          controller: _agreed,
          keyboard: TextInputType.number,
          note: discount > 0 ? 'Скидка $discount% от прайса${overLimit ? ' — больше вашего лимита ${o.maxDiscountPercent!.round()}%' : ''}' : (_count > 1 && agreed > 0 ? 'Всего за $_count книги: ${money(total)}' : null),
          onChanged: (_) => setState(() {}),
        ),
        const FormLabel('Бесплатно по договорённости'),
        Wrap(spacing: 8, children: [
          for (final (id, label) in [('giftwrap', 'Подарочная упаковка'), ('delivery', 'Доставка')])
            FilterPill(label: label, selected: _gifts.contains(id), onTap: () => setState(() => _gifts.contains(id) ? _gifts.remove(id) : _gifts.add(id))),
        ]),
      ]),
      FormSection(title: 'Предоплата', hint: total > 0 ? 'Остаток после предоплаты: ${money((total - prepaid).clamp(0, total))}' : null, children: [
        LabeledField(label: 'Получено, ₸', controller: _prepaid, keyboard: TextInputType.number, hint: '0 — без предоплаты', onChanged: (_) => setState(() {})),
        if (prepaid > 0) ...[
          if (o.payForms.isNotEmpty) ...[
            const FormLabel('Форма оплаты'),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final f in o.payForms) FilterPill(label: f, selected: _payForm == f, onTap: () => setState(() => _payForm = _payForm == f ? null : f)),
            ]),
            const SizedBox(height: 14),
          ],
          const FormLabel('Чек предоплаты'),
          if (_receipt != null)
            GroupCard(padding: EdgeInsets.zero, children: [
              GroupTile(
                title: _receiptName(),
                icon: _receipt!.path.toLowerCase().endsWith('.pdf') ? LucideIcons.fileText : LucideIcons.image,
                trailing: Icon(LucideIcons.x, size: 18, color: c.textFaint),
                onTap: () => setState(() => _receipt = null),
              ),
            ])
          else
            Row(children: [
              for (final (key, icon, label) in [('camera', LucideIcons.camera, 'Камера'), ('gallery', LucideIcons.image, 'Скриншот'), ('file', LucideIcons.fileText, 'PDF')]) ...[
                if (key != 'camera') const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pickReceipt(key),
                    icon: Icon(icon, size: 18),
                    label: Text(label, maxLines: 1, softWrap: false, overflow: TextOverflow.fade),
                    style: OutlinedButton.styleFrom(foregroundColor: c.text, backgroundColor: c.surfaceRaised, side: BorderSide(color: c.border), minimumSize: const Size(0, 46), padding: const EdgeInsets.symmetric(horizontal: 8), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rd.sm))),
                  ),
                ),
              ],
            ]),
        ],
      ]),
      FormSection(title: 'Сделка', children: [
        GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
          ChoiceRow(
            label: 'Этап',
            icon: LucideIcons.kanban,
            value: o.stages.where((s) => s.id == _stageId).map((s) => s.label).firstOrNull ?? 'первый',
            onTap: () async {
              final v = await pickChoice(context, title: 'Этап сделки', options: [for (final s in o.stages) (s.id, s.label)], current: _stageId);
              if (v != null && v.isNotEmpty) setState(() => _stageId = v);
            },
          ),
          if (o.canAssign)
            ChoiceRow(
              label: 'Ответственный',
              icon: LucideIcons.userRound,
              value: o.managers.where((m) => m.id == _assigneeId).map((m) => m.label).firstOrNull ?? 'я',
              onTap: () async {
                final v = await pickChoice(context, title: 'Ответственный', options: [for (final m in o.managers) (m.id, m.label)], current: _assigneeId);
                if (v != null && v.isNotEmpty) setState(() => _assigneeId = v);
              },
            ),
        ]),
        LabeledField(label: 'Комментарий', controller: _comment, lines: 3, hint: 'пожелания, договорённости'),
      ]),
    ];
  }
}

/// Готово: доступ в кабинет (пароль показывается один раз) — отправить клиенту; сделка и клиент — открыть.
class _CreatedScreen extends StatelessWidget {
  const _CreatedScreen({required this.r, required this.receiptErrors});
  final v1api.NewClientResult r;
  final List<String> receiptErrors;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, title: Text('Клиент заведён', style: AppText.headline(context))),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
        Row(children: [
          Icon(LucideIcons.circleCheck, color: c.success, size: 28),
          const SizedBox(width: 10),
          Expanded(child: Text(r.clientName, style: AppText.title(context))),
        ]),
        const SizedBox(height: 6),
        Text(
          [
            if (r.dealNumber != null) r.count > 1 ? 'Сделки на ${r.count} книги, первая — Д${r.dealNumber}' : 'Сделка Д${r.dealNumber}',
            if (r.prepaid > 0) 'предоплата ${money(r.prepaid)}, остаток ${money(r.remainder)}',
            if (r.tasks > 0) 'задач: ${r.tasks}',
          ].join(' · '),
          style: AppText.sub(context),
        ),
        if (receiptErrors.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text('Чек не приложился — приложите в сделке: ${receiptErrors.join('; ')}', style: TextStyle(color: c.danger, fontSize: 14))),
        const SizedBox(height: 20),
        GroupCard(title: 'Доступ в кабинет', padding: const EdgeInsets.only(bottom: 16), children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Логин: ${r.loginText}', style: AppText.body(context)),
              const SizedBox(height: 4),
              SelectableText('Пароль: ${r.password}', style: AppText.body(context).copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Text('Пароль показывается один раз — отправьте его клиенту сейчас.', style: AppText.caption(context).copyWith(color: c.warn)),
            ]),
          ),
        ]),
        PrimaryButton(label: 'Отправить доступ клиенту', icon: LucideIcons.send, onPressed: () => SharePlus.instance.share(ShareParams(text: r.message, sharePositionOrigin: const Rect.fromLTWH(0, 0, 1, 1)))),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: r.message));
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Сообщение скопировано')));
          },
          icon: const Icon(LucideIcons.copy, size: 18),
          label: const Text('Скопировать сообщение'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
        ),
        const SizedBox(height: 20),
        GroupCard(padding: EdgeInsets.zero, children: [
          if (r.dealId != null) GroupTile(title: 'Открыть сделку Д${r.dealNumber}', icon: LucideIcons.handshake, onTap: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => DealScreen(dealId: r.dealId!)))),
          GroupTile(title: 'Открыть карточку клиента', icon: LucideIcons.user, onTap: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => ClientScreen(clientId: r.clientId, title: r.clientName)))),
        ]),
      ]),
    );
  }
}
