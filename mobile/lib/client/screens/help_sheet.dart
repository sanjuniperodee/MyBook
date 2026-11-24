import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/cabinet.dart';

/// Кнопка помощника по книге — как на сайте (HelpChat): белый квадрат со спасательным кругом в правом нижнем углу.
/// section — раздел кабинета (overview, text, photos…): от него частые вопросы в пустом чате.
class HelpButton extends StatelessWidget {
  const HelpButton({super.key, required this.bookId, required this.section});
  final String bookId;
  final String section;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: c.surfaceRaised,
      elevation: 6,
      shadowColor: Colors.black.withValues(alpha: 0.25),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.panel), side: BorderSide(color: c.border)),
      child: InkWell(
        borderRadius: BorderRadius.circular(Cab.panel),
        onTap: () => showHelp(context, bookId: bookId, section: section),
        child: SizedBox(width: 56, height: 56, child: Icon(LucideIcons.lifeBuoy, size: 26, color: c.brand)),
      ),
    );
  }
}

Future<void> showHelp(BuildContext context, {required String bookId, required String section}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.c.bg,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Cab.sheet))),
    builder: (_) => FractionallySizedBox(heightFactor: 0.88, child: _HelpChat(bookId: bookId, section: section)),
  );
}

class _HelpChat extends StatefulWidget {
  const _HelpChat({required this.bookId, required this.section});
  final String bookId;
  final String section;

  @override
  State<_HelpChat> createState() => _HelpChatState();
}

class _HelpChatState extends State<_HelpChat> {
  late final ClientSession _session = context.read<ClientSession>();
  final _text = TextEditingController();
  final _scroll = ScrollController();
  v1api.CabinetHelp? _help;
  List<v1api.HelpMessage> _messages = [];
  List<String> _suggestions = [];
  bool _typing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final h = await _session.backend.help(widget.bookId, widget.section);
      if (!mounted) return;
      setState(() {
        _help = h;
        _messages = h.messages;
        _error = null;
      });
      _toBottom();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  Future<void> _ask(String text, {bool human = false}) async {
    final q = text.trim();
    if ((q.isEmpty && !human) || _typing) return;
    _text.clear();
    setState(() {
      _typing = true;
      _error = null;
      _suggestions = [];
      if (q.isNotEmpty) _messages = [..._messages, v1api.HelpMessage(id: 'local-${DateTime.now().microsecondsSinceEpoch}', from: 'client', at: DateTime.now().toIso8601String(), text: q, place: '')];
    });
    _toBottom();
    try {
      final r = await _session.backend.askHelp(widget.bookId, q, human: human);
      if (!mounted) return;
      setState(() {
        _messages = r.messages;
        _suggestions = r.suggestions;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _typing = false);
      _toBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final h = _help;
    final l = h?.labels;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(children: [
        const SizedBox(height: 8),
        Container(width: 38, height: 4, decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(2))),
        // Шапка: значок, «Помощник по книге», «Отвечает сразу · знает кабинет и вашу книгу», закрыть.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
          child: Row(children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(color: c.bubbleOut, borderRadius: BorderRadius.circular(Cab.ctl)), child: Icon(LucideIcons.lifeBuoy, size: 21, color: c.brand)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l?.title ?? 'Помощник по книге', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                if (l != null) Text(l.subtitle, style: TextStyle(fontSize: 13, color: c.textMuted)),
              ]),
            ),
            IconButton(icon: Icon(LucideIcons.x, color: c.textMuted), onPressed: () => Navigator.of(context).pop()),
          ]),
        ),
        Divider(height: 1, color: c.border),
        Expanded(
          child: h == null
              ? Center(child: _error == null ? const CircularProgressIndicator() : Text(_error!, style: TextStyle(color: c.danger)))
              : ListView(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                  children: [
                    if (!h.enabled) ...[
                      _Bubble(from: 'bot', text: h.labels.off, label: h.labels.bot),
                    ] else ...[
                      _Bubble(from: 'bot', text: h.labels.hello, label: h.labels.bot),
                      for (final m in _messages) _Bubble(from: m.from, text: m.text, place: m.place, label: m.from == 'manager' ? h.labels.manager : (m.from == 'bot' ? h.labels.bot : null)),
                      if (_typing) Padding(padding: const EdgeInsets.only(top: 6), child: Text(h.labels.typing, style: TextStyle(fontSize: 13.5, color: c.textMuted, fontStyle: FontStyle.italic))),
                      if (_messages.isEmpty && !_typing) ...[
                        const SizedBox(height: 10),
                        Text(h.labels.faqTitle, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
                        const SizedBox(height: 8),
                        for (final q in h.hints) _Chip(text: q, onTap: () => _ask(q)),
                      ],
                      if (_suggestions.isNotEmpty) ...[const SizedBox(height: 6), for (final q in _suggestions) _Chip(text: q, onTap: () => _ask(q))],
                      if (_messages.any((m) => m.from == 'bot') && !_typing)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton(onPressed: () => _ask('', human: true), child: Text(h.labels.notHelped, style: TextStyle(color: c.brand))),
                        ),
                    ],
                    if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: c.danger, fontSize: 14))),
                  ],
                ),
        ),
        if (h != null && h.enabled)
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            decoration: BoxDecoration(color: c.surfaceRaised, border: Border(top: BorderSide(color: c.border))),
            child: SafeArea(
              top: false,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Row(children: [
                  Expanded(
                    child: TextField(
                      controller: _text,
                      minLines: 1,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(hintText: h.labels.placeholder, isDense: true),
                      onSubmitted: _ask,
                    ),
                  ),
                  IconButton(icon: Icon(LucideIcons.send, color: c.brand), onPressed: _typing ? null : () => _ask(_text.text)),
                ]),
                Padding(padding: const EdgeInsets.only(top: 6), child: Text(h.labels.disclaimer, textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: c.textFaint))),
              ]),
            ),
          )
        else if (h != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: SafeArea(top: false, child: CabinetButton(label: h.labels.whatsapp, icon: LucideIcons.messageCircle, large: false, onPressed: () => launchUrl(Uri.parse(h.whatsapp), mode: LaunchMode.externalApplication))),
          ),
      ]),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.from, required this.text, this.place = '', this.label});
  final String from;
  final String text;
  final String place;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final mine = from == 'client';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(color: mine ? c.text : (from == 'manager' ? c.violetBg : c.surfaceRaised), borderRadius: BorderRadius.circular(Cab.panel), border: mine ? null : Border.all(color: c.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (label != null) Text(label!, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: from == 'manager' ? c.violet : c.brand)),
          if (place.isNotEmpty) Text(place, style: TextStyle(fontSize: 12, color: mine ? c.bg.withValues(alpha: 0.7) : c.textMuted)),
          if (text.isNotEmpty) Text(text, style: TextStyle(fontSize: 15, height: 1.45, color: mine ? c.bg : c.text)),
        ]),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text, required this.onTap});
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: c.surfaceRaised,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl), side: BorderSide(color: c.border)),
        child: InkWell(
          borderRadius: BorderRadius.circular(Cab.ctl),
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10), child: Row(children: [Expanded(child: Text(text, style: const TextStyle(fontSize: 14.5))), Icon(LucideIcons.chevronRight, size: 16, color: c.textFaint)])),
        ),
      ),
    );
  }
}
