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

/// Тег общей обложки (Morph `cover-<id>`): обложка «перетекает» между полкой и страницей книги.
String coverHeroTag(String bookId) => 'cover-$bookId';

/// Пользователь просил меньше движения — анимации выключены (как prefers-reduced-motion на сайте).
bool reducedMotion(BuildContext context) =>
    MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Управление «открытием» книги снаружи: кнопка «Продолжить писать» открывает книгу, а потом переходит в редактор.
class Book3DController {
  _Book3DState? _state;

  /// Открыть книгу на месте; Future завершается, когда пора переходить (через [openBookMs]).
  Future<void> open() => _state?._open() ?? Future.value();

  /// Вернуть закрытой (после возврата из редактора).
  void reset() => _state?._reset();

  /// Где книга на экране — отсюда страница «вырастает» в лист редактора (LeafRoute).
  Rect? get rect {
    final box = _state?.context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }
}

/// Объёмная книга (Book3D): одна проекция с перспективой 1600 на всю книгу, поворот на [rotate]°, корешок у левого края.
/// При «открытии» книга поворачивается к читателю и чуть приподнимается, крышка распахивается вокруг корешка на 155°,
/// под ней проявляется первая страница со строками. Вложенные Transform в Flutter перемножаются как 3D-матрицы —
/// крышка поворачивается в той же перспективе, что и книга (как preserve-3d на сайте).
class Book3D extends StatefulWidget {
  const Book3D({
    super.key,
    required this.bookId,
    required this.cover,
    this.width = 112,
    this.rotate = 18,
    this.thickness = 7,
    this.controller,
    this.spineColor,
  });
  final String bookId;

  /// Картинка лицевой крышки (CoverPicture).
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
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 820),
  );

  @override
  void initState() {
    super.initState();
    widget.controller?._state = this;
  }

  @override
  void didUpdateWidget(Book3D old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      if (old.controller?._state == this) old.controller?._state = null;
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

  void _reset() {
    if (mounted) _c.value = 0;
  }

  /// Доля [from..to] общего хода (как transition-delay + duration в CSS).
  double _part(double t, double from, double to, Curve curve) =>
      curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0));

  @override
  Widget build(BuildContext context) {
    final w = widget.width;
    final h = w * 1.43;
    final spine = w * widget.thickness / 100;
    return SizedBox(
      width: w,
      height: h,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = _c.value * 820;
          // Книга поворачивается к читателю за 0.36 с: rotateY(18° → 0), translateY(−8), scale(1.04).
          final turn = _part(t, 0, 360, easeOutSoft);
          final ry = widget.rotate * (1 - turn) * math.pi / 180;
          final lift = -8.0 * turn;
          final scale = 1 + 0.04 * turn;
          // Крышка: 0.7 с после задержки 0.12 с, до −155° вокруг корешка.
          final lid = _part(t, 120, 820, _lidCurve) * 155 * math.pi / 180;
          // Первая страница проявляется с 0.38 с за 0.18 с.
          final leaf = _part(t, 380, 560, Curves.ease);
          final open = lid > math.pi / 2;
          return Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 1 / 1600)
              ..translateByDouble(0.0, lift, 0.0, 1.0)
              ..scaleByDouble(scale, scale, 1.0, 1.0)
              ..rotateY(-ry),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Первая страница под крышкой.
                Positioned(
                  left: 0,
                  top: h * 0.015,
                  child: Opacity(
                    opacity: leaf,
                    child: _Leaf(width: w * 0.985, height: h * 0.97),
                  ),
                ),
                // Крышка: лицо — обложка с корешком, изнанка — форзац; поворот вокруг левого края.
                Transform(
                  alignment: Alignment.centerLeft,
                  transform: Matrix4.identity()
                    ..setEntry(3, 2, 1 / 1600)
                    ..rotateY(lid),
                  child: open
                      ? _Endpaper(width: w, height: h)
                      : _CoverFace(
                          width: w,
                          height: h,
                          spine: spine,
                          spineColor: widget.spineColor,
                          shadow: 1 - leaf,
                          child: widget.cover,
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CoverFace extends StatelessWidget {
  const _CoverFace({
    required this.width,
    required this.height,
    required this.spine,
    required this.child,
    this.spineColor,
    this.shadow = 1,
  });
  final double width;
  final double height;
  final double spine;
  final Color? spineColor;
  final double shadow;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(2),
          bottomLeft: Radius.circular(2),
          topRight: Radius.circular(3),
          bottomRight: Radius.circular(3),
        ),
        // shadow-book сайта.
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18 * shadow),
            blurRadius: 24,
            offset: const Offset(10, 16),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12 * shadow),
            blurRadius: 4,
            offset: const Offset(2, 2),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          child,
          // Корешок: тёмная полоса у переплёта (book-3d__spine под углом 18° видна узкой полосой).
          Positioned(
            left: 0,
            top: 0,
            bottom: 0,
            width: spine * 0.45,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.black.withValues(alpha: 0.45),
                    Colors.black.withValues(alpha: 0.12),
                  ],
                ),
              ),
            ),
          ),
          // Блик и тень у корешка (from-black/25 via-white/10 to-transparent, ширина 7%).
          Positioned(
            left: spine * 0.45,
            top: 0,
            bottom: 0,
            width: width * 0.07,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.black.withValues(alpha: 0.25),
                    Colors.white.withValues(alpha: 0.10),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          // Лёгкий блик по диагонали (to-white/15).
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomLeft,
                end: Alignment.topRight,
                colors: [
                  Colors.transparent,
                  Colors.transparent,
                  Colors.white.withValues(alpha: 0.15),
                ],
              ),
            ),
          ),
        ],
      ),
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
      gradient: LinearGradient(
        begin: Alignment.centerRight,
        end: Alignment.centerLeft,
        stops: const [0, 0.14],
        colors: [Colors.black.withValues(alpha: 0.16), const Color(0xFFEFE7DA)],
      ),
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
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(2),
        color: title
            ? const Color(0xFF7A1F2B).withValues(alpha: 0.35)
            : const Color(0xFF1E1916).withValues(alpha: 0.12),
      ),
    );
    return Container(
      width: width,
      height: height,
      padding: EdgeInsets.symmetric(
        horizontal: width * 0.14,
        vertical: height * 0.18,
      ),
      decoration: const BoxDecoration(
        color: Color(0xFFFBF8F2),
        borderRadius: BorderRadius.horizontal(right: Radius.circular(3)),
        boxShadow: [
          BoxShadow(
            color: Color(0x40000000),
            blurRadius: 10,
            offset: Offset(6, 0),
            spreadRadius: -6,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          line(0.55 / 0.72, title: true),
          line(1),
          line(0.88 / 0.72 > 1 ? 1 : 0.88 / 0.72),
          line(1),
          line(0.62 / 0.72),
        ],
      ),
    );
  }
}

/// Полоса прогресса «набегает» при появлении: scaleX 0 → 1 за 1.1 с с задержкой 0.2 с (bar-grow).
class BarGrow extends StatefulWidget {
  const BarGrow({super.key, required this.child});
  final Widget child;

  @override
  State<BarGrow> createState() => _BarGrowState();
}

class _BarGrowState extends State<BarGrow> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  );
  late final Animation<double> _a = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.2 / 1.3, 1, curve: easeOutSoft),
  );

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
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _a,
    builder: (_, child) => Transform.scale(
      scaleX: _a.value,
      alignment: Alignment.centerLeft,
      child: child,
    ),
    child: widget.child,
  );
}

/// Мягкая смена страниц кабинета (PageFade): старая гаснет за 140 мс, новая проявляется (260 мс после 80 мс) и
/// поднимается на 8 пт (380 мс). Свайп от левого края — «назад», страница уходит за пальцем.
class CabinetRoute<T> extends PageRoute<T> {
  CabinetRoute({required this.builder, super.settings});
  final WidgetBuilder builder;

  @override
  Duration get transitionDuration => const Duration(milliseconds: 380);
  @override
  Duration get reverseTransitionDuration => const Duration(milliseconds: 260);
  @override
  bool get opaque => true;
  @override
  bool get maintainState => true;
  @override
  Color? get barrierColor => null;
  @override
  String? get barrierLabel => null;

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) => builder(context);

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final secondary = secondaryAnimation;
    final gesture = navigator?.userGestureInProgress ?? false;
    // Жест «назад»: страница следует за пальцем без кривых; иначе — мягкое проявление сайта.
    final fade = gesture
        ? animation
        : CurvedAnimation(
            parent: animation,
            curve: const Interval(80 / 380, 340 / 380, curve: easeOutSoft),
          );
    final rise = gesture
        ? animation
        : CurvedAnimation(parent: animation, curve: easeOutSoft);
    final out = CurvedAnimation(
      parent: secondary,
      curve: const Interval(0, 140 / 380, curve: Curves.easeIn),
    );
    return _EdgeSwipeBack(
      route: this,
      controller: () => controller,
      child: AnimatedBuilder(
        animation: Listenable.merge([animation, secondary]),
        child: child,
        builder: (context, c) => Opacity(
          opacity: (1 - out.value) * fade.value,
          child: Transform.translate(
            offset: gesture
                ? Offset(
                    MediaQuery.sizeOf(context).width *
                        (1 - animation.value) *
                        0.35,
                    0,
                  )
                : Offset(0, 8 * (1 - rise.value)),
            child: c,
          ),
        ),
      ),
    );
  }
}

/// Свайп от левого края экрана — «назад» (как системный жест iPhone): ход маршрута за пальцем, отпустили — до конца.
class _EdgeSwipeBack extends StatefulWidget {
  const _EdgeSwipeBack({
    required this.route,
    required this.controller,
    required this.child,
  });
  final PageRoute<dynamic> route;

  /// Ход маршрута (защищённое поле маршрута — маршрут отдаёт его сам).
  final AnimationController? Function() controller;
  final Widget child;

  @override
  State<_EdgeSwipeBack> createState() => _EdgeSwipeBackState();
}

class _EdgeSwipeBackState extends State<_EdgeSwipeBack> {
  AnimationController? get _controller => widget.controller();

  void _start(DragStartDetails _) =>
      widget.route.navigator?.didStartUserGesture();

  void _update(DragUpdateDetails d) {
    final c = _controller;
    if (c == null) return;
    c.value -= d.primaryDelta! / MediaQuery.sizeOf(context).width;
  }

  void _end(DragEndDetails d) {
    final c = _controller;
    final nav = widget.route.navigator;
    if (c == null || nav == null) return;
    final v = d.primaryVelocity ?? 0;
    final back = v > 500 || (v > -500 && c.value < 0.6);
    if (back) {
      nav.pop();
      if (c.isAnimating) {
        c.addStatusListener(
          (s) =>
              s == AnimationStatus.dismissed ? nav.didStopUserGesture() : null,
        );
      } else {
        nav.didStopUserGesture();
      }
    } else {
      c
          .animateTo(
            1,
            duration: const Duration(milliseconds: 220),
            curve: easeOutSoft,
          )
          .whenComplete(nav.didStopUserGesture);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.route.isFirst) return widget.child;
    return Stack(
      children: [
        widget.child,
        Positioned(
          left: 0,
          top: 0,
          bottom: 0,
          width: 20,
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onHorizontalDragStart: _start,
            onHorizontalDragUpdate: _update,
            onHorizontalDragEnd: _end,
          ),
        ),
      ],
    );
  }
}

/// «Книга открывается» → лист редактора: страница вырастает из места книги на весь экран (view transition `leaf-<id>`
/// на сайте), под конец проявляется содержимое. Назад — лист сжимается обратно в книгу.
class LeafRoute<T> extends PageRoute<T> {
  LeafRoute({required this.builder, required this.from, super.settings});
  final WidgetBuilder builder;

  /// Где была книга (Book3DController.rect); null — обычная смена страницы.
  final Rect? from;

  @override
  Duration get transitionDuration => const Duration(milliseconds: 460);
  @override
  Duration get reverseTransitionDuration => const Duration(milliseconds: 320);
  @override
  bool get opaque => false;
  @override
  bool get maintainState => true;
  @override
  Color? get barrierColor => null;
  @override
  String? get barrierLabel => null;

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) => builder(context);

  /// Рост листа начинается, когда первый кадр редактора уже построен: тяжёлая первая сборка экрана (шрифты, поле
  /// ввода) не «съедает» анимацию — иначе на медленном телефоне лист появлялся сразу целиком.
  @override
  TickerFuture didPush() {
    final future = super.didPush();
    final c = controller!;
    c.stop();
    c.value = 0;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (isActive && c.status != AnimationStatus.reverse) c.forward();
      });
    });
    return future;
  }

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final size = MediaQuery.sizeOf(context);
    final full = Offset.zero & size;
    final start = from ?? full.deflate(24);
    final grow = CurvedAnimation(
      parent: animation,
      curve: easeOutSoft,
      reverseCurve: Curves.easeInCubic,
    );
    final content = CurvedAnimation(
      parent: animation,
      curve: const Interval(0.45, 1, curve: Curves.easeOut),
    );
    return _EdgeSwipeBack(
      route: this,
      controller: () => controller,
      child: AnimatedBuilder(
        animation: animation,
        child: child,
        builder: (context, c) {
          final r = Rect.lerp(start, full, grow.value)!;
          final radius = 4 * (1 - grow.value);
          return Stack(
            children: [
              Positioned.fromRect(
                rect: r,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(radius),
                  // Бумага листа (#FBF8F2 у страницы книги), содержимое проявляется во второй половине.
                  child: ColoredBox(
                    color: const Color(0xFFFBF8F2),
                    child: Opacity(
                      opacity: content.value,
                      child: OverflowBox(
                        alignment: Alignment.topLeft,
                        minWidth: size.width,
                        maxWidth: size.width,
                        minHeight: size.height,
                        maxHeight: size.height,
                        child: Transform.translate(
                          offset: -r.topLeft,
                          child: SizedBox.fromSize(size: size, child: c),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Листание вопросов в редакторе (PageTurn): вперёд — старый лист переворачивается вокруг левого края до ребра
/// (320 мс, ease-in), новый проступает из тени под ним; назад — новый лист ложится на место справа налево.
class PageTurnSwitcher extends StatelessWidget {
  const PageTurnSwitcher({
    super.key,
    required this.child,
    required this.forward,
  });

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
      layoutBuilder: (current, previous) => Stack(
        alignment: Alignment.topCenter,
        children: [
          // Вперёд: старый лист поверх нового (он и переворачивается); назад — новый поверх старого.
          if (forward) ...[
            ?current,
            ...previous,
          ] else ...[
            ...previous,
            ?current,
          ],
        ],
      ),
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
                return ColorFiltered(
                  colorFilter: ColorFilter.mode(
                    Colors.black.withValues(alpha: shade),
                    BlendMode.srcATop,
                  ),
                  child: c,
                );
              }
              // Старый лист переворачивается вокруг левого края до ребра за первую половину (320 мс).
              final p = const Cubic(
                0.55,
                0,
                0.9,
                0.5,
              ).transform(((1 - v) * 2).clamp(0.0, 1.0));
              if (p >= 1) return const SizedBox.shrink();
              return Transform(
                alignment: Alignment.centerLeft,
                transform: Matrix4.identity()
                  ..setEntry(3, 2, 1 / 2000)
                  ..rotateY(-p * math.pi / 2),
                child: ColorFiltered(colorFilter: ColorFilter.mode(Colors.black.withValues(alpha: 0.2 * p), BlendMode.srcATop), child: c),
              );
            }
            if (incoming) {
              // Назад: новый лист ложится справа налево во второй половине (320 мс после 320 мс).
              final p =
                  1 -
                  const Cubic(
                    0.1,
                    0.5,
                    0.45,
                    1,
                  ).transform(((v - 0.5) * 2).clamp(0.0, 1.0));
              if (v < 0.5) return const SizedBox.shrink();
              return Transform(
                alignment: Alignment.centerRight,
                transform: Matrix4.identity()
                  ..setEntry(3, 2, 1 / 2000)
                  ..rotateY(p * math.pi / 2),
                child: c,
              );
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
    const paper = ColoredBox(color: Color(0xFFEDE6DB));
    return Image.network(
      backend.url(url),
      headers: backend.imageHeaders,
      fit: BoxFit.cover,
      gaplessPlayback: true,
      // Пока картинка грузится — бумага, а не пустота (иначе сквозь крышку видна тень).
      frameBuilder: (_, child, frame, sync) =>
          sync || frame != null ? child : paper,
      errorBuilder: (_, _, _) => paper,
    );
  }
}
