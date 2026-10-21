import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/api.dart';
import '../core/chat_controller.dart';
import '../ui/avatar.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// «Переслать»: поиск по диалогам сотрудника, выбор до 10, кнопка отправки. Возвращает id выбранных диалогов.
Future<List<String>?> pickForwardTargets(BuildContext context, ChatController ctrl, {required String preview}) {
  return showAppSheet<List<String>>(
    context,
    title: 'Переслать',
    icon: LucideIcons.forward,
    full: true,
    builder: (_) => _ForwardList(ctrl: ctrl, preview: preview),
  );
}

class _ForwardList extends StatefulWidget {
  const _ForwardList({required this.ctrl, required this.preview});
  final ChatController ctrl;
  final String preview;

  @override
  State<_ForwardList> createState() => _ForwardListState();
}

class _ForwardListState extends State<_ForwardList> {
  List<ForwardTarget>? _list;
  String? _error;
  final _picked = <String, ForwardTarget>{};
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load(String q) async {
    try {
      final r = await widget.ctrl.forwardTargets(q);
      if (mounted) {
        setState(() {
          _list = r.where((t) => t.id != widget.ctrl.chatId).toList();
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toggle(ForwardTarget t) {
    setState(() {
      if (_picked.containsKey(t.id)) {
        _picked.remove(t.id);
      } else if (_picked.length < 10) {
        _picked[t.id] = t;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: double.infinity,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.md)),
          child: Text(widget.preview, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.sub(context)),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: AppSearchField(
            hint: 'Имя или номер',
            onChanged: (q) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 250), () => _load(q));
            },
          ),
        ),
        if (_picked.isNotEmpty)
          SizedBox(
            height: 38,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                for (final t in _picked.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: InputChip(
                      label: Text(t.title, style: TextStyle(color: c.onBrand, fontSize: 13.5)),
                      backgroundColor: c.brandDeep,
                      deleteIconColor: c.onBrand,
                      onDeleted: () => _toggle(t),
                      side: BorderSide.none,
                    ),
                  ),
              ],
            ),
          ),
        Flexible(
          child: _error != null
              ? Padding(
                  padding: const EdgeInsets.all(28),
                  child: Text(_error!, style: AppText.sub(context)),
                )
              : _list == null
              ? const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator()),
                )
              : _list!.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(40),
                  child: Text('Диалогов не нашлось', style: AppText.sub(context)),
                )
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: _list!.length,
                  itemBuilder: (_, i) {
                    final t = _list![i];
                    final on = _picked.containsKey(t.id);
                    return ListTile(
                      onTap: () => _toggle(t),
                      leading: AppAvatar(name: t.title, size: 42, channel: t.channel),
                      title: Text(
                        t.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: t.last.isEmpty ? null : Text(t.last, maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: AnimatedContainer(
                        duration: const Duration(milliseconds: 120),
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: on ? c.brandDeep : Colors.transparent,
                          border: Border.all(color: on ? c.brandDeep : c.textFaint, width: 1.6),
                        ),
                        child: on ? Icon(LucideIcons.check, size: 15, color: c.onBrand) : null,
                      ),
                    );
                  },
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: PrimaryButton(
              label: _picked.isEmpty ? 'Выберите диалоги' : 'Переслать (${_picked.length})',
              icon: LucideIcons.forward,
              onPressed: _picked.isEmpty ? null : () => Navigator.of(context).pop(_picked.keys.toList()),
            ),
          ),
        ),
      ],
    );
  }
}
