import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../ui/tokens.dart';
import 'cabinet.dart';
import 'motion.dart';

/// Шапка экранов книги (BookTitleRow сайта): «назад», мини-обложка, название засечками и тема, справа — действия.
class BookHeader extends StatelessWidget implements PreferredSizeWidget {
  const BookHeader({
    super.key,
    required this.bookId,
    required this.title,
    required this.kind,
    required this.coverUrl,
    this.actions = const [],
  });
  final String bookId;
  final String title;
  final String kind;
  final String coverUrl;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: [
              IconButton(
                icon: Icon(LucideIcons.chevronLeft, color: c.textMuted),
                onPressed: () => Navigator.of(context).maybePop(),
              ),
              if (coverUrl.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: CoverImage(url: coverUrl, width: 30, flat: true),
                ),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.serif(
                        context,
                        size: 19,
                        weight: FontWeight.w500,
                      ).copyWith(height: 1.1),
                    ),
                    Text(
                      kind,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: c.textMuted),
                    ),
                  ],
                ),
              ),
              ...actions,
              const SizedBox(width: 12),
            ],
          ),
        ),
      ),
    );
  }
}

/// Узел пути книги (StepNode): галочка — готово, кольцо с долей — в работе, «!» — поправить, номер — не начато.
class StepNode extends StatelessWidget {
  const StepNode({
    super.key,
    required this.status,
    required this.fraction,
    required this.n,
    this.large = false,
    this.current = false,
  });
  final String status;
  final double fraction;
  final int n;
  final bool large;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final size = large ? 32.0 : 22.0;
    final icon = large ? 16.0 : 12.0;
    switch (status) {
      case 'done':
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: c.success.withValues(alpha: 0.13),
            shape: BoxShape.circle,
          ),
          child: Icon(LucideIcons.check, size: icon, color: c.success),
        );
      case 'attention':
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(color: c.warnBg, shape: BoxShape.circle),
          child: Icon(LucideIcons.triangleAlert, size: icon, color: c.warn),
        );
      case 'partial':
        return SizedBox(
          width: size,
          height: size,
          child: CustomPaint(
            painter: _Ring(
              fraction: math.max(18 / 360, fraction),
              color: c.brand,
              track: c.wallpaperInk,
            ),
            child: Center(
              child: Text(
                '$n',
                style: TextStyle(
                  fontSize: large ? 13 : 10.5,
                  fontWeight: FontWeight.w600,
                  color: c.text.withValues(alpha: 0.8),
                ),
              ),
            ),
          ),
        );
      default:
        return Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: current ? c.brand : c.wallpaperInk),
          ),
          child: Text(
            '$n',
            style: TextStyle(
              fontSize: large ? 13 : 10.5,
              fontWeight: FontWeight.w600,
              color: current ? c.brand : c.textMuted,
            ),
          ),
        );
    }
  }
}

class _Ring extends CustomPainter {
  _Ring({required this.fraction, required this.color, required this.track});
  final double fraction;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.width / 2;
    final w = size.width * 0.1;
    final rect = Rect.fromCircle(center: Offset(r, r), radius: r - w / 2);
    canvas.drawArc(
      rect,
      0,
      math.pi * 2,
      false,
      Paint()
        ..color = track
        ..style = PaintingStyle.stroke
        ..strokeWidth = w,
    );
    canvas.drawArc(
      rect,
      -math.pi / 2,
      math.pi * 2 * fraction,
      false,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = w,
    );
  }

  @override
  bool shouldRepaint(_Ring old) =>
      old.fraction != fraction || old.color != color;
}

/// Шаг ленты под шапкой книги.
class BookStep {
  const BookStep({
    required this.key,
    required this.label,
    required this.status,
    required this.fraction,
  });
  final String key;
  final String label;
  final String status;
  final double fraction;
}

/// Лента разделов книги (BookTabs): «Обзор» и шаги пути через тире; активный подчёркнут винной чертой.
class StepTabs extends StatelessWidget {
  const StepTabs({
    super.key,
    required this.steps,
    required this.active,
    required this.onTap,
  });
  final List<BookStep> steps;

  /// 'hub' — обзор, иначе ключ шага.
  final String active;
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    Widget tab(String key, Widget lead, String label) {
      final on = key == active;
      return InkWell(
        onTap: () => onTap(key),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: on ? c.brand : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Row(
            children: [
              lead,
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w500,
                  color: on ? c.text : c.text.withValues(alpha: 0.85),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final items = <Widget>[
      tab(
        'hub',
        Icon(LucideIcons.layoutGrid, size: 18, color: c.brand),
        'Обзор',
      ),
      Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Container(width: 1, height: 22, color: c.border),
        ),
      ),
    ];
    for (var i = 0; i < steps.length; i++) {
      if (i > 0)
        items.add(
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Container(width: 14, height: 1, color: c.wallpaperInk),
            ),
          ),
        );
      items.add(
        tab(
          steps[i].key,
          StepNode(
            status: steps[i].status,
            fraction: steps[i].fraction,
            n: i + 1,
            current: steps[i].key == active,
          ),
          steps[i].label,
        ),
      );
    }
    return Container(
      height: 52,
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: items,
      ),
    );
  }
}

/// Лист кабинета (.panel): белый, рамка line, радиус 14.
class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.color,
  });
  final Widget child;
  final EdgeInsets padding;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.surfaceRaised,
        borderRadius: BorderRadius.circular(Cab.panel),
        border: Border.all(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }
}

/// Появление блока при загрузке с задержкой по порядку (.enter, fade-up 0.7 с, шаг 90 мс).
class Enter extends StatefulWidget {
  const Enter({super.key, required this.i, required this.child});
  final int i;
  final Widget child;

  @override
  State<Enter> createState() => _EnterState();
}

class _EnterState extends State<Enter> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: 700 + widget.i * 90),
  );
  late final Animation<double> _a = CurvedAnimation(
    parent: _c,
    curve: Interval(
      (widget.i * 90) / (700 + widget.i * 90),
      1,
      curve: easeOutSoft,
    ),
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      reducedMotion(context) ? _c.value = 1 : _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _a,
    builder: (_, child) => Opacity(
      opacity: _a.value,
      child: Transform.translate(
        offset: Offset(0, 16 * (1 - _a.value)),
        child: child,
      ),
    ),
    child: widget.child,
  );
}
