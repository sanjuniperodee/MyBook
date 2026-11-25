import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/links.dart';
import '../core/format.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../widgets/crm_form.dart';
import 'chat_screen.dart';
import 'support_screen.dart';

/// Обращения — как /admin/support: открытые (срочные и старые сверху), по статусу, поиск; руководитель видит и ведёт все,
/// остальные — свои. Новое обращение — экран SupportScreen. Данные — API v1 crmSupport*.
class TicketsScreen extends StatefulWidget {
  const TicketsScreen({super.key});

  @override
  State<TicketsScreen> createState() => _TicketsScreenState();
}

class _TicketsScreenState extends State<TicketsScreen> {
  v1api.SupportList? _l;
  String? _error;
  String _status = 'open';
  String _q = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final l = await v1(context.read<AuthState>().api, (c) => c.crmSupportList(status: _status, q: _q.isEmpty ? null : _q));
      if (mounted) {
        setState(() {
          _l = l;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  int _count(String key) {
    final counts = _l?.counts ?? const {};
    int n(String k) => (counts[k] as num?)?.toInt() ?? 0;
    if (key == 'open') return n('new') + n('in_progress') + n('waiting');
    if (key == 'all') return counts.values.fold<int>(0, (a, b) => a + ((b as num?)?.toInt() ?? 0));
    return n(key);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final l = _l;
    final filters = [('open', 'Открытые'), for (final s in l?.statuses ?? const <v1api.Choice>[]) (s.id, s.label), ('all', 'Все')];
    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        color: c.brand,
        onRefresh: _load,
        child: CustomScrollView(physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()), slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 10, 12, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text('Обращения', style: AppText.largeTitle(context))),
                  RoundIconButton(
                    icon: LucideIcons.plus,
                    size: 44,
                    iconSize: 24,
                    color: c.brand,
                    tooltip: 'Новое обращение',
                    onTap: () async {
                      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SupportScreen()));
                      _load();
                    },
                  ),
                ]),
                if (l != null && !l.canManage) Padding(padding: const EdgeInsets.only(top: 2, right: 8), child: Text('Ваши обращения: когда исправят — придёт сообщение в WhatsApp', style: AppText.sub(context))),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: AppSearchField(hint: '№, текст, имя, телефон', onChanged: (v) => _q = v.trim(), onSubmitted: (_) => _load()),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 36,
                  child: ListView(scrollDirection: Axis.horizontal, clipBehavior: Clip.none, children: [
                    for (final (key, label) in filters)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterPill(label: label, count: l == null ? null : _count(key), selected: _status == key, onTap: () {
                          setState(() => _status = key);
                          _load();
                        }),
                      ),
                  ]),
                ),
                const SizedBox(height: 8),
              ]),
            ),
          ),
          if (l == null)
            SliverFillRemaining(child: _error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          else if (l.tickets.isEmpty)
            const SliverFillRemaining(child: EmptyState(icon: LucideIcons.lifeBuoy, title: 'Обращений нет', hint: 'Что-то не работает у клиента или нужно изменить CRM — нажмите «+»'))
          else
            SliverList.separated(
              itemCount: l.tickets.length,
              separatorBuilder: (_, _) => Divider(indent: 20, color: c.border),
              itemBuilder: (context, i) {
                final t = l.tickets[i];
                return InkWell(
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TicketScreen(number: t.number)));
                    _load();
                  },
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 16, 12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Text('№${t.number}', style: AppText.headline(context)),
                        const SizedBox(width: 8),
                        _StatusDot(status: t.status, label: t.statusLabel),
                        if (t.urgent) ...[const SizedBox(width: 8), Tag('срочно', fg: c.danger, bg: c.dangerBg)],
                        const Spacer(),
                        Text(_date(t.createdAt), style: AppText.caption(context)),
                      ]),
                      const SizedBox(height: 4),
                      Text(t.text, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.body(context).copyWith(fontSize: 15)),
                      const SizedBox(height: 3),
                      Text([t.kindLabel, if (t.reporter.isNotEmpty) t.reporter, if (t.attachments > 0) 'вложений: ${t.attachments}'].join(' · '), style: AppText.caption(context)),
                    ]),
                  ),
                );
              },
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 40)),
        ]),
      ),
    );
  }
}

String _date(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  return d == null ? '' : '${two(d.day)}.${two(d.month)} ${hhmm(d)}';
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.status, required this.label});
  final String status;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final color = switch (status) { 'new' => c.brand, 'in_progress' => c.violet, 'waiting' => c.warn, 'done' => c.success, _ => c.textFaint };
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 5),
      Text(label, style: AppText.caption(context).copyWith(color: c.text, fontWeight: FontWeight.w500)),
    ]);
  }
}

/// Обращение: суть от AI, как написали, вложения (фото, голосовые с расшифровкой, видео, файлы), переписка клиента,
/// выкаченные коммиты и история; руководителю — статус, «что сделали», заметка и сообщение автору в WhatsApp.
class TicketScreen extends StatefulWidget {
  const TicketScreen({super.key, required this.number});
  final int number;

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  v1api.SupportTicketView? _t;
  String? _error;
  final _player = AudioPlayer();
  String? _playing;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final t = await v1(_api, (c) => c.crmSupportTicket(number: widget.number));
      if (mounted) {
        setState(() {
          _t = t;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _play(v1api.SupportFile f) async {
    if (_playing == f.id) {
      await _player.stop();
      setState(() => _playing = null);
      return;
    }
    try {
      await _player.setAudioSource(AudioSource.uri(_api.uri(f.url), headers: {'Authorization': 'Bearer ${_api.token}'}));
      setState(() => _playing = f.id);
      await _player.play();
      if (mounted) setState(() => _playing = null);
    } catch (_) {
      _toast('Не удалось воспроизвести');
    }
  }

  Future<void> _manage() async {
    final t = _t!;
    final r = await showAppSheet<bool>(context, title: 'Обращение №${t.number}', icon: LucideIcons.lifeBuoy, full: true, builder: (_) => _ManageForm(api: _api, t: t));
    if (r == true) await _load();
  }

  Future<void> _notify() async {
    try {
      final r = await v1(_api, (c) => c.crmSupportNotify(number: widget.number));
      _toast(r.message ?? 'Автору написали');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final t = _t;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        title: Text('Обращение №${widget.number}', style: AppText.headline(context)),
        actions: [
          if (t != null && t.canManage)
            RoundIconButton(icon: LucideIcons.copy, size: 44, iconSize: 19, tooltip: 'Номер для Claude', onTap: () {
              Clipboard.setData(ClipboardData(text: 'обращение ${t.number}'));
              _toast('Скопировано: обращение ${t.number}');
            }),
          const SizedBox(width: 6),
        ],
      ),
      body: t == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              color: c.brand,
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 40), children: [
                Row(children: [
                  _StatusDot(status: t.status, label: t.statusLabel),
                  if (t.urgent) ...[const SizedBox(width: 8), Tag('срочно', fg: c.danger, bg: c.dangerBg)],
                  const Spacer(),
                  Text('${t.kindLabel} · ${_date(t.createdAt)}', style: AppText.caption(context)),
                ]),
                if (t.reporter.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('От: ${t.reporter}', style: AppText.caption(context))),
                const SizedBox(height: 14),
                if (t.canManage) ...[
                  PrimaryButton(label: 'Статус и решение', icon: LucideIcons.pencil, onPressed: _manage),
                  const SizedBox(height: 16),
                ],
                _block(context, 'Суть', t.summary.isEmpty ? 'Разбираем вложения — обновите через минуту' : t.summary),
                _block(context, 'Как написали', [t.description.isEmpty ? 'Текста нет — всё во вложениях' : t.description, if (t.place.isNotEmpty) 'Где: ${t.place}', if (t.expected.isNotEmpty) 'Как должно быть: ${t.expected}'].join('\n\n')),
                if (t.resolution.isNotEmpty) _block(context, 'Что сделали', t.resolution),
                if (t.devNote.isNotEmpty) _block(context, 'Заметка для разработки', t.devNote),
                if (t.files.isNotEmpty)
                  GroupCard(title: 'Вложения', padding: const EdgeInsets.only(bottom: 16), children: [
                    for (final f in t.files)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          InkWell(
                            onTap: f.kind == 'audio' ? () => _play(f) : () => openFile(context, f.url, title: f.name),
                            child: Row(children: [
                              Icon(
                                f.kind == 'audio' ? (_playing == f.id ? LucideIcons.circleStop : LucideIcons.circlePlay) : f.kind == 'image' ? LucideIcons.image : f.kind == 'video' ? LucideIcons.video : LucideIcons.fileText,
                                size: 22,
                                color: c.brandDeep,
                              ),
                              const SizedBox(width: 10),
                              Expanded(child: Text(f.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.body(context).copyWith(fontSize: 15))),
                              Text('${(f.size / 1024 / 1024).toStringAsFixed(1)} МБ', style: AppText.caption(context)),
                            ]),
                          ),
                          if (f.kind == 'image')
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(_api.uri(f.url).toString(), headers: {'Authorization': 'Bearer ${_api.token}'}, height: 220, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink())),
                            ),
                          if (f.transcript != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(f.transcript!, style: AppText.sub(context).copyWith(color: c.text))),
                          if (f.transcript == null && f.transcriptError != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Не расшифровано: ${f.transcriptError}', style: AppText.caption(context))),
                        ]),
                      ),
                  ]),
                if (t.chat.isNotEmpty)
                  GroupCard(title: 'Переписка с клиентом', padding: const EdgeInsets.only(bottom: 16), children: [
                    for (final m in t.chat)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        color: m.inbound ? c.surface.withValues(alpha: 0.5) : null,
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${m.inbound ? 'клиент' : 'магазин'} · ${_date(m.at)}', style: AppText.caption(context)),
                          const SizedBox(height: 2),
                          Text(m.text, style: AppText.body(context).copyWith(fontSize: 15)),
                        ]),
                      ),
                    if (t.chatId != null) GroupTile(title: 'Открыть чат', icon: LucideIcons.messageCircle, onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatScreen(chatId: t.chatId!)))),
                  ]),
                if (t.commits.isNotEmpty)
                  GroupCard(title: 'Выкачено', padding: const EdgeInsets.only(bottom: 16), children: [
                    for (final cm in t.commits) GroupTile(title: cm.subject, subtitle: '${cm.sha.substring(0, 7)} · ${_date(cm.at)}', icon: LucideIcons.gitCommitHorizontal),
                  ]),
                if (t.canManage)
                  GroupCard(title: 'Автор', padding: const EdgeInsets.only(bottom: 16), children: [
                    GroupTile(
                      title: 'Написать автору сейчас',
                      subtitle: t.notifyError != null ? 'прошлое сообщение не ушло: ${t.notifyError}' : t.notifiedAt != null ? 'последнее — ${_date(t.notifiedAt!)}' : 'номер, статус и что сделали — в WhatsApp',
                      icon: LucideIcons.send,
                      onTap: _notify,
                    ),
                  ]),
                if (t.history.isNotEmpty)
                  GroupCard(title: 'История', padding: EdgeInsets.zero, children: [
                    for (final e in t.history.reversed)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        child: Text('${_date(e.at)} · ${e.by}: ${e.text}', style: AppText.caption(context)),
                      ),
                  ]),
              ]),
            ),
    );
  }

  Widget _block(BuildContext context, String title, String text) => GroupCard(title: title, padding: const EdgeInsets.only(bottom: 16), children: [
        Container(width: double.infinity, padding: const EdgeInsets.all(14), child: SelectableText(text, style: AppText.body(context).copyWith(fontSize: 15, height: 1.4))),
      ]);
}

/// Статус, что сделали, заметка и галочка «написать автору» — как форма в карточке обращения на сайте.
class _ManageForm extends StatefulWidget {
  const _ManageForm({required this.api, required this.t});
  final ApiClient api;
  final v1api.SupportTicketView t;

  @override
  State<_ManageForm> createState() => _ManageFormState();
}

class _ManageFormState extends State<_ManageForm> {
  late String _status = widget.t.status;
  late final _resolution = TextEditingController(text: widget.t.resolution);
  late final _note = TextEditingController(text: widget.t.devNote);
  bool _notify = true;
  bool _busy = false;
  String? _error;

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final r = await v1(widget.api, (c) => c.crmSupportUpdate(number: widget.t.number, body: v1api.SupportUpdateBody(status: _status, resolution: _resolution.text.trim(), devNote: _note.text.trim(), notify: _notify)));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r.message ?? 'Сохранено')));
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const FormLabel('Статус'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in widget.t.statuses) FilterPill(label: s.label, selected: _status == s.id, onTap: () => setState(() => _status = s.id)),
          ]),
          const SizedBox(height: 16),
          LabeledField(label: 'Что сделали', controller: _resolution, lines: 3, note: 'Это увидит автор в сообщении'),
          LabeledField(label: 'Заметка для разработки', controller: _note, lines: 3),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: Text('Написать автору в WhatsApp', style: AppText.body(context)),
            value: _notify,
            activeTrackColor: c.brand,
            onChanged: (v) => setState(() => _notify = v),
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: c.danger))),
          PrimaryButton(label: 'Сохранить', busy: _busy, onPressed: _save),
        ]),
      ),
    );
  }
}
