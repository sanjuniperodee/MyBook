import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../data/session.dart';

/// Анимации кабинета сайта — те же движения, тайминги и кривые (src/app/globals.css, src/components/motion/*):
/// объёмная книга и её «открытие», обложка, которая «перетекает» между экранами, «набегающая» полоса прогресса,
/// мягкая смена страниц и листание вопросов в редакторе.

/// --ease-out-soft: cubic-bezier(0.2, 0.7, 0.2, 1) — мягкие входы.
const easeOutSoft = Cubic(0.2, 0.7, 0.2, 1);

/// Кривая крышки книги при открытии: cubic-bezier(0.5, 0, 0.2, 1).
const _lidCurve = Cubic(0.5, 0, 0.2, 1);

/// Сколько длится «открытие» на месте, прежде чем начнётся переход (OPEN_MS в OpenBookLink).
const openBookMs = 620;

/// Тег общей обложки (Morph `cover-<id>`) и первой страницы книги (`leaf-<id>`), которая «перетекает» в лист редактора.
String coverHeroTag(String bookId) => 'cover-$bookId';
String leafHeroTag(String bookId) => 'leaf-$bookId';

/// Пользователь просил меньше движения — анимации выключены (как prefers-reduced-motion на сайте).
bool reducedMotion(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Управление «открытием» книги снаружи: кнопка «Продолжить писать» открывает книгу, а потом переходит в редактор.
class Book3DController {
  _Book3DState? _state;

  /// Открыть книгу на месте; Future завершается, когда пора переходить (через [openBookMs]).
  Future<void> open() => _state?._open() ?? Future.value();

  /// Вернуть закрытой (после возврата из редактора).
  void reset() => _state?._reset();
}

/// Объёмная книга (Book3D): лицевая крышка с перспективой 1600, повёрнутая на [rotate]°, корешок и обрез страниц.
/// При «открытии» книга поворачивается к читателю и чуть приподнимается, крышка распахивается вокруг корешка на 155°,
/// под ней проявляется первая страница со строками.
class Book3D extends StatefulWidget {
  const Book3D({super.key, required this.bookId, required this.cover, this.width = 112, this.rotate = 18, this.thickness = 7, this.controller, this.spineColor});
  final String bookId;

  /// Картинка лицевой крышки (CoverImage).
  final Widget cover;
  final double width;

  /// Угол поворота, градусы (rotate у Book3D сайта).
  final double rotate;

  /// Толщина книги, % ширины (thickness у Book3D).
  final double thickness;
  final Book3DController? controller;
  final Color? spineColor;

  @override
  State<Book3D> createState() => _Book3DState();
}

class _Book3DState extends State<Book3D> with SingleTickerProviderStateMixin {
  // 0.12 с задержки + 0.7 с крышки = весь путь открытия.
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 820));

  @override
  void initState() {
    super.initState();
    widget.controller?._state = this;
  }

  @override
  void didUpdateWidget(Book3D old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller?._state = null;
      widget.controller?._state = this;
    }
  }

  @override
  void dispose() {
    if (widget.controller?._state == this) widget.controller?._state = null;
    _c.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    if (reducedMotion(context)) return;
    _c.forward(from: 0);
    await Future<void>.delayed(const Duration(milliseconds: openBookMs));
  }

  void _reset() => _c.value = 0;

  /// Доля [from..to] общего хода 0..1 (как transition-delay + duration в CSS).
  double _part(double t, double from, double to, Curve curve) => curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0));

  @override
  Widget build(BuildContext context) {
    final w = widget.width;
    final h = w * 1.43;
    final thick = w * widget.thickness / 100;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final t = _c.value * 820; // мс
        // Книга поворачивается к читателю за 0.36 с: rotateY(18° → 0), translateY(−8), scale(1.04).
        final turn = _part(t, 0, 360, easeOutSoft);
        final ry = widget.rotate * (1 - turn) * math.pi / 180;
        final lift = -8.0 * turn;
        final scale = 1 + 0.04 * turn;
        // Крышка: 0.7 с после задержки 0.12 с, до −155°.
        final lid = _part(t, 120, 820, _lidCurve) * -155 * math.pi / 180;
        // Первая страница проявляется с 0.38 с за 0.18 с.
        final leaf = _part(t, 380, 560, Curves.ease);

        Matrix4 base() => Matrix4.identity()
          ..setEntry(3, 2, 1 / 1600)
          ..translateByDouble(0.0, lift, 0.0, 1.0)
          ..scaleByDouble(scale, scale, scale, 1.0)
          ..rotateY(-ry);

        final faces = <Widget>[
          // Обрез страниц справа (repeating-linear-gradient белый/кремовый).
          Positioned(
            left: w - thick,
            top: h * 0.015,
            child: Transform(
              alignment: Alignment.centerRight,
              transform: base()..rotateY(math.pi / 2),
              child: SizedBox(width: thick, height: h * 0.97, child: const CustomPaint(painter: _PagesEdge())),
            ),
          ),
          // Корешок слева.
          Positioned(
            left: 0,
            top: 0,
            child: Transform(
              alignment: Alignment.centerLeft,
              transform: base()..rotateY(-math.pi / 2),
              child: Container(
                width: thick,
                height: h,
                decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.centerRight, end: Alignment.centerLeft, colors: [Colors.black.withValues(alpha: 0.35), Colors.black.withValues(alpha: 0.1)]), color: widget.spineColor ?? const Color(0xFF333333)),
              ),
            ),
          ),
          // Первая страница под крышкой.
          Positioned(
            left: 0,
            top: h * 0.015,
            child: Transform(
              alignment: Alignment.centerLeft,
              transform: base(),
              child: Opacity(opacity: leaf, child: Hero(tag: leafHeroTag(widget.bookId), child: _Leaf(width: w * 0.985, height: h * 0.97))),
            ),
          ),
          // Крышка: лицо — обложка, изнанка — форзац.
          Positioned(
            left: 0,
            top: 0,
            child: Transform(
              alignment: Alignment.centerLeft,
              transform: base()..rotateY(lid),
              child: lid.abs() > math.pi / 2 ? _Endpaper(width: w, height: h) : _CoverFace(width: w, height: h, child: widget.cover),
            ),
          ),
        ];
        return SizedBox(width: w, height: h, child: Stack(clipBehavior: Clip.none, children: faces));
      },
    );
  }
}

class _CoverFace extends StatelessWidget {
  const _CoverFace({required this.width, required this.height, required this.child});
  final double width;
  final double height;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.only(topLeft: Radius.circular(2), bottomLeft: Radius.circular(2), topRight: Radius.circular(3), bottomRight: Radius.circular(3)),
        // shadow-book сайта.
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 24, offset: const Offset(10, 16)),
          BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 4, offset: const Offset(2, 2)),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(fit: StackFit.expand, children: [
        child,
        // Блик и тень у корешка (from-black/25 via-white/10 to-transparent, ширина 7%).
        Positioned(
          left: 0,
          top: 0,
          bottom: 0,
          width: width * 0.07,
          child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(colors: [Colors.black.withValues(alpha: 0.25), Colors.white.withValues(alpha: 0.10), Colors.transparent]))),
        ),
        // Лёгкий блик по диагонали (to-white/15).
        DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomLeft, end: Alignment.topRight, colors: [Colors.transparent, Colors.transparent, Colors.white.withValues(alpha: 0.15)]))),
      ]),
    );
  }
}

/// Изнанка крышки — форзац: бумага чуть темнее листа, у корешка тень.
class _Endpaper extends StatelessWidget {
  const _Endpaper({required this.width, required this.height});
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: const BorderRadius.horizontal(left: Radius.circular(3)),
          color: const Color(0xFFEFE7DA),
          gradient: LinearGradient(begin: Alignment.centerRight, end: Alignment.centerLeft, stops: const [0, 0.14], colors: [Colors.black.withValues(alpha: 0.16), const Color(0xFFEFE7DA)]),
        ),
      );
}

/// Первая страница со строками (book-3d__leaf): заголовок винным и четыре строки текста.
class _Leaf extends StatelessWidget {
  const _Leaf({required this.width, required this.height});
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    Widget line(double wf, {bool title = false}) => Container(
          width: (width * 0.72) * wf,
          height: math.max(2, height * (title ? 0.034 : 0.022)),
          margin: EdgeInsets.only(bottom: height * (title ? 0.09 : 0.05)),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(2), color: title ? const Color(0xFF7A1F2B).withValues(alpha: 0.35) : const Color(0xFF1E1916).withValues(alpha: 0.12)),
        );
    return Container(
      width: width,
      height: height,
      padding: EdgeInsets.symmetric(horizontal: width * 0.14, vertical: height * 0.18),
      decoration: const BoxDecoration(
        color: Color(0xFFFBF8F2),
        borderRadius: BorderRadius.horizontal(right: Radius.circular(3)),
        boxShadow: [BoxShadow(color: Color(0x40000000), blurRadius: 10, offset: Offset(6, 0), spreadRadius: -6)],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [line(0.55 / 0.72, title: true), line(1), line(0.88 / 0.72 > 1 ? 1 : 0.88 / 0.72), line(1), line(0.62 / 0.72)]),
    );
  }
}

class _PagesEdge extends CustomPainter {
  const _PagesEdge();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
    final p = Paint()..color = const Color(0xFFEFE9DF);
    for (double x = 1; x < size.width; x += 2) {
      canvas.drawRect(Rect.fromLTWH(x, 0, 1, size.height), p);
    }
  }

  @override
  bool shouldRepaint(_PagesEdge old) => false;
}

/// Полоса прогресса «набегает» при появлении: scaleX 0 → 1 за 1.1 с с задержкой 0.2 с (bar-grow).
class BarGrow extends StatefulWidget {
  const BarGrow({super.key, required this.child});
  final Widget child;

  @override
  State<BarGrow> createState() => _BarGrowState();
}

class _BarGrowState extends State<BarGrow> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1300));
  late final Animation<double> _a = CurvedAnimation(parent: _c, curve: const Interval(0.2 / 1.3, 1, curve: easeOutSoft));

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (reducedMotion(context)) {
        _c.value = 1;
      } else {
        _c.forward();
      }
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(animation: _a, builder: (_, child) => Transform.scale(scaleX: _a.value, alignment: Alignment.centerLeft, child: child), child: widget.child);
}

/// Мягкая смена страниц кабинета (PageFade): старая гаснет за 140 мс, новая проявляется (260 мс после 80 мс) и
/// поднимается на 8 пт (380 мс). Свайп «назад» на iPhone — как у системы.
class CabinetRoute<T> extends PageRouteBuilder<T> {
  CabinetRoute({required WidgetBuilder builder, super.settings})
      : super(
          transitionDuration: const Duration(milliseconds: 380),
          reverseTransitionDuration: const Duration(milliseconds: 260),
          pageBuilder: (context, _, _) => builder(context),
          transitionsBuilder: (context, animation, secondary, child) {
            final fade = CurvedAnimation(parent: animation, curve: const Interval(80 / 380, 340 / 380, curve: easeOutSoft));
            final rise = Tween(begin: const Offset(0, 8), end: Offset.zero).animate(CurvedAnimation(parent: animation, curve: easeOutSoft));
            final out = Tween(begin: 1.0, end: 0.0).animate(CurvedAnimation(parent: secondary, curve: const Interval(0, 140 / 380, curve: Curves.easeIn)));
            return FadeTransition(
              opacity: out,
              child: FadeTransition(opacity: fade, child: AnimatedBuilder(animation: rise, builder: (_, c) => Transform.translate(offset: rise.value, child: c), child: child)),
            );
          },
        );
}

/// Листание вопросов в редакторе (PageTurn): вперёд — старый лист переворачивается вокруг левого края до ребра
/// (320 мс, ease-in), новый проступает из тени под ним; назад — новый лист ложится на место справа налево.
class PageTurnSwitcher extends StatelessWidget {
  const PageTurnSwitcher({super.key, required this.child, required this.forward});

  /// Лист с ключом страницы: смена ключа — другая страница.
  final Widget child;
  final bool forward;

  @override
  Widget build(BuildContext context) {
    if (reducedMotion(context)) return child;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 640),
      switchInCurve: Curves.linear,
      switchOutCurve: Curves.linear,
      layoutBuilder: (current, previous) => Stack(alignment: Alignment.topCenter, children: [
        // Вперёд: старый лист поверх нового (он и переворачивается); назад — новый поверх старого.
        if (forward) ...[?current, ...previous] else ...[...previous, ?current],
      ]),
      transitionBuilder: (child, animation) {
        final incoming = child.key == this.child.key;
        return AnimatedBuilder(
          animation: animation,
          child: child,
          builder: (context, c) {
            final v = animation.value; // входящий 0→1, уходящий 1→0
            if (forward) {
              if (incoming) {
                // Новый лист проступает из тени (vt-shade): brightness 0.86 → 1.
                final shade = 0.14 * (1 - Curves.easeOut.transform(v));
                return ColorFiltered(colorFilter: ColorFilter.mode(Colors.black.withValues(alpha: shade), BlendMode.srcATop), child: c);
              }
              // Старый лист переворачивается вокруг левого края до ребра за первую половину (320 мс).
              final p = const Cubic(0.55, 0, 0.9, 0.5).transform(((1 - v) * 2).clamp(0.0, 1.0));
              if (p >= 1) return const SizedBox.shrink();
              return Transform(alignment: Alignment.centerLeft, transform: Matrix4.identity()..setEntry(3, 2, 1 / 2000)..rotateY(-p * math.pi / 2), child: Opacity(opacity: 1 - p * 0.2, child: c));
            }
            if (incoming) {
              // Назад: новый лист ложится справа налево во второй половине (320 мс после 320 мс).
              final p = 1 - const Cubic(0.1, 0.5, 0.45, 1).transform(((v - 0.5) * 2).clamp(0.0, 1.0));
              if (v < 0.5) return const SizedBox.shrink();
              return Transform(alignment: Alignment.centerRight, transform: Matrix4.identity()..setEntry(3, 2, 1 / 2000)..rotateY(p * math.pi / 2), child: c);
            }
            // Старый лист держится до конца и гаснет под новым (vt-hold).
            return Opacity(opacity: v > 0.02 ? 1 : 0, child: c);
          },
        );
      },
      child: child,
    );
  }
}

/// Обложка книги с сервера для объёмной книги (картинка той же обложки, что в печати).
class CoverPicture extends StatelessWidget {
  const CoverPicture({super.key, required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    final backend = context.read<ClientSession>().backend;
    return Image.network(backend.url(url), headers: backend.imageHeaders, fit: BoxFit.cover, gaplessPlayback: true, errorBuilder: (_, _, _) => const ColoredBox(color: Color(0xFFE6E0D7)));
  }
}
