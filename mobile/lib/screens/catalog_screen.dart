import 'dart:io';

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
import 'money/money_widgets.dart';

/// Каталог WhatsApp (API v1 crmCatalog): товары номера магазина — фото, цена, проверка WhatsApp, скрыть; правка и новый
/// товар с фото (фото сначала загружаются, потом товар сохраняется — WhatsApp заменяет товар целиком); коллекции;
/// «Обновить из WhatsApp». Отправить товар клиенту — в чате, кнопкой «Товар из каталога».
class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  v1api.Catalog? _c;
  String? _error;
  bool _loading = false;
  bool _syncing = false;

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
      final c = await v1(_api, (c) => c.crmCatalog());
      if (mounted) setState(() => _c = c);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _act(Future<v1api.Done> Function(v1api.MybookApi) call) async {
    try {
      final r = await v1(_api, call);
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Готово');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _sync() async {
    setState(() => _syncing = true);
    await _act((c) => c.crmCatalogSync());
    if (mounted) setState(() => _syncing = false);
  }

  Future<void> _open([v1api.CatalogItem? p]) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _ProductForm(product: p)));
    if (saved == true) _load();
  }

  Future<void> _collection(v1api.Catalog cat, [v1api.CatalogCollection? col]) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _CollectionForm(products: cat.products, collection: col)));
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final cat = _c;
    final c = context.c;
    return MoneyPage(
      title: 'Каталог WhatsApp',
      subtitle: 'Клиент видит товары в профиле магазина, менеджер отправляет из чата',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [
        RoundIconButton(icon: LucideIcons.refreshCw, size: 44, iconSize: 20, color: c.text, tooltip: 'Обновить из WhatsApp', onTap: _syncing ? null : _sync),
        RoundIconButton(icon: LucideIcons.plus, size: 44, iconSize: 24, color: c.brand, tooltip: 'Добавить товар', onTap: () => _open()),
      ],
      children: cat == null
          ? const []
          : [
              if (cat.problem != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(Rd.lg)),
                  child: Text('Не удалось обновить из WhatsApp: ${cat.problem}.${cat.syncedLabel != null ? ' Показана копия от ${cat.syncedLabel}.' : ''}', style: TextStyle(color: c.warn, fontSize: 14)),
                ),
              if (cat.link != null)
                GroupCard(padding: const EdgeInsets.only(bottom: 4), children: [
                  GroupTile(
                    title: 'Ссылка на весь каталог',
                    subtitle: cat.link!.replaceFirst('https://', ''),
                    icon: LucideIcons.share,
                    onTap: () => SharePlus.instance.share(ShareParams(text: cat.link!, sharePositionOrigin: const Rect.fromLTWH(0, 0, 1, 1))),
                  ),
                ]),
              MoneySection(title: 'Товары', hint: '${cat.products.length} шт.'),
              if (cat.products.isEmpty)
                const MoneyEmpty('Товаров нет — «+»: название, цена и хотя бы одно фото. После проверки WhatsApp товар увидят клиенты')
              else
                GroupCard(padding: EdgeInsets.zero, children: [
                  for (final p in cat.products)
                    InkWell(
                      onTap: () => _open(p),
                      child: Container(
                        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6), width: 0.5))),
                        padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
                        child: Row(children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: SizedBox(
                              width: 56,
                              height: 56,
                              child: p.photos.isEmpty
                                  ? Container(color: c.bg, child: Icon(LucideIcons.image, color: c.textFaint))
                                  : Image.network(_api.uri(p.coverSrc).toString(), headers: {'Authorization': 'Bearer ${_api.token}'}, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: c.bg)),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.hidden ? c.textMuted : c.text)),
                              Text(
                                [
                                  p.price == null ? 'без цены' : (p.currency == 'KZT' ? money(p.price!) : '${p.price} ${p.currency}'),
                                  if (p.hidden) 'скрыт',
                                  if (p.review == 'PENDING') 'на проверке',
                                  if (p.review == 'REJECTED') 'отклонён WhatsApp',
                                ].join(' · '),
                                style: AppText.caption(context).copyWith(color: p.review == 'REJECTED' ? c.danger : null),
                              ),
                            ]),
                          ),
                          Switch.adaptive(value: !p.hidden, activeTrackColor: c.brand, onChanged: (v) => _act((c) => c.crmCatalogHidden(id: p.id, body: v1api.HiddenBody(hidden: !v)))),
                        ]),
                      ),
                    ),
                ]),
              MoneySection(
                title: 'Коллекции',
                hint: cat.collectionsError,
                trailing: cat.collectionsError == null ? TextButton(onPressed: () => _collection(cat), child: const Text('Новая')) : null,
              ),
              if (cat.collections.isEmpty && cat.collectionsError == null)
                const MoneyEmpty('Коллекций нет — сгруппируйте товары: «Книги», «Подарки»')
              else if (cat.collections.isNotEmpty)
                GroupCard(padding: EdgeInsets.zero, children: [
                  for (final col in cat.collections) GroupTile(title: col.name, subtitle: '${col.productIds.length} товаров', icon: LucideIcons.folder, onTap: () => _collection(cat, col)),
                ]),
            ],
    );
  }
}

class _ProductForm extends StatefulWidget {
  const _ProductForm({this.product});
  final v1api.CatalogItem? product;

  @override
  State<_ProductForm> createState() => _ProductFormState();
}

class _ProductFormState extends State<_ProductForm> {
  late final _name = TextEditingController(text: widget.product?.name ?? '');
  late final _desc = TextEditingController(text: widget.product?.description ?? '');
  late final _price = TextEditingController(text: widget.product?.price == null ? '' : '${widget.product!.price!.round()}');
  late final _url = TextEditingController(text: widget.product?.url ?? '');
  late bool _hidden = widget.product?.hidden ?? false;
  late final List<v1api.CatalogPhoto> _keep = [...?widget.product?.photos];
  final List<XFile> _added = [];
  bool _busy = false;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void dispose() {
    for (final c in [_name, _desc, _price, _url]) {
      c.dispose();
    }
    super.dispose();
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _addPhotos() async {
    final picked = await ImagePicker().pickMultiImage(imageQuality: 88, limit: 10);
    if (picked.isEmpty) return;
    setState(() => _added.addAll(picked.take(10 - _keep.length - _added.length)));
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) return _toast('Укажите название товара');
    if (_keep.isEmpty && _added.isEmpty) return _toast('Нужно хотя бы одно фото');
    setState(() => _busy = true);
    try {
      var tokens = <String>[];
      if (_added.isNotEmpty) {
        final files = [
          for (final x in _added) await http.MultipartFile.fromPath('image', x.path, filename: 'photo.${x.path.split('.').last}', contentType: MediaType.parse(lookupMimeType(x.path) ?? 'image/jpeg')),
        ];
        tokens = (await v1(_api, (c) => c.crmCatalogUpload(files: files))).tokens;
      }
      final r = await v1(
        _api,
        (c) => c.crmCatalogSave(
          body: v1api.CatalogProductBody(
            id: widget.product?.id,
            name: _name.text.trim(),
            description: _desc.text,
            price: _price.text.replaceAll(RegExp(r'\s'), ''),
            currency: widget.product?.currency ?? 'KZT',
            retailerId: widget.product?.retailerId ?? '',
            url: _url.text.trim(),
            hidden: _hidden,
            keep: widget.product == null ? null : [for (final p in _keep) p.url],
            uploads: tokens,
          ),
        ),
      );
      if (!mounted) return;
      _toast(r.message ?? 'Сохранено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final p = widget.product!;
    if (!await confirm(context, title: 'Удалить «${p.name}»?', message: 'Товар исчезнет из каталога WhatsApp.', ok: 'Удалить', destructive: true)) return;
    try {
      final r = await v1(_api, (c) => c.crmCatalogDelete(id: p.id));
      if (!mounted) return;
      _toast(r.message ?? 'Удалено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final p = widget.product;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        title: Text(p == null ? 'Новый товар' : 'Товар', style: AppText.headline(context)),
        actions: [if (p != null) RoundIconButton(icon: LucideIcons.trash2, size: 44, iconSize: 20, color: c.danger, tooltip: 'Удалить', onTap: _delete)],
      ),
      body: GestureDetector(
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: ListView(keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag, padding: const EdgeInsets.only(top: 16, bottom: 40), children: [
          FormSection(title: 'Фото', hint: 'первое — обложка; до 10; WhatsApp проверит заново', children: [
            SizedBox(
              height: 88,
              child: ListView(scrollDirection: Axis.horizontal, children: [
                for (final ph in _keep) _thumb(Image.network(_api.uri(ph.src).toString(), headers: {'Authorization': 'Bearer ${_api.token}'}, fit: BoxFit.cover), () => setState(() => _keep.remove(ph))),
                for (final x in _added) _thumb(Image.file(File(x.path), fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(LucideIcons.image)), () => setState(() => _added.remove(x))),
                if (_keep.length + _added.length < 10)
                  GestureDetector(
                    onTap: _addPhotos,
                    child: Container(width: 80, height: 80, decoration: BoxDecoration(color: c.bg, borderRadius: BorderRadius.circular(10)), child: Icon(LucideIcons.imagePlus, color: c.brand)),
                  ),
              ]),
            ),
            if (p != null && p.videos > 0) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Видео товара (${p.videos}) сохранятся', style: AppText.caption(context))),
            const SizedBox(height: 14),
          ]),
          FormSection(title: 'Товар', children: [
            LabeledField(label: 'Название', controller: _name),
            LabeledField(label: 'Цена, ₸', controller: _price, keyboard: TextInputType.number, hint: 'без цены'),
            LabeledField(label: 'Описание', controller: _desc, lines: 4),
            LabeledField(label: 'Ссылка на сайт', controller: _url, keyboard: TextInputType.url, hint: 'необязательно', autocorrect: false),
            GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
              SwitchListTile.adaptive(title: Text('Скрыть от клиентов', style: AppText.body(context)), value: _hidden, activeTrackColor: c.brand, onChanged: (v) => setState(() => _hidden = v)),
            ]),
          ]),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: PrimaryButton(label: p == null ? 'Добавить товар' : 'Сохранить', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ),
    );
  }

  Widget _thumb(Widget image, VoidCallback onRemove) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: Stack(children: [
          ClipRRect(borderRadius: BorderRadius.circular(10), child: SizedBox(width: 80, height: 80, child: image)),
          Positioned(
            right: 2,
            top: 2,
            child: GestureDetector(
              onTap: onRemove,
              child: Container(padding: const EdgeInsets.all(3), decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle), child: const Icon(LucideIcons.x, size: 14, color: Colors.white)),
            ),
          ),
        ]),
      );
}

class _CollectionForm extends StatefulWidget {
  const _CollectionForm({required this.products, this.collection});
  final List<v1api.CatalogItem> products;
  final v1api.CatalogCollection? collection;

  @override
  State<_CollectionForm> createState() => _CollectionFormState();
}

class _CollectionFormState extends State<_CollectionForm> {
  late final _name = TextEditingController(text: widget.collection?.name ?? '');
  late final Set<String> _ids = {...?widget.collection?.productIds};
  bool _busy = false;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) return _toast('Назовите коллекцию');
    setState(() => _busy = true);
    try {
      final r = await v1(_api, (c) => c.crmCatalogCollectionSave(body: v1api.CatalogCollectionBody(id: widget.collection?.id, name: _name.text.trim(), productIds: _ids.toList())));
      if (!mounted) return;
      _toast(r.message ?? 'Сохранено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final col = widget.collection!;
    if (!await confirm(context, title: 'Удалить коллекцию «${col.name}»?', message: 'Товары останутся в каталоге.', ok: 'Удалить', destructive: true)) return;
    try {
      final r = await v1(_api, (c) => c.crmCatalogCollectionDelete(id: col.id));
      if (!mounted) return;
      _toast(r.message ?? 'Удалено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        title: Text(widget.collection == null ? 'Новая коллекция' : 'Коллекция', style: AppText.headline(context)),
        actions: [if (widget.collection != null) RoundIconButton(icon: LucideIcons.trash2, size: 44, iconSize: 20, color: c.danger, tooltip: 'Удалить', onTap: _delete)],
      ),
      body: ListView(padding: const EdgeInsets.only(top: 16, bottom: 40), children: [
        FormSection(title: 'Название', children: [LabeledField(label: 'Название', controller: _name, hint: 'Книги')]),
        FormSection(title: 'Товары', hint: 'отмеченные войдут в коллекцию', children: [
          GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
            for (final p in widget.products)
              CheckboxListTile.adaptive(
                value: _ids.contains(p.id),
                activeColor: c.brand,
                title: Text(p.name, style: AppText.body(context)),
                onChanged: (v) => setState(() => v == true ? _ids.add(p.id) : _ids.remove(p.id)),
              ),
          ]),
        ]),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: PrimaryButton(label: 'Сохранить', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
      ]),
    );
  }
}
