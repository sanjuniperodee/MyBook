import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';

/// Письма близких — как страница писем сайта (LettersManager): ссылка-приглашение (создать, копировать, WhatsApp, свой
/// текст приглашения с автосохранением, новая ссылка, закрыть приём), письма по вкладкам «Новые / В книге / Скрытые»:
/// добавить в книгу, убрать, исправить, скрыть, удалить, порядок в книге стрелками. Надписи и длины полей — с сервера
/// (API v1 lettersGet).
class LettersScreen extends StatefulWidget {
  const LettersScreen({super.key, required this.hub});
  final v1api.CabinetBook hub;

  @override
  State<LettersScreen> createState() => _LettersScreenState();
}

class _LettersScreenState extends State<LettersScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.LettersView? _v;
  String? _error;
  String _tab = 'pending';
  bool _busy = false;
  bool _copied = false;
  String? _editing;
  final Set<String> _expanded = {};
  final _inviteText = TextEditingController();
  Timer? _inviteTimer;

  v1api.MybookApi get _api => _session.backend.contract;
  String get _bookId => widget.hub.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _flushInvite();
    _inviteText.dispose();
    super.dispose();
  }

  Future<T?> _run<T>(Future<T> Function() f) async {
    try {
      return await _session.backend.call(f);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      return null;
    }
  }

  Future<void> _load() async {
    try {
      final v = await _session.backend.call(() => _api.lettersGet(bookId: _bookId));
      if (!mounted) return;
      setState(() {
        _v = v;
        _error = null;
        if (!v.letters.any((l) => l.status == 'pending') && v.letters.any((l) => l.status == 'approved')) _tab = 'approved';
      });
      _inviteText.text = v.invite.text;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _setInvite(v1api.LetterInvite i) {
    final v = _v!;
    setState(() => _v = v1api.LettersView(letters: v.letters, invite: i, max: v.max, editable: v.editable, labels: v.labels, limits: v.limits));
  }

  Future<void> _invite(bool enabled, {bool regenerate = false}) async {
    setState(() => _busy = true);
    final i = await _run(() => _api.letterInviteSet(bookId: _bookId, body: v1api.LetterInviteBody(enabled: enabled, regenerate: regenerate)));
    if (mounted) setState(() => _busy = false);
    if (i != null) _setInvite(i);
  }

  void _typedInvite(String _) {
    _inviteTimer?.cancel();
    _inviteTimer = Timer(const Duration(milliseconds: 700), _flushInvite);
  }

  Future<void> _flushInvite() async {
    if (_inviteTimer == null) return;
    _inviteTimer?.cancel();
    _inviteTimer = null;
    final i = await _run(() => _api.letterInviteText(bookId: _bookId, body: v1api.LetterInviteText(text: _inviteText.text)));
    if (i != null && mounted) _setInvite(i);
  }

  Future<void> _patch(v1api.Letter l, v1api.LetterPatch p) async {
    final r = await _run(() => _api.letterUpdate(bookId: _bookId, letterId: l.id, body: p));
    if (r == null || !mounted) return;
    final v = _v!;
    setState(() {
      _editing = null;
      _v = v1api.LettersView(letters: [for (final x in v.letters) x.id == l.id ? r.letter : x], invite: v.invite, max: v.max, editable: v.editable, labels: v.labels, limits: v.limits);
    });
  }

  Future<void> _delete(v1api.Letter l) async {
    final t = _v!.labels;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(t.deleteTitle),
        content: Text(t.deleteText),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t.cancel)),
          TextButton(onPressed: () => Navigator.pop(context, true), child: Text(t.delete, style: TextStyle(color: context.c.danger))),
        ],
      ),
    );
    if (ok != true) return;
    final r = await _run(() => _api.letterDelete(bookId: _bookId, letterId: l.id));
    if (r == null || !mounted) return;
    final v = _v!;
    setState(() => _v = v1api.LettersView(letters: [for (final x in v.letters) if (x.id != l.id) x], invite: v.invite, max: v.max, editable: v.editable, labels: v.labels, limits: v.limits));
  }

  /// Порядок писем в книге: соседнее «в книге» меняется местами, порядок уходит на сервер целиком.
  Future<void> _move(v1api.Letter l, int delta) async {
    final v = _v!;
    final approved = v.letters.where((x) => x.status == 'approved').toList();
    final i = approved.indexWhere((x) => x.id == l.id);
    final j = i + delta;
    if (i < 0 || j < 0 || j >= approved.length) return;
    final moved = [...approved]..removeAt(i);
    moved.insert(j, l);
    final others = v.letters.where((x) => x.status != 'approved');
    setState(() => _v = v1api.LettersView(letters: [...moved, ...others], invite: v.invite, max: v.max, editable: v.editable, labels: v.labels, limits: v.limits));
    await _run(() => _api.lettersReorder(bookId: _bookId, body: v1api.LettersOrder(ids: [for (final x in moved) x.id])));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final h = widget.hub;
    final v = _v;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BookHeader(bookId: h.id, title: h.title, kind: h.kind, coverUrl: h.coverThumbUrl),
      body: v == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: _error!, action: 'Повторить', onAction: _load))
          : RefreshIndicator(
              color: c.brand,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 48),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  Text(v.labels.title, style: AppText.serif(context, size: 32, weight: FontWeight.w500)),
                  const SizedBox(height: 4),
                  Text(v.labels.lead, style: TextStyle(fontSize: 15, height: 1.45, color: c.textMuted)),
                  const SizedBox(height: 18),
                  _invitePanel(v),
                  const SizedBox(height: 24),
                  _tabs(v),
                  const SizedBox(height: 14),
                  ..._list(v),
                ],
              ),
            ),
    );
  }

  Widget _invitePanel(v1api.LettersView v) {
    final c = context.c;
    final t = v.labels;
    final i = v.invite;
    return Panel(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(LucideIcons.link2, size: 17, color: c.brand),
          const SizedBox(width: 8),
          Expanded(child: Text(t.linkTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
        ]),
        const SizedBox(height: 6),
        Text(t.linkText, style: TextStyle(fontSize: 14, height: 1.45, color: c.textMuted)),
        const SizedBox(height: 14),
        if (!i.enabled)
          CabinetButton(label: t.create, icon: LucideIcons.link2, large: false, busy: _busy, onPressed: v.editable && !_busy ? () => _invite(true) : null)
        else ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Cab.ctl)),
            child: SelectableText(i.url ?? '', style: const TextStyle(fontSize: 13.5)),
          ),
          const SizedBox(height: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SizedBox(
              child: CabinetButton(
                label: _copied ? t.copied : t.copy,
                icon: _copied ? LucideIcons.check : LucideIcons.copy,
                kind: CabBtn.outline,
                large: false,
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: i.shareText ?? i.url ?? ''));
                  if (!mounted) return;
                  setState(() => _copied = true);
                  Future.delayed(const Duration(seconds: 2), () => mounted ? setState(() => _copied = false) : null);
                },
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              child: CabinetButton(
                label: t.whatsapp,
                icon: LucideIcons.messageCircle,
                large: false,
                onPressed: () => launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(i.shareText ?? i.url ?? '')}'), mode: LaunchMode.externalApplication),
              ),
            ),
          ]),
          const SizedBox(height: 16),
          Text(t.inviteText, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            controller: _inviteText,
            enabled: v.editable,
            minLines: 3,
            maxLines: 6,
            maxLength: v.limits.inviteText,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(hintText: t.invitePlaceholder, counterText: ''),
            onChanged: _typedInvite,
          ),
          const SizedBox(height: 6),
          Text(t.inviteTextHint, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted)),
          const SizedBox(height: 10),
          Text(t.privacy, style: TextStyle(fontSize: 12.5, color: c.textFaint)),
          if (v.editable) ...[
            Divider(height: 22, color: c.border),
            Row(children: [
              TextButton.icon(
                onPressed: _busy ? null : () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: Text(t.regenTitle),
                      content: Text(t.regenText),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t.cancel)),
                        TextButton(onPressed: () => Navigator.pop(context, true), child: Text(t.regenConfirm)),
                      ],
                    ),
                  );
                  if (ok == true) _invite(true, regenerate: true);
                },
                icon: Icon(LucideIcons.refreshCw, size: 15, color: c.textMuted),
                label: Text(t.regen, style: TextStyle(color: c.textMuted)),
              ),
              const Spacer(),
              TextButton(onPressed: _busy ? null : () => _invite(false), child: Text(t.close, style: TextStyle(color: c.danger))),
            ]),
          ],
        ],
      ]),
    );
  }

  Widget _tabs(v1api.LettersView v) {
    final c = context.c;
    final t = v.labels.tabs;
    final count = <String, int>{
      for (final s in const ['pending', 'approved', 'hidden']) s: v.letters.where((l) => l.status == s).length,
    };
    Widget tab(String id, String label) {
      final on = _tab == id;
      return InkWell(
        onTap: () => setState(() => _tab = id),
        child: Container(
          padding: const EdgeInsets.fromLTRB(2, 8, 2, 10),
          margin: const EdgeInsets.only(right: 18),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: on ? c.brand : Colors.transparent, width: 2))),
          child: Row(children: [
            Text(label, style: TextStyle(fontSize: 15, fontWeight: on ? FontWeight.w600 : FontWeight.w500, color: on ? c.text : c.textMuted)),
            if (count[id]! > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                decoration: BoxDecoration(color: id == 'pending' ? c.brand : c.surface, borderRadius: BorderRadius.circular(10)),
                child: Text('${count[id]}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: id == 'pending' ? Colors.white : c.textMuted)),
              ),
            ],
          ]),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
      child: Row(children: [tab('pending', t.pending), tab('approved', t.approved), tab('hidden', t.hidden)]),
    );
  }

  List<Widget> _list(v1api.LettersView v) {
    final c = context.c;
    final t = v.labels;
    final list = v.letters.where((l) => l.status == _tab).toList();
    if (list.isEmpty) {
      final title = switch (_tab) { 'approved' => t.empty.approved, 'hidden' => t.empty.hidden, _ => t.empty.pending };
      final text = switch (_tab) { 'approved' => t.emptyText.approved, 'hidden' => t.emptyText.hidden, _ => v.invite.enabled ? t.emptyText.pendingInvited : t.emptyText.pending };
      return [
        const SizedBox(height: 18),
        Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(text, style: TextStyle(fontSize: 14, height: 1.45, color: c.textMuted)),
      ];
    }
    return [
      if (_tab == 'approved' && list.length > 1) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(t.orderHint, style: TextStyle(fontSize: 13, color: c.textMuted))),
      for (var i = 0; i < list.length; i++)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _editing == list[i].id ? _EditLetter(l: list[i], v: v, onCancel: () => setState(() => _editing = null), onSave: (p) => _patch(list[i], p)) : _letter(v, list[i], i, list.length),
        ),
    ];
  }

  Widget _letter(v1api.LettersView v, v1api.Letter l, int index, int total) {
    final c = context.c;
    final t = v.labels;
    final long = l.text.length > 320;
    final open = _expanded.contains(l.id);
    Widget act(IconData icon, String label, VoidCallback? onTap, {Color? color}) => TextButton.icon(
          onPressed: onTap,
          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8), minimumSize: const Size(0, 40)),
          icon: Icon(icon, size: 15, color: color ?? c.text),
          label: Text(label, style: TextStyle(fontSize: 13.5, color: color ?? c.text)),
        );
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 14, 10, 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: Text.rich(TextSpan(children: [
            TextSpan(text: l.authorName, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)),
            if (l.relation.isNotEmpty) TextSpan(text: ' · ${l.relation}', style: TextStyle(fontSize: 14, color: c.textMuted)),
          ])),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: Text(l.text, maxLines: long && !open ? 6 : null, overflow: long && !open ? TextOverflow.fade : null, style: AppText.serif(context, size: 17).copyWith(height: 1.5)),
        ),
        if (long && !open) TextButton(onPressed: () => setState(() => _expanded.add(l.id)), child: Text(t.readMore, style: TextStyle(color: c.brand))),
        if (v.editable)
          Wrap(children: [
            if (l.status != 'approved') act(LucideIcons.check, t.approve, () => _patch(l, v1api.LetterPatch(status: 'approved')), color: c.brand),
            if (l.status == 'approved') act(LucideIcons.undo2, t.unapprove, () => _patch(l, v1api.LetterPatch(status: 'pending'))),
            act(LucideIcons.pencil, t.edit, () => setState(() => _editing = l.id)),
            if (l.status != 'hidden') act(LucideIcons.eyeOff, t.hide, () => _patch(l, v1api.LetterPatch(status: 'hidden'))),
            if (l.status == 'approved' && index > 0) IconButton(tooltip: t.moveUp, onPressed: () => _move(l, -1), icon: const Icon(LucideIcons.arrowUp, size: 16)),
            if (l.status == 'approved' && index < total - 1) IconButton(tooltip: t.moveDown, onPressed: () => _move(l, 1), icon: const Icon(LucideIcons.arrowDown, size: 16)),
            act(LucideIcons.trash2, t.delete, () => _delete(l), color: c.danger),
          ]),
      ]),
    );
  }
}

class _EditLetter extends StatefulWidget {
  const _EditLetter({required this.l, required this.v, required this.onCancel, required this.onSave});
  final v1api.Letter l;
  final v1api.LettersView v;
  final VoidCallback onCancel;
  final ValueChanged<v1api.LetterPatch> onSave;

  @override
  State<_EditLetter> createState() => _EditLetterState();
}

class _EditLetterState extends State<_EditLetter> {
  late final _author = TextEditingController(text: widget.l.authorName);
  late final _relation = TextEditingController(text: widget.l.relation);
  late final _text = TextEditingController(text: widget.l.text);

  @override
  void dispose() {
    _author.dispose();
    _relation.dispose();
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.v.labels;
    final max = widget.v.limits;
    return Panel(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: TextField(controller: _author, maxLength: max.authorName, decoration: const InputDecoration(counterText: ''))),
          const SizedBox(width: 8),
          Expanded(child: TextField(controller: _relation, maxLength: max.relation, decoration: InputDecoration(hintText: t.relation, counterText: ''))),
        ]),
        const SizedBox(height: 10),
        TextField(controller: _text, minLines: 5, maxLines: 14, maxLength: max.text, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(counterText: '')),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: CabinetButton(label: t.cancel, kind: CabBtn.outline, large: false, onPressed: widget.onCancel)),
          const SizedBox(width: 8),
          Expanded(
            child: CabinetButton(
              label: t.save,
              large: false,
              onPressed: () {
                if (_author.text.trim().isEmpty || _text.text.trim().isEmpty) return;
                widget.onSave(v1api.LetterPatch(authorName: _author.text.trim(), relation: _relation.text.trim(), text: _text.text.trim()));
              },
            ),
          ),
        ]),
      ]),
    );
  }
}
