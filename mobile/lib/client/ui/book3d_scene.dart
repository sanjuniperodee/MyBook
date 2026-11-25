import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:vector_math/vector_math_64.dart' show Matrix4, Vector3;

import '../../api/mybook_api.g.dart' as v1api;

/// Объёмная книга как сцена three.js сайта (components/book3d/webgl/BookScene.ts), только своим растеризатором: те же
/// тела и шарниры (крышки картоном, выпуклый корешок, две стопки, гнущиеся листы, раскрытие «домиком»), та же камера
/// (перспектива, орбита вокруг книги), тот же свет (ключ, встречный, отражённый, полусфера, окружение, нейтральная
/// тоновая кривая) и студия (купол, стол, туман, пятно контакта, тень — шейдер studio.frag). Всё числами из API v1
/// bookModel — своих чисел здесь нет.
///
/// Рисование: тела режутся на мелкие треугольники, невидимые (отвёрнутые от камеры) отбрасываются, остальные сортируются
/// от дальних к ближним и рисуются Canvas.drawVertices пачками по текстуре — без щелей между гранями и без
/// просвечивания изнанки.
class BookSceneModel {
  BookSceneModel(this.m)
      : d = m.dims,
        s = m.scene;

  final v1api.BookModel m;
  final v1api.BookModelDims d;
  final v1api.BookModelScene s;

  double get baseDistance => d.h / (s.camera.distanceK * math.tan(s.camera.fovDeg * math.pi / 360));
  double get groundY => -d.h / 2 - 0.3;
}

/// Текстура: картинка и прямоугольник в её пикселях; flipU — зеркально по ширине.
class Tex {
  const Tex(this.image, this.rect, {this.flipU = false});
  final ui.Image image;
  final Rect rect;
  final bool flipU;
}

/// Материал грани: цвет (sRGB) или текстура, нажатие («next» / «prev»), тень у корешка по ширине листа.
class Mat {
  const Mat({this.color, this.tex, this.pick, this.gutter = false, this.doubleSided = false, this.layer = 4, this.hidden = false});
  final Color? color;
  final Tex? tex;
  final String? pick;
  final bool gutter;
  final bool doubleSided;

  /// Слой порядка рисования — то, что на сайте решает буфер глубины: 0 — корешок, 1 — внутренняя сторона крышек
  /// (форзацы), 2 — стопки, 3 — листы, 4 — наружные стороны крышек. Внутри слоя — от дальних к ближним.
  final int layer;

  /// Грань всегда закрыта другими (торец блока и крышек у корешка) — не рисуется.
  final bool hidden;
}

class _Tri {
  _Tri(this.p, this.uv, this.col, this.depth, this.image, this.pick, this.layer);
  final int layer;
  final List<Offset> p;
  final List<Offset>? uv;
  final List<int> col;
  final double depth;
  final ui.Image? image;
  final String? pick;
}

/// Камера: сферические углы вокруг центра книги (как OrbitControls), расстояние, мм.
class Camera3 {
  Camera3(this.azimuth, this.polar, this.distance);
  double azimuth;
  double polar;
  double distance;

  Vector3 get eye => Vector3(distance * math.sin(polar) * math.sin(azimuth), distance * math.cos(polar), distance * math.sin(polar) * math.cos(azimuth));
}

/// Сцена на кадр: камера, позиция листания, раскрытие, картинки. Строит треугольники и рисует.
class BookFrame {
  BookFrame({required this.model, required this.cam, required this.pos, required this.spread, required this.pages, required this.edgeColor});

  final BookSceneModel model;
  final Camera3 cam;
  final double pos;
  final ui.Image? spread;
  final ui.Image? Function(int n) pages;
  final Color edgeColor;

  final List<_Tri> _tris = [];
  late Vector3 _eye, _fwd, _right, _up;
  late double _focal;
  late Offset _center;
  late Vector3 _ambient; // вклад полусферы и окружения задаётся по нормали
  final List<(Vector3, double)> _dirLights = [];

  // ── свет ──

  static double _lin(double c) => math.pow(c, 2.2).toDouble();
  static double _srgb(double c) => math.pow(c.clamp(0.0, 1.0), 1 / 2.2).toDouble();

  static Vector3 _hexLin(String hex) {
    final h = hex.replaceFirst('#', '');
    final v = int.parse(h.length == 3 ? h.split('').map((c) => '$c$c').join() : h, radix: 16);
    return Vector3(_lin(((v >> 16) & 255) / 255), _lin(((v >> 8) & 255) / 255), _lin((v & 255) / 255));
  }

  static Vector3 _colorLin(Color c) => Vector3(_lin(c.r), _lin(c.g), _lin(c.b));

  /// Khronos PBR Neutral — та же тоновая кривая, что NeutralToneMapping у three.js.
  static Vector3 _neutral(Vector3 c) {
    const start = 0.8 - 0.04;
    const desat = 0.15;
    final x = math.min(c.x, math.min(c.y, c.z));
    final offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    var r = c - Vector3.all(offset);
    final peak = math.max(r.x, math.max(r.y, r.z));
    if (peak < start) return r;
    const dd = 1 - start;
    final newPeak = 1 - dd * dd / (peak + dd - start);
    r = r * (newPeak / peak);
    final g = 1 - 1 / (desat * (peak - newPeak) + 1);
    return r * (1 - g) + Vector3.all(newPeak) * g;
  }

  /// Освещённость (линейная, на белый цвет) в точке с нормалью n — как диффузная часть MeshStandardMaterial.
  Vector3 _irradiance(Vector3 n) {
    final l = model.s.lights;
    final sky = _hexLin(l.hemi.sky), ground = _hexLin(l.hemi.ground);
    final t = 0.5 * n.y + 0.5;
    var e = (ground * (1 - t) + sky * t) * l.hemi.intensity + _ambient;
    for (final (dir, intensity) in _dirLights) {
      final k = n.dot(dir);
      if (k > 0) e += Vector3.all(intensity * k);
    }
    return e / math.pi;
  }

  /// Итоговый цвет вершины для drawVertices: у текстуры — множитель (в sRGB), у цвета — сам цвет.
  int _shade(Vector3 n, Mat mat, double gutter) {
    final exposure = model.s.lights.exposure;
    final e = _irradiance(n) * (exposure * gutter);
    final base = mat.tex != null ? Vector3.all(1) : _colorLin(mat.color ?? const Color(0xFFFFFFFF));
    final c = _neutral(Vector3(base.x * e.x, base.y * e.y, base.z * e.z));
    return (0xFF << 24) | ((_srgb(c.x) * 255).round() << 16) | ((_srgb(c.y) * 255).round() << 8) | (_srgb(c.z) * 255).round();
  }

  // ── геометрия ──

  static Matrix4 _t(double x, double y, double z) => Matrix4.translationValues(x, y, z);
  static Matrix4 _ry(double a) => Matrix4.rotationY(a);

  Offset _project(Vector3 p) {
    final v = p - _eye;
    final z = v.dot(_fwd);
    return _center + Offset(_focal * v.dot(_right) / z, -_focal * v.dot(_up) / z);
  }

  /// Сетка nu×nv на плоскости: начало, два ребра, нормаль; uv — в долях (0…1) по рёбрам.
  void _grid(Matrix4 m, Vector3 o, Vector3 du, Vector3 dv, Vector3 n, Mat mat, int nu, int nv) {
    if (mat.hidden) return;
    final nw = (m.getRotation().transform(n.clone()))..normalize();
    final pts = <Vector3>[];
    for (var j = 0; j <= nv; j++) {
      for (var i = 0; i <= nu; i++) {
        pts.add(m.transform3(o + du * (i / nu) + dv * (j / nv)));
      }
    }
    final toEye = _eye - pts[(nv ~/ 2) * (nu + 1) + nu ~/ 2];
    var normal = nw;
    if (normal.dot(toEye) <= 0) {
      if (!mat.doubleSided) return;
      normal = -normal;
    }
    final cols = <int>[];
    for (var j = 0; j <= nv; j++) {
      for (var i = 0; i <= nu; i++) {
        cols.add(_shade(normal, mat, 1));
      }
    }
    final scr = [for (final p in pts) _project(p)];
    for (var j = 0; j < nv; j++) {
      for (var i = 0; i < nu; i++) {
        final a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e = c + 1;
        for (final q in [
          [a, b, e],
          [a, e, c],
        ]) {
          final depth = ((pts[q[0]] + pts[q[1]] + pts[q[2]]) / 3 - _eye).dot(_fwd);
          List<Offset>? uv;
          final tex = mat.tex;
          if (tex != null) {
            uv = [
              for (final k in q)
                () {
                  final u = (k % (nu + 1)) / nu, v = (k ~/ (nu + 1)) / nv;
                  final uu = tex.flipU ? 1 - u : u;
                  return Offset(tex.rect.left + uu * tex.rect.width, tex.rect.top + v * tex.rect.height);
                }(),
            ];
          }
          _tris.add(_Tri([scr[q[0]], scr[q[1]], scr[q[2]]], uv, [cols[q[0]], cols[q[1]], cols[q[2]]], depth, tex?.image, mat.pick, mat.layer));
        }
      }
    }
  }

  /// Параллелепипед с центром в начале матрицы m; материалы граней по порядку BoxGeometry: +x, −x, +y, −y, +z, −z.
  void _box(Matrix4 m, double sx, double sy, double sz, List<Mat> faces) {
    final hx = sx / 2, hy = sy / 2, hz = sz / 2;
    // Деление граней: крупные — сеткой (правильный порядок рисования), тонкие — полосой.
    int seg(double len) => (len / 18).ceil().clamp(1, 12);
    _grid(m, Vector3(hx, hy, hz), Vector3(0, 0, -sz), Vector3(0, -sy, 0), Vector3(1, 0, 0), faces[0], seg(sz), seg(sy));
    _grid(m, Vector3(-hx, hy, -hz), Vector3(0, 0, sz), Vector3(0, -sy, 0), Vector3(-1, 0, 0), faces[1], seg(sz), seg(sy));
    _grid(m, Vector3(-hx, hy, -hz), Vector3(sx, 0, 0), Vector3(0, 0, sz), Vector3(0, 1, 0), faces[2], seg(sx), seg(sz));
    _grid(m, Vector3(-hx, -hy, hz), Vector3(sx, 0, 0), Vector3(0, 0, -sz), Vector3(0, -1, 0), faces[3], seg(sx), seg(sz));
    _grid(m, Vector3(-hx, hy, hz), Vector3(sx, 0, 0), Vector3(0, -sy, 0), Vector3(0, 0, 1), faces[4], seg(sx), seg(sy));
    _grid(m, Vector3(hx, hy, -hz), Vector3(-sx, 0, 0), Vector3(0, -sy, 0), Vector3(0, 0, -1), faces[5], seg(sx), seg(sy));
  }

  /// Полоса по кривой (x, z) высотой h: корешок и листы. Нормали — по кривой; side — какая сторона рисуется.
  void _strip(Matrix4 m, List<double> xs, List<double> zs, List<Vector3> normals, double h, Mat mat, {required bool front, int rows = 8, List<double>? gutter}) {
    final n = xs.length - 1;
    final pts = <Vector3>[];
    final nrm = <Vector3>[];
    final rot = m.getRotation();
    for (var j = 0; j <= rows; j++) {
      final y = h / 2 - h * j / rows;
      for (var k = 0; k <= n; k++) {
        pts.add(m.transform3(Vector3(xs[k], y, zs[k])));
        final nn = rot.transform(front ? normals[k].clone() : -normals[k])..normalize();
        nrm.add(nn);
      }
    }
    final scr = [for (final p in pts) _project(p)];
    for (var j = 0; j < rows; j++) {
      for (var k = 0; k < n; k++) {
        final a = j * (n + 1) + k, b = a + 1, c = a + n + 1, e = c + 1;
        for (final q in [
          [a, b, e],
          [a, e, c],
        ]) {
          final centroid = (pts[q[0]] + pts[q[1]] + pts[q[2]]) / 3;
          var nAvg = (nrm[q[0]] + nrm[q[1]] + nrm[q[2]])..normalize();
          var flip = false;
          if (nAvg.dot(_eye - centroid) <= 0) {
            if (!mat.doubleSided) continue;
            nAvg = -nAvg;
            flip = true;
          }
          final cols = [
            for (final i in q)
              _shade(flip ? -nrm[i] : nrm[i], mat, gutter == null ? 1 : gutter[i % (n + 1)]),
          ];
          List<Offset>? uv;
          final tex = mat.tex;
          if (tex != null) {
            uv = [
              for (final i in q)
                () {
                  final u = (i % (n + 1)) / n, v = (i ~/ (n + 1)) / rows;
                  final uu = tex.flipU ? 1 - u : u;
                  return Offset(tex.rect.left + uu * tex.rect.width, tex.rect.top + v * tex.rect.height);
                }(),
            ];
          }
          _tris.add(_Tri([scr[q[0]], scr[q[1]], scr[q[2]]], uv, cols, (centroid - _eye).dot(_fwd), tex?.image, mat.pick, mat.layer));
        }
      }
    }
  }

  // ── книга (BookScene.apply) ──

  static double _clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));

  /// Изгиб листа (lib/book/page-curl.ts): угол касательной по длине листа.
  static double _curlAngle(double t, double u, double lag, double span) {
    final tt = _clamp(t, 0, 1);
    return span * tt - lag * math.sin(math.pi * tt) * _clamp(u, 0, 1) * span * 0.5;
  }

  ({List<double> x, List<double> z, List<double> nx, List<double> nz}) _curl(double t, double width, double offset, int segments, double lag, double span) {
    final x = <double>[], z = <double>[], nx = <double>[], nz = <double>[];
    final dl = width / segments;
    var px = 0.0, pz = 0.0;
    for (var i = 0; i <= segments; i++) {
      final a = _curlAngle(t, i / segments, lag, span);
      nx.add(-math.sin(a));
      nz.add(math.cos(a));
      x.add(px + nx[i] * offset);
      z.add(pz + nz[i] * offset);
      final mid = _curlAngle(t, (i + 0.5) / segments, lag, span);
      px += math.cos(mid) * dl;
      pz += math.sin(mid) * dl;
    }
    return (x: x, z: z, nx: nx, nz: nz);
  }

  double _gutter(double u) {
    final g = model.s.gutter;
    final a = u < g.u1 ? g.a0 - ((g.a0 - g.a1) * u) / g.u1 : (u < g.u2 ? g.a1 * (1 - (u - g.u1) / (g.u2 - g.u1)) : 0.0);
    return math.pow(1 - a, 2.2).toDouble();
  }

  /// Вырез развёртки обложки по прямоугольнику в мм (dims.rects).
  Tex? _spreadTex(Object? _, {bool flipU = false, required Rect raw}) {
    final img = spread;
    if (img == null) return null;
    final k = img.width / model.d.spread.w;
    return Tex(img, Rect.fromLTWH(raw.left * k, raw.top * k, raw.width * k, raw.height * k), flipU: flipU);
  }

  Tex? _pageTex(int n, {required bool back}) {
    final img = pages(n);
    if (img == null) return null;
    return Tex(img, Rect.fromLTWH(0, 0, img.width.toDouble(), img.height.toDouble()), flipU: back);
  }

  void _build(Size size) {
    final s = model.s;
    final d = model.d;
    final W = d.w, H = d.h, D = d.d, bw = d.block.w, bh = d.block.h, bd = d.block.d;
    final M = math.max(1, model.m.leaves);
    final p = _clamp(pos, 0, M + 1.0);
    final open = _clamp(p, 0, 1);
    final aperture = s.aperture;
    final span = aperture * math.pi;
    final board = s.boardMm;

    final world = _t(open * (W / 2), 0, 0);
    final paper = model.m.paper;
    final edge = Mat(color: edgeColor);
    final endpaper = Mat(color: _hex(paper.endpaper.first), layer: 1);
    // Стопки — бумага (без картинки: видимые полосы рисуют листы окна), чуть «дальше» листов при сортировке.
    final paperTop = Mat(color: _hex(s.materials.paper), layer: 2);
    final paperSide = Mat(color: _hex(paper.edge.first), layer: 2);
    // Торцы у корешка (блока и картона) всегда закрыты корешком.
    const atSpine = Mat(hidden: true);
    final r = d.rects;
    Mat cloth(Tex? t, String? pick) => Mat(color: t == null ? edgeColor : null, tex: t, pick: pick);

    // Крышки: картон толщиной board. Передняя — на шарнире у корешка.
    final zBoard = D / 2 - board / 2;
    final backTex = spread == null ? null : _spreadTex(null, raw: Rect.fromLTWH(r.back.x, r.back.y, r.back.w, r.back.h));
    _box(world * _t(0, 0, -zBoard), W, H, board, [edge, atSpine, edge, edge, Mat(color: endpaper.color, pick: 'prev', layer: 1), cloth(backTex, null)]);
    final frontTex = spread == null ? null : _spreadTex(null, raw: Rect.fromLTWH(r.front.x, r.front.y, r.front.w, r.front.h));
    final pivot = world * _t(-W / 2, 0, 0) * _ry(-open * span);
    _box(pivot * _t(W / 2, 0, zBoard), W, H, board, [edge, atSpine, edge, edge, cloth(frontTex, 'next'), Mat(color: endpaper.color, pick: 'prev', layer: 1)]);

    // Корешок: выпуклая полоса от лица (z = D) к обороту (z = 0), складывается назад при раскрытии.
    final fold = _clamp(open, 0, 1) * aperture * (math.pi / 2);
    final hinge = world * _t(-W / 2, 0, -D / 2) * _ry(-fold);
    const steps = 18;
    final sx = <double>[], sz = <double>[], sn = <Vector3>[];
    for (var j = 0; j <= steps; j++) {
      final t = j / steps;
      sz.add(D - t * D);
      sx.add(-s.spineBulge * (1 - math.pow(2 * t - 1, 2)));
    }
    for (var j = 0; j <= steps; j++) {
      final a = math.max(0, j - 1), b = math.min(steps, j + 1);
      final tx = sx[b] - sx[a], tz = sz[b] - sz[a];
      sn.add(Vector3(tz, 0, -tx)..normalize());
    }
    // Картинка корешка: u = 1 у лица (справа, если смотреть слева) — как spineGeometry сайта.
    final spineTex = spread == null ? null : _spreadTex(null, flipU: true, raw: Rect.fromLTWH(r.spine.x, r.spine.y, r.spine.w, r.spine.h));
    _strip(hinge, sx, sz, sn, H, Mat(color: spineTex == null ? edgeColor : null, tex: spineTex, doubleSided: true, layer: 0), front: true, rows: 10);

    // Стопки и листы (windowPiles сайта).
    final thickness = bd / M;
    final window = model.m.window;
    late int first, last, rightCount, leftCount;
    if (p <= 0.001) {
      first = 1;
      last = 0;
      rightCount = M;
      leftCount = 0;
    } else {
      last = math.min(M, (p + window).floor());
      first = math.max(1, (p - window).ceil());
      rightCount = math.max(0, M - last);
      leftCount = math.max(0, math.min(M, first - 1));
    }
    if (rightCount > 0) {
      final top = -bd / 2 + rightCount * thickness;
      final h = math.max(top + bd / 2, 0.001);
      _box(world * _t(-W / 2 + bw / 2, 0, -bd / 2 + h / 2), bw, bh, h, [paperSide, atSpine, paperSide, paperSide, Mat(color: paperTop.color, pick: 'next', layer: 2), paperTop]);
    }
    if (leftCount > 0) {
      final top = -bd / 2 + leftCount * thickness;
      final h = math.max(top + bd / 2, 0.001);
      final lh = world * _t(-W / 2, 0, 0) * _ry(-span);
      _box(lh * _t(bw / 2, 0, bd / 2 - h / 2), bw, bh, h, [paperSide, atSpine, paperSide, paperSide, paperTop, Mat(color: paperTop.color, pick: 'prev', layer: 2)]);
    }
    final segs = s.curl.segments;
    final gutter = [for (var k = 0; k <= segs; k++) _gutter(k / segs)];
    for (var i = first; i <= last; i++) {
      final t = _clamp(p - i, 0, 1);
      final c = _curl(t, bw, bd / 2 - (i - 0.5) * thickness, segs, s.curl.lag, span);
      final lift = thickness * 0.02;
      final xs = [for (var k = 0; k <= segs; k++) -W / 2 + c.x[k]];
      final zs = [for (var k = 0; k <= segs; k++) c.z[k] + c.nz[k] * lift];
      final ns = [for (var k = 0; k <= segs; k++) Vector3(c.nx[k], 0, c.nz[k])];
      final pageColor = _hex(s.materials.page);
      final fTex = _pageTex(2 * i - 1, back: false);
      final bTex = _pageTex(2 * i, back: true);
      _strip(world, xs, zs, ns, bh, Mat(color: fTex == null ? pageColor : null, tex: fTex, pick: 'next', gutter: true, layer: 3), front: true, rows: 6, gutter: gutter);
      _strip(world, xs, zs, ns, bh, Mat(color: bTex == null ? pageColor : null, tex: bTex, pick: 'prev', gutter: true, layer: 3), front: false, rows: 6, gutter: gutter);
    }
  }

  static Color _hex(String css) {
    final h = css.trim().replaceFirst('#', '');
    return Color(int.parse('FF$h', radix: 16));
  }

  /// Тела для тени на столе (шейдер): закрытая книга — одна коробка, раскрытая — две половины на шарнирах.
  List<({Vector3 c, double a, Vector3 h})> shadowBoxes() {
    final d = model.d;
    final W = d.w, H = d.h, D = d.d;
    final open = _clamp(pos, 0, 1);
    final shift = open * (W / 2);
    if (open < 0.02) return [(c: Vector3(shift, 0, 0), a: 0.0, h: Vector3(W / 2, H / 2, D / 2))];
    final span = model.s.aperture * math.pi;
    final hingeX = shift - W / 2;
    final rightC = Vector3(hingeX + W / 2, 0, -D / 4);
    final a = -open * span;
    final local = Vector3(W / 2, 0, D / 4);
    final rotated = Matrix4.rotationY(a).transform3(local.clone());
    return [
      (c: rightC, a: 0.0, h: Vector3(W / 2, H / 2, D / 4)),
      (c: Vector3(hingeX, 0, 0) + rotated, a: a, h: Vector3(W / 2, H / 2, D / 4)),
    ];
  }

  /// Строит кадр: камера, свет, треугольники от дальних к ближним.
  void layout(Size size) {
    _tris.clear();
    final s = model.s;
    _eye = cam.eye;
    _fwd = (-_eye)..normalize();
    _right = _fwd.cross(Vector3(0, 1, 0))..normalize();
    _up = _right.cross(_fwd)..normalize();
    _focal = (size.height / 2) / math.tan(s.camera.fovDeg * math.pi / 360);
    _center = Offset(size.width / 2, size.height / 2);
    final l = s.lights;
    _ambient = Vector3.all(l.environment * l.environmentIrradiance);
    _dirLights
      ..clear()
      ..add((Vector3(l.key.x, l.key.y, l.key.z), l.key.intensity))
      ..add((Vector3(l.back.x, l.back.y, l.back.z), l.back.intensity))
      ..add((Vector3(l.bounce.x, l.bounce.y, l.bounce.z), l.bounce.intensity));
    _build(size);
    _tris.sort((a, b) => a.layer != b.layer ? a.layer.compareTo(b.layer) : b.depth.compareTo(a.depth));
  }

  /// Что под пальцем: «next», «prev» или null (кромка, корешок, мимо книги) — как raycast сайта.
  String? pick(Offset at) {
    for (final t in _tris.reversed) {
      if (_inside(at, t.p[0], t.p[1], t.p[2])) return t.pick;
    }
    return null;
  }

  static bool _inside(Offset p, Offset a, Offset b, Offset c) {
    double sign(Offset p1, Offset p2, Offset p3) => (p1.dx - p3.dx) * (p2.dy - p3.dy) - (p2.dx - p3.dx) * (p1.dy - p3.dy);
    final d1 = sign(p, a, b), d2 = sign(p, b, c), d3 = sign(p, c, a);
    final neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  }

  final Map<ui.Image, ui.ImageShader> _shaders = {};

  void paint(Canvas canvas) {
    var i = 0;
    final paint = Paint()..filterQuality = FilterQuality.medium;
    while (i < _tris.length) {
      final img = _tris[i].image;
      var j = i;
      while (j < _tris.length && identical(_tris[j].image, img)) {
        j++;
      }
      final count = j - i;
      final pos = Float32List(count * 6);
      final cols = Int32List(count * 3);
      final uvs = img == null ? null : Float32List(count * 6);
      for (var k = 0; k < count; k++) {
        final t = _tris[i + k];
        for (var v = 0; v < 3; v++) {
          pos[k * 6 + v * 2] = t.p[v].dx;
          pos[k * 6 + v * 2 + 1] = t.p[v].dy;
          cols[k * 3 + v] = t.col[v];
          if (uvs != null) {
            uvs[k * 6 + v * 2] = t.uv![v].dx;
            uvs[k * 6 + v * 2 + 1] = t.uv![v].dy;
          }
        }
      }
      final vertices = ui.Vertices.raw(ui.VertexMode.triangles, pos, textureCoordinates: uvs, colors: cols);
      if (img != null) {
        paint.shader = _shaders[img] ??= ui.ImageShader(img, TileMode.clamp, TileMode.clamp, Matrix4.identity().storage, filterQuality: FilterQuality.medium);
        canvas.drawVertices(vertices, BlendMode.modulate, paint);
      } else {
        paint.shader = null;
        canvas.drawVertices(vertices, BlendMode.dst, paint);
      }
      vertices.dispose();
      i = j;
    }
  }

  // ── студия (шейдер) ──

  void paintStudio(Canvas canvas, Size size, ui.FragmentShader sh) {
    final s = model.s;
    final st = s.studio;
    final l = s.lights;
    var k = 0;
    void f(double v) => sh.setFloat(k++, v);
    void v3(Vector3 v) {
      f(v.x);
      f(v.y);
      f(v.z);
    }

    Vector3 col(String hex) {
      final c = _hex(hex);
      return Vector3(c.r, c.g, c.b);
    }

    final base = model.baseDistance;
    f(size.width);
    f(size.height);
    v3(_eye);
    v3(_right);
    v3(_up);
    v3(_fwd);
    f(_focal);
    f(model.groundY);
    f(base * st.floorRadiusK);
    f(base * st.fogNearK);
    f(base * st.fogFarK);
    v3(col(st.zenith));
    v3(col(st.horizon));
    v3(col(st.nadir));
    v3(col(st.floorCenter));
    v3(col(st.floorEdge));
    // Пол — та же модель света, что у книги: всё, кроме ключевого света, и ключевой отдельно (его закрывает тень).
    final up = Vector3(0, 1, 0);
    final noKey = (_hexLin(l.hemi.sky) * l.hemi.intensity + _ambient + Vector3.all(math.max(0, up.dot(Vector3(l.back.x, l.back.y, l.back.z))) * l.back.intensity + math.max(0, up.dot(Vector3(l.bounce.x, l.bounce.y, l.bounce.z))) * l.bounce.intensity)) / math.pi;
    f((noKey.x + noKey.y + noKey.z) / 3 * l.exposure);
    f(math.max(0, l.key.y) * l.key.intensity / math.pi * l.exposure);
    v3(Vector3(l.key.x, l.key.y, l.key.z));
    final d = model.d;
    f(d.w * 1.15);
    f(d.d * 5 + 22);
    f(l.contactOpacity);
    final contact = RegExp(r'rgba?\(([^)]+)\)').firstMatch(st.contact)!.group(1)!.split(',').map((e) => double.parse(e.trim())).toList();
    f(contact[0] / 255);
    f(contact[1] / 255);
    f(contact[2] / 255);
    f(contact.length > 3 ? contact[3] : 1);
    // Пол гаснет, когда камера уходит под стол (fadeGround сайта).
    f(_clamp((_eye.y - (model.groundY - 60)) / 60, 0, 1));
    // Шаг выборки тени, мм: радиус размытия shadow.radius сайта в долях ширины книги.
    f(l.shadowRadius * d.w / 512);
    final boxes = shadowBoxes();
    f(boxes.length.toDouble());
    for (var b = 0; b < 2; b++) {
      final box = b < boxes.length ? boxes[b] : (c: Vector3.zero(), a: 0.0, h: Vector3.zero());
      v3(box.c);
      f(box.a);
      v3(box.h);
    }
    canvas.drawRect(Offset.zero & size, Paint()..shader = sh);
  }
}
