import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'tokens.dart';

// ─── кнопки ──────────────────────────────────────────────────────────────────

/// Главная кнопка: заливка брендовым цветом, высота 52, скругление 14, индикатор вместо текста во время работы.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.busy = false, this.icon, this.danger = false});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final enabled = onPressed != null && !busy;
    final bg = danger ? c.danger : c.brandDeep;
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: Material(
        color: enabled ? bg : bg.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: enabled
              ? () {
                  HapticFeedback.selectionClick();
                  onPressed!();
                }
              : null,
          child: Center(
            child: busy
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                : Row(mainAxisSize: MainAxisSize.min, children: [
                    if (icon != null) ...[Icon(icon, size: 19, color: Colors.white), const SizedBox(width: 8)],
                    Text(label, style: const TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w600, letterSpacing: -0.2)),
                  ]),
          ),
        ),
      ),
    );
  }
}

/// Круглая иконка-кнопка (шапка, поле ответа).
class RoundIconButton extends StatelessWidget {
  const RoundIconButton({super.key, required this.icon, required this.onTap, this.size = 40, this.color, this.fill, this.tooltip, this.iconSize = 22});
  final IconData icon;
  final VoidCallback? onTap;
  final double size;
  final double iconSize;
  final Color? color;
  final Color? fill;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final btn = SizedBox(
      width: size,
      height: size,
      child: Material(
        color: fill ?? Colors.transparent,
        shape: const CircleBorder(),
        child: InkResponse(
          customBorder: const CircleBorder(),
          onTap: onTap,
          radius: size * 0.6,
          child: Center(child: Icon(icon, size: iconSize, color: color ?? c.text)),
        ),
      ),
    );
    return tooltip == null ? btn : Tooltip(message: tooltip!, child: btn);
  }
}

// ─── поля и «пилюли» ─────────────────────────────────────────────────────────

/// Поле поиска как в iOS: серая «таблетка» с лупой и кнопкой очистки.
class AppSearchField extends StatefulWidget {
  const AppSearchField({super.key, required this.hint, required this.onChanged, this.onSubmitted, this.initial = ''});
  final String hint;
  final String initial;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<AppSearchField> createState() => _AppSearchFieldState();
}

class _AppSearchFieldState extends State<AppSearchField> {
  late final _c = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      height: 40,
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(children: [
        Icon(LucideIcons.search, size: 18, color: c.textFaint),
        const SizedBox(width: 8),
        Expanded(
          child: TextField(
            controller: _c,
            onChanged: (v) {
              widget.onChanged(v);
              setState(() {});
            },
            onSubmitted: widget.onSubmitted,
            textInputAction: TextInputAction.search,
            style: TextStyle(fontSize: 16, color: c.text),
            decoration: InputDecoration(hintText: widget.hint, hintStyle: TextStyle(color: c.textFaint, fontSize: 16), border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none, filled: false, isDense: true, contentPadding: EdgeInsets.zero),
          ),
        ),
        if (_c.text.isNotEmpty)
          GestureDetector(
            onTap: () {
              _c.clear();
              widget.onChanged('');
              setState(() {});
            },
            child: Icon(LucideIcons.circleX, size: 18, color: c.textFaint),
          ),
      ]),
    );
  }
}

/// Фильтр-«пилюля»: выбранный — тоном бренда, остальные — серые.
class FilterPill extends StatelessWidget {
  const FilterPill({super.key, required this.label, required this.selected, required this.onTap, this.count, this.dot});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final int? count;
  final Color? dot;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final fg = selected ? c.brandDeep : c.textMuted;
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(color: selected ? c.brand.withValues(alpha: context.isDark ? 0.22 : 0.14) : c.surface, borderRadius: BorderRadius.circular(18)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (dot != null) ...[Container(width: 8, height: 8, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)), const SizedBox(width: 7)],
          Text(label, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: fg, letterSpacing: -0.15)),
          if (count != null) ...[const SizedBox(width: 6), Text('$count', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: fg.withValues(alpha: 0.7)))],
        ]),
      ),
    );
  }
}

/// Счётчик непрочитанного: зелёная «таблетка».
class CountBadge extends StatelessWidget {
  const CountBadge(this.count, {super.key, this.color});
  final int count;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      constraints: const BoxConstraints(minWidth: 21, minHeight: 21),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color ?? c.brand, borderRadius: BorderRadius.circular(11)),
      child: Text(count > 99 ? '99+' : '$count', style: TextStyle(color: c.onBrand, fontSize: 12.5, fontWeight: FontWeight.w700, height: 1.15)),
    );
  }
}

/// Тег: короткая цветная метка (ждёт ответа, бот ведёт, канал).
class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, required this.fg, required this.bg, this.icon});
  final String text;
  final Color fg;
  final Color bg;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 12, color: fg), const SizedBox(width: 4)],
          Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg, height: 1.15)),
        ]),
      );
}

// ─── состояния ───────────────────────────────────────────────────────────────

/// Пустой экран или ошибка: иконка в тоновом круге, заголовок, пояснение и (необязательно) кнопка.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.hint, this.action, this.onAction});
  final IconData icon;
  final String title;
  final String? hint;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 40),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 76, height: 76, decoration: BoxDecoration(color: c.surface, shape: BoxShape.circle), child: Icon(icon, size: 32, color: c.textFaint)),
          const SizedBox(height: 18),
          Text(title, textAlign: TextAlign.center, style: AppText.headline(context)),
          if (hint != null) ...[const SizedBox(height: 6), Text(hint!, textAlign: TextAlign.center, style: AppText.sub(context))],
          if (action != null) ...[
            const SizedBox(height: 18),
            TextButton(onPressed: onAction, child: Text(action!, style: TextStyle(color: c.brandDeep, fontWeight: FontWeight.w600, fontSize: 16))),
          ],
        ]),
      ),
    );
  }
}

/// Мерцающая заготовка: пока данные грузятся, список выглядит как список, а не крутилка по центру.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});
  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 1300))..repeat();

  @override
  void dispose() {
    _a.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = context.c.surface;
    final hi = context.isDark ? const Color(0xFF263640) : const Color(0xFFFFFFFF);
    return AnimatedBuilder(
      animation: _a,
      builder: (_, child) => ShaderMask(
        blendMode: BlendMode.srcATop,
        shaderCallback: (r) => LinearGradient(colors: [base, hi, base], stops: const [0.25, 0.5, 0.75], begin: Alignment(-1.5 + _a.value * 3, 0), end: Alignment(-0.5 + _a.value * 3, 0)).createShader(r),
        child: child,
      ),
      child: widget.child,
    );
  }
}

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, required this.height, this.radius = 8});
  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(width: width, height: height, decoration: BoxDecoration(color: context.c.surface, borderRadius: BorderRadius.circular(radius)));
}

/// Заготовка списка диалогов.
class ChatListSkeleton extends StatelessWidget {
  const ChatListSkeleton({super.key, this.rows = 9});
  final int rows;

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        itemCount: rows,
        itemBuilder: (_, i) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          child: Row(children: [
            const SkeletonBox(width: 54, height: 54, radius: 27),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [SkeletonBox(width: 120 + (i % 3) * 30.0, height: 15), const Spacer(), const SkeletonBox(width: 34, height: 12)]),
                const SizedBox(height: 9),
                SkeletonBox(width: 180 + (i % 4) * 22.0, height: 13),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

// ─── листы и группы ──────────────────────────────────────────────────────────

/// Нижний лист: скругление 24, «ручка», заголовок. Содержимое прокручивается, если не помещается.
Future<T?> showAppSheet<T>(BuildContext context, {String? title, IconData? icon, required WidgetBuilder builder, bool full = false}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.c.surfaceRaised,
    builder: (ctx) {
      final c = ctx.c;
      return Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * (full ? 0.94 : 0.8)),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const SizedBox(height: 8),
            Container(width: 38, height: 5, decoration: BoxDecoration(color: c.textFaint.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(3))),
            if (title != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Row(children: [
                  if (icon != null) ...[Icon(icon, size: 22, color: c.brandDeep), const SizedBox(width: 10)],
                  Expanded(child: Text(title, style: AppText.title(ctx))),
                ]),
              )
            else
              const SizedBox(height: 8),
            Flexible(child: builder(ctx)),
          ]),
        ),
      );
    },
  );
}

/// Группа строк на сером фоне (inset grouped, как «Настройки» в iOS).
class GroupCard extends StatelessWidget {
  const GroupCard({super.key, this.title, required this.children, this.padding = const EdgeInsets.fromLTRB(16, 0, 16, 16)});
  final String? title;
  final List<Widget> children;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: padding,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (title != null) Padding(padding: const EdgeInsets.fromLTRB(6, 0, 6, 8), child: Text(title!.toUpperCase(), style: AppText.label(context))),
        Container(
          decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Rd.lg), border: Border.all(color: c.border, width: 0.6)),
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (var i = 0; i < children.length; i++) ...[children[i], if (i < children.length - 1) Divider(indent: 16, color: c.border)],
          ]),
        ),
      ]),
    );
  }
}

/// Строка группы: значок в цветном квадрате, заголовок, пояснение, действие справа.
class GroupTile extends StatelessWidget {
  const GroupTile({super.key, required this.title, this.subtitle, this.icon, this.iconColor, this.trailing, this.onTap, this.destructive = false});
  final String title;
  final String? subtitle;
  final IconData? icon;
  final Color? iconColor;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final accent = destructive ? c.danger : (iconColor ?? c.brandDeep);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          if (icon != null) ...[
            Container(width: 34, height: 34, decoration: BoxDecoration(color: accent.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(9)), child: Icon(icon, size: 19, color: accent)),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w500, color: destructive ? c.danger : c.text, letterSpacing: -0.2)),
              if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(subtitle!, style: AppText.caption(context).copyWith(fontSize: 13.5))),
            ]),
          ),
          if (trailing != null) trailing! else if (onTap != null && !destructive) Icon(LucideIcons.chevronRight, size: 18, color: c.textFaint),
        ]),
      ),
    );
  }
}

/// Диалог подтверждения в системном стиле платформы.
Future<bool> confirm(BuildContext context, {required String title, String? message, String ok = 'Да', bool destructive = false}) async {
  final r = await showCupertinoDialog<bool>(
    context: context,
    builder: (_) => CupertinoAlertDialog(
      title: Text(title),
      content: message == null ? null : Text(message),
      actions: [
        CupertinoDialogAction(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
        CupertinoDialogAction(isDestructiveAction: destructive, isDefaultAction: !destructive, onPressed: () => Navigator.pop(context, true), child: Text(ok)),
      ],
    ),
  );
  return r == true;
}

/// Короткое поле ввода в диалоге (заметка, причина).
Future<String?> promptText(BuildContext context, {required String title, String? hint, String ok = 'Сохранить', String initial = '', int lines = 1}) async {
  final ctl = TextEditingController(text: initial);
  final r = await showCupertinoDialog<String>(
    context: context,
    builder: (_) => CupertinoAlertDialog(
      title: Text(title),
      content: Padding(
        padding: const EdgeInsets.only(top: 12),
        child: CupertinoTextField(controller: ctl, placeholder: hint, autofocus: true, minLines: lines, maxLines: lines == 1 ? 1 : 6),
      ),
      actions: [
        CupertinoDialogAction(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
        CupertinoDialogAction(isDefaultAction: true, onPressed: () => Navigator.pop(context, ctl.text), child: Text(ok)),
      ],
    ),
  );
  final v = r?.trim();
  return v == null || v.isEmpty ? null : v;
}
