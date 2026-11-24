import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';

/// Карточка отзыва в заказе — как ReviewCard сайта: «Как вам книга?» и «Оценить книгу», после отзыва — звёзды,
/// промокод-благодарность и «Изменить отзыв», пока отзыв не проверен.
class ReviewCard extends StatelessWidget {
  const ReviewCard({super.key, required this.v, required this.onOpen});
  final v1api.ReviewView v;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final t = v.labels.card;
    final r = v.review;
    return Panel(
      padding: const EdgeInsets.all(18),
      child: r == null
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.title, style: AppText.serif(context, size: 22, weight: FontWeight.w500)),
              const SizedBox(height: 6),
              Text(t.text, style: TextStyle(fontSize: 14.5, height: 1.45, color: c.textMuted)),
              const SizedBox(height: 14),
              CabinetButton(label: t.button, icon: LucideIcons.star, large: false, onPressed: onOpen),
            ])
          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(t.done, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
                _Stars(rating: r.rating, size: 16),
              ]),
              if (r.thankYouCode != null) ...[
                const SizedBox(height: 10),
                Row(children: [
                  Icon(LucideIcons.gift, size: 16, color: c.brand),
                  const SizedBox(width: 8),
                  Text('${t.code}: ', style: const TextStyle(fontSize: 14)),
                  SelectableText(r.thankYouCode!, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
                ]),
              ],
              if (r.status == 'new') ...[
                const SizedBox(height: 4),
                Align(alignment: Alignment.centerRight, child: TextButton(onPressed: onOpen, child: Text(t.edit, style: TextStyle(color: c.brand)))),
              ],
            ]),
    );
  }
}

/// Отзыв о книге — как страница /review/<заказ> сайта (ReviewForm): оценка звёздами с подписью, текст (подсказка —
/// от оценки и вида книги), фото с книгой, имя, город, согласие показать на сайте; после отправки — спасибо и промокод.
/// Надписи и длины — с сервера (API v1 reviewGet).
class ReviewScreen extends StatefulWidget {
  const ReviewScreen({super.key, required this.orderId, required this.view});
  final String orderId;
  final v1api.ReviewView view;

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  late v1api.ReviewView _v = widget.view;
  late int _rating = _v.review?.rating ?? 0;
  late final _text = TextEditingController(text: _v.review?.text ?? '');
  late final _name = TextEditingController(text: _v.review?.authorName ?? _v.defaultName);
  late final _city = TextEditingController(text: _v.review?.city ?? '');
  late bool _consent = _v.review?.consent ?? true;
  bool _sending = false;
  bool _sent = false;
  bool _copied = false;
  bool _ratingError = false;

  v1api.Review? get _r => _v.review;
  bool get _locked => _r != null && _r!.status != 'new';

  @override
  void dispose() {
    _text.dispose();
    _name.dispose();
    _city.dispose();
    super.dispose();
  }

  void _setReview(v1api.Review r) => setState(() => _v = v1api.ReviewView(canReview: _v.canReview, defaultName: _v.defaultName, review: r, coverUrl: _v.coverUrl, labels: _v.labels, limits: _v.limits));

  Future<void> _submit() async {
    if (_rating == 0) {
      setState(() => _ratingError = true);
      return;
    }
    if (_name.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      final r = await _session.backend.call(() => _session.backend.contract.reviewSubmit(
            orderId: widget.orderId,
            body: v1api.ReviewBody(rating: _rating, text: _text.text.trim(), authorName: _name.text.trim(), city: _city.text.trim(), consent: _consent),
          ));
      _setReview(r);
      setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _photo() async {
    if (_r == null) return;
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 2400, imageQuality: 88);
    if (x == null) return;
    try {
      final part = await http.MultipartFile.fromPath('photo', x.path, filename: x.name, contentType: MediaType.parse('image/jpeg'));
      final r = await _session.backend.call(() => _session.backend.contract.reviewPhotoSet(orderId: widget.orderId, files: [part]));
      _setReview(r);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _removePhoto() async {
    try {
      final r = await _session.backend.call(() => _session.backend.contract.reviewPhotoDelete(orderId: widget.orderId));
      _setReview(r);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final t = _v.labels;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, leading: IconButton(icon: const Icon(LucideIcons.chevronLeft), onPressed: () => Navigator.of(context).pop(_v))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 78, child: CoverImage(url: _v.coverUrl, width: 78, flat: true)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.order, style: TextStyle(fontSize: 13.5, color: c.textMuted)),
                const SizedBox(height: 4),
                Text(t.title, style: AppText.serif(context, size: 32, weight: FontWeight.w500).copyWith(height: 1.05)),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          Text(t.subtitle, style: TextStyle(fontSize: 15, height: 1.45, color: c.textMuted)),
          const SizedBox(height: 20),
          if (!_v.canReview)
            Panel(child: Text(t.notYet, textAlign: TextAlign.center, style: TextStyle(color: c.textMuted)))
          else if (_sent && _r != null)
            _thanks()
          else
            _form(),
        ],
      ),
    );
  }

  Widget _thanks() {
    final c = context.c;
    final t = _v.labels;
    final r = _r!;
    final low = r.rating <= 3;
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t.thanksTitle, style: AppText.serif(context, size: 26, weight: FontWeight.w500)),
        const SizedBox(height: 6),
        Text(low ? t.thanksLow : t.thanksHigh, style: TextStyle(fontSize: 15, height: 1.45, color: c.textMuted)),
        if (r.thankYouCode != null) ...[
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: c.bubbleOut, borderRadius: BorderRadius.circular(Cab.panel)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Icon(LucideIcons.gift, size: 18, color: c.brand), const SizedBox(width: 8), Expanded(child: Text(t.promoTitle, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)))]),
              const SizedBox(height: 6),
              Text(t.promoText, style: TextStyle(fontSize: 13.5, height: 1.4, color: c.textMuted)),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: SelectableText(r.thankYouCode!, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: 2))),
                TextButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: r.thankYouCode!));
                    if (mounted) setState(() => _copied = true);
                  },
                  icon: Icon(_copied ? LucideIcons.check : LucideIcons.copy, size: 16, color: c.brand),
                  label: Text(_copied ? t.copied : t.copy, style: TextStyle(color: c.brand)),
                ),
              ]),
            ]),
          ),
        ],
      ]),
    );
  }

  Widget _form() {
    final c = context.c;
    final t = _v.labels;
    final max = _v.limits;
    final low = _rating > 0 && _rating <= 3;
    final enabled = !_locked;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (_locked) Padding(padding: const EdgeInsets.only(bottom: 14), child: Text(t.locked, style: TextStyle(fontSize: 14, color: c.textMuted))),
      if (_r != null && !_locked) Padding(padding: const EdgeInsets.only(bottom: 14), child: Text(t.editable, style: TextStyle(fontSize: 14, color: c.textMuted))),
      Semantics(
        label: t.ratingAria,
        child: Row(children: [
          for (var n = 1; n <= 5; n++)
            IconButton(
              onPressed: enabled ? () => setState(() {
                    _rating = n;
                    _ratingError = false;
                  }) : null,
              icon: Icon(n <= _rating ? Icons.star_rounded : LucideIcons.star, size: 34, color: n <= _rating ? c.warn : c.border),
            ),
        ]),
      ),
      Text(_rating > 0 ? t.ratings[_rating - 1] : (_ratingError ? t.chooseRating : ''), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _ratingError ? c.danger : c.textMuted)),
      const SizedBox(height: 18),
      Text(t.textLabel, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      TextField(
        controller: _text,
        enabled: enabled,
        minLines: 5,
        maxLines: 12,
        maxLength: max.text,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(hintText: low ? t.textLow : t.textHigh),
      ),
      if (_r != null) ...[
        const SizedBox(height: 12),
        Text(t.photo, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(t.photoHint, style: TextStyle(fontSize: 13, height: 1.4, color: c.textMuted)),
        const SizedBox(height: 8),
        if (_r!.photoUrl != null)
          Row(children: [
            ClipRRect(borderRadius: BorderRadius.circular(Cab.ctl), child: SizedBox(width: 72, height: 72, child: CoverArt(url: _r!.photoUrl!))),
            const SizedBox(width: 12),
            Expanded(child: Text(t.photoAttached, style: const TextStyle(fontSize: 14))),
            if (enabled) TextButton(onPressed: _removePhoto, child: Text(t.photoRemove, style: TextStyle(color: c.danger))),
          ])
        else if (enabled)
          DashedButton(label: t.photoChoose, icon: LucideIcons.imagePlus, onPressed: _photo),
      ],
      const SizedBox(height: 16),
      Text(t.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      TextField(controller: _name, enabled: enabled, maxLength: max.authorName, decoration: const InputDecoration(counterText: '')),
      const SizedBox(height: 14),
      Text(t.city, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      TextField(controller: _city, enabled: enabled, maxLength: max.city, decoration: InputDecoration(hintText: t.cityPlaceholder, counterText: '')),
      const SizedBox(height: 8),
      CheckboxListTile(
        value: _consent,
        onChanged: enabled ? (v) => setState(() => _consent = v ?? false) : null,
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        activeColor: c.brand,
        title: Text(t.consent, style: const TextStyle(fontSize: 14)),
      ),
      if (enabled) ...[
        const SizedBox(height: 12),
        CabinetButton(label: _r == null ? t.submit : t.update, busy: _sending, onPressed: _sending ? null : _submit),
      ],
    ]);
  }
}

class _Stars extends StatelessWidget {
  const _Stars({required this.rating, this.size = 16});
  final int rating;
  final double size;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        for (var n = 1; n <= 5; n++) Icon(n <= rating ? Icons.star_rounded : LucideIcons.star, size: size + 2, color: n <= rating ? context.c.warn : context.c.border),
      ]);
}
