import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../ui/tokens.dart';
import '../data/session.dart';
import 'motion.dart';

/// Элементы кабинета сайта (src/app/(app), globals.css): радиусы 10/14/20, кнопки .btn-lg (52), листы .panel,
/// плашки срока и статуса — те же размеры и цвета, что на телефоне в браузере.
class Cab {
  static const ctl = 10.0;
  static const panel = 14.0;
  static const sheet = 20.0;
  static const btnLg = 52.0;
  static const btn = 44.0;
}

/// Шапка кабинета на телефоне: знак, название раздела засечками, тема и аватар (как AppHeader сайта).
class CabinetTopBar extends StatelessWidget implements PreferredSizeWidget {
  const CabinetTopBar({
    super.key,
    required this.title,
    this.leading,
    this.actions = const [],
  });
  final String title;
  final Widget? leading;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final user = context.watch<ClientSession>().user;
    final letter = (user?.name.trim().isNotEmpty ?? false)
        ? user!.name.trim()[0].toUpperCase()
        : '?';
    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 60,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                leading ??
                    ClipRRect(
                      borderRadius: BorderRadius.circular(9),
                      child: Image.asset(
                        'assets/client/icon.png',
                        width: 36,
                        height: 36,
                      ),
                    ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.serif(
                      context,
                      size: 25,
                      weight: FontWeight.w500,
                    ),
                  ),
                ),
                ...actions,
                const SizedBox(width: 6),
                Container(
                  width: 38,
                  height: 38,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: c.brand,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    letter,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Лицевая крышка книги — картинка с сервера (та же, что в печати), с объёмом: корешок слева и тень, как Book3D.
class CoverImage extends StatelessWidget {
  const CoverImage({
    super.key,
    required this.url,
    this.width = 112,
    this.flat = false,
  });
  final String url;
  final double width;
  final bool flat;

  @override
  Widget build(BuildContext context) {
    final backend = context.read<ClientSession>().backend;
    final c = context.c;
    final h = width * 1.43;
    final image = Image.network(
      backend.url(url),
      headers: backend.imageHeaders,
      width: width,
      height: h,
      fit: BoxFit.cover,
      gaplessPlayback: true,
      errorBuilder: (_, _, _) =>
          Container(width: width, height: h, color: c.surface),
      frameBuilder: (_, child, frame, sync) => sync || frame != null
          ? child
          : Container(width: width, height: h, color: c.surface),
    );
    return Container(
      width: width,
      height: h,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.horizontal(
          left: const Radius.circular(2),
          right: Radius.circular(flat ? 3 : 4),
        ),
        boxShadow: flat
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.12),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ]
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.22),
                  blurRadius: 22,
                  offset: const Offset(6, 14),
                ),
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.10),
                  blurRadius: 4,
                  offset: const Offset(1, 2),
                ),
              ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          image,
          if (!flat)
            // Корешок: тёмная полоса и блик у переплёта — книга, а не плоская картинка.
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              width: width * 0.09,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.black.withValues(alpha: 0.45),
                      Colors.white.withValues(alpha: 0.10),
                      Colors.black.withValues(alpha: 0.08),
                      Colors.transparent,
                    ],
                    stops: const [0, 0.35, 0.6, 1],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Рисунок обложки по адресу сайта: рисованные шаблоны — SVG, на снимках и с фото — WebP; свои картинки книги
/// (/api/books/…) — с токеном автора. Пока грузится — бумага.
class CoverArt extends StatelessWidget {
  const CoverArt({super.key, required this.url, this.fit = BoxFit.cover});
  final String url;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final backend = context.read<ClientSession>().backend;
    final c = context.c;
    if (Uri.parse(url).path.endsWith('.svg')) {
      return SvgPicture.network(backend.url(url), fit: fit, placeholderBuilder: (_) => ColoredBox(color: c.surface));
    }
    return Image.network(
      backend.url(url),
      headers: url.startsWith('/api/books/') ? backend.imageHeaders : null,
      fit: fit,
      cacheWidth: 360,
      gaplessPlayback: true,
      frameBuilder: (_, child, frame, sync) => sync || frame != null ? child : ColoredBox(color: c.surface),
      errorBuilder: (_, _, _) => ColoredBox(color: c.surface),
    );
  }
}

/// Кнопка кабинета: primary — винная, outline — белая с рамкой, dashed — пунктирная («Новая книга»).
enum CabBtn { primary, outline, dark }

class CabinetButton extends StatelessWidget {
  const CabinetButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.kind = CabBtn.primary,
    this.large = true,
    this.busy = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final CabBtn kind;
  final bool large;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg, border) = switch (kind) {
      CabBtn.primary => (c.brand, Colors.white, null),
      CabBtn.dark => (c.text, c.bg, null),
      CabBtn.outline => (c.surfaceRaised, c.text, c.wallpaperInk),
    };
    final enabled = onPressed != null && !busy;
    return SizedBox(
      height: large ? Cab.btnLg : Cab.btn,
      width: double.infinity,
      child: Material(
        color: enabled ? bg : bg.withValues(alpha: 0.5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Cab.ctl),
          side: border == null ? BorderSide.none : BorderSide(color: border),
        ),
        elevation: kind == CabBtn.primary ? 1.5 : 0,
        shadowColor: c.brand.withValues(alpha: 0.4),
        child: InkWell(
          borderRadius: BorderRadius.circular(Cab.ctl),
          onTap: enabled
              ? () {
                  HapticFeedback.selectionClick();
                  onPressed!();
                }
              : null,
          child: Center(
            child: busy
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: fg,
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: 19, color: fg),
                        const SizedBox(width: 9),
                      ],
                      Text(
                        label,
                        style: TextStyle(
                          color: fg,
                          fontSize: large ? 17 : 15.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// Пунктирная кнопка «+ Новая книга».
class DashedButton extends StatelessWidget {
  const DashedButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon = LucideIcons.plus,
  });
  final String label;
  final VoidCallback onPressed;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(Cab.ctl),
      child: CustomPaint(
        painter: _DashedBorder(color: c.wallpaperInk, radius: Cab.ctl),
        child: SizedBox(
          height: Cab.btnLg,
          width: double.infinity,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 19, color: c.text),
              const SizedBox(width: 9),
              Text(
                label,
                style: TextStyle(
                  color: c.text,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DashedBorder extends CustomPainter {
  _DashedBorder({required this.color, required this.radius});
  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)),
      );
    for (final m in path.computeMetrics()) {
      for (double d = 0; d < m.length; d += 9) {
        canvas.drawPath(m.extractPath(d, d + 5), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorder old) => old.color != color;
}

/// Плашка срока к празднику: тон calm/warm/hot — как Deadline на полке сайта.
class DeadlineChip extends StatelessWidget {
  const DeadlineChip({
    super.key,
    required this.text,
    required this.tone,
    this.small = false,
  });
  final String text;
  final String tone;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg) = switch (tone) {
      'warm' => (c.warnBg, c.warn),
      'hot' => (c.bubbleOut, c.brand),
      _ => (c.surface, c.text.withValues(alpha: 0.82)),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(Cab.ctl),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(
              LucideIcons.calendarHeart,
              size: small ? 14 : 16,
              color: fg,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: fg,
                fontSize: small ? 13 : 15,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Полоса готовности: подпись слева, процент справа, полоса 6 пт (как Progress на полке).
class ProgressRow extends StatelessWidget {
  const ProgressRow({
    super.key,
    required this.label,
    required this.percent,
    this.compact = false,
  });
  final String label;
  final int percent;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: compact ? 14 : 16,
                  fontWeight: FontWeight.w500,
                  color: c.text,
                ),
              ),
            ),
            Text(
              '$percent%',
              style: TextStyle(
                fontSize: compact ? 13 : 15,
                color: c.textMuted,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
        SizedBox(height: compact ? 7 : 9),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Stack(
            children: [
              Container(height: 6, color: c.border),
              FractionallySizedBox(
                widthFactor: (percent.clamp(2, 100)) / 100,
                child: BarGrow(
                  child: Container(
                    height: 6,
                    decoration: BoxDecoration(
                      color: c.brand,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Плашка статуса (Badge сайта): точка и подпись тоном.
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.tone});
  final String label;
  final String tone;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg) = switch (tone) {
      'success' => (c.success.withValues(alpha: 0.12), c.success),
      'warning' => (c.warnBg, c.warn),
      'danger' => (c.dangerBg, c.danger),
      'info' => (c.violetBg, c.violet),
      _ => (c.surface, c.textMuted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: fg, fontSize: 13, fontWeight: FontWeight.w500),
      ),
    );
  }
}

/// Нижняя панель кабинета на телефоне: «Мои книги», «Заказы», «Аккаунт» — активная с винной чертой сверху.
class CabinetTabBar extends StatelessWidget {
  const CabinetTabBar({super.key, required this.index, required this.onTap});
  final int index;
  final ValueChanged<int> onTap;

  static const _tabs = [
    (LucideIcons.bookOpen, 'Мои книги'),
    (LucideIcons.package, 'Заказы'),
    (LucideIcons.user, 'Аккаунт'),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 62,
          child: Row(
            children: [
              for (var i = 0; i < _tabs.length; i++)
                Expanded(
                  child: InkWell(
                    onTap: () => onTap(i),
                    child: Stack(
                      children: [
                        if (i == index)
                          Positioned(
                            top: 0,
                            left: 18,
                            right: 18,
                            child: Container(height: 2.5, color: c.brand),
                          ),
                        Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                _tabs[i].$1,
                                size: 22,
                                color: i == index ? c.brand : c.textMuted,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _tabs[i].$2,
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: i == index ? c.brand : c.textMuted,
                                  fontWeight: i == index
                                      ? FontWeight.w500
                                      : FontWeight.w400,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
