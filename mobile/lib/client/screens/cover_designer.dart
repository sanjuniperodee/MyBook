import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/cabinet.dart';

/// Чистая логика конструктора обложки (без виджетов): парсинг цветов, создание слоёв, порядок, выравнивание,
/// проверка безопасной зоны, вычисление DPI и клонирование. Соответствует src/components/cover/designer/logic.ts.
class CoverDesignerLogic {
  static double round4(double v) => (v * 10000).round() / 10000;

  static Color parseHex(String? hex, {Color fallback = const Color(0xFF1F1A17)}) {
    if (hex == null) return fallback;
    final clean = hex.trim().replaceFirst('#', '');
    if (clean.length != 6) return fallback;
    final val = int.tryParse(clean, radix: 16);
    if (val == null) return fallback;
    return Color(0xFF000000 | val);
  }

  static String toHex(Color c) {
    final r = (c.r * 255).round().toRadixString(16).padLeft(2, '0');
    final g = (c.g * 255).round().toRadixString(16).padLeft(2, '0');
    final b = (c.b * 255).round().toRadixString(16).padLeft(2, '0');
    return '#${(r + g + b).toUpperCase()}';
  }

  static bool isValidHex(String s) => RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(s.trim());

  /// Контрастный акцент для новых слоёв: светлый на тёмном фоне, тёмный на светлом (как inkOn в geometry.ts).
  static String contrastAccent(v1api.CoverBackground bg, String? baseColor) {
    final hex = bg.kind == 'color'
        ? bg.color
        : bg.kind == 'gradient'
            ? bg.from
            : baseColor;
    if (hex == null || !isValidHex(hex)) return '#1F1A17';
    final c = parseHex(hex);
    final lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return lum > 0.55 ? '#1F1A17' : '#F3D9A4';
  }

  static String nextLayerId(List<v1api.CoverLayer> layers) {
    final used = layers.map((l) => l.id).toSet();
    var idx = layers.length + 1;
    while (true) {
      final candidate = 'm${DateTime.now().microsecondsSinceEpoch.toRadixString(36).substring(0, 5)}${idx.toRadixString(36)}';
      final id = candidate.length > 16 ? candidate.substring(candidate.length - 16) : candidate;
      if (!used.contains(id)) return id;
      idx++;
    }
  }

  static v1api.CoverLayer copyLayer(
    v1api.CoverLayer l, {
    String? id,
    String? name,
    bool clearName = false,
    double? x,
    double? y,
    double? w,
    double? h,
    double? rotate,
    bool clearRotate = false,
    double? opacity,
    bool clearOpacity = false,
    bool? locked,
    bool clearLocked = false,
    bool? hidden,
    bool clearHidden = false,
    String? bind,
    bool clearBind = false,
    String? text,
    v1api.CoverTextStyle? style,
    String? photoId,
    bool clearPhotoId = false,
    String? stock,
    bool clearStock = false,
    v1api.CoverPhotoFrame? frame,
    bool clearFrame = false,
    String? mask,
    double? radius,
    bool clearRadius = false,
    v1api.CoverColorWidth? border,
    bool clearBorder = false,
    bool? mono,
    bool clearMono = false,
    v1api.CoverColorOpacity? overlay,
    bool clearOverlay = false,
    String? shape,
    String? fill,
    bool clearFill = false,
    v1api.CoverShapeGradient? gradient,
    bool clearGradient = false,
    String? stroke,
    bool clearStroke = false,
    double? strokeWidth,
    String? motif,
    String? color,
    String? accent,
    bool clearAccent = false,
  }) {
    final nulls = <String>{...l.nulls};
    if (clearPhotoId) nulls.add('photoId');
    if (photoId != null) nulls.remove('photoId');
    if (clearStock) nulls.add('stock');
    if (stock != null) nulls.remove('stock');
    if (clearBorder) nulls.add('border');
    if (border != null) nulls.remove('border');
    if (clearOverlay) nulls.add('overlay');
    if (overlay != null) nulls.remove('overlay');
    if (clearFill) nulls.add('fill');
    if (fill != null) nulls.remove('fill');
    if (clearGradient) nulls.add('gradient');
    if (gradient != null) nulls.remove('gradient');
    if (clearStroke) nulls.add('stroke');
    if (stroke != null) nulls.remove('stroke');

    return v1api.CoverLayer(
      id: id ?? l.id,
      kind: l.kind,
      name: clearName ? null : (name ?? l.name),
      x: round4(x ?? l.x),
      y: round4(y ?? l.y),
      w: round4(w ?? l.w),
      h: round4(h ?? l.h),
      rotate: clearRotate ? null : (rotate ?? l.rotate),
      opacity: clearOpacity ? null : (opacity ?? l.opacity),
      locked: clearLocked ? null : (locked ?? l.locked),
      hidden: clearHidden ? null : (hidden ?? l.hidden),
      bind: clearBind ? null : (bind ?? l.bind),
      text: text ?? l.text,
      style: style ?? l.style,
      photoId: clearPhotoId ? null : (photoId ?? l.photoId),
      stock: clearStock ? null : (stock ?? l.stock),
      frame: clearFrame ? null : (frame ?? l.frame),
      mask: mask ?? l.mask,
      radius: clearRadius ? null : (radius ?? l.radius),
      border: clearBorder ? null : (border ?? l.border),
      mono: clearMono ? null : (mono ?? l.mono),
      overlay: clearOverlay ? null : (overlay ?? l.overlay),
      shape: shape ?? l.shape,
      fill: clearFill ? null : (fill ?? l.fill),
      gradient: clearGradient ? null : (gradient ?? l.gradient),
      stroke: clearStroke ? null : (stroke ?? l.stroke),
      strokeWidth: strokeWidth ?? l.strokeWidth,
      motif: motif ?? l.motif,
      color: color ?? l.color,
      accent: clearAccent ? null : (accent ?? l.accent),
      art: l.art,
      spec: l.spec,
      nulls: nulls,
    );
  }

  static v1api.CoverTextStyle copyTextStyle(
    v1api.CoverTextStyle s, {
    String? font,
    int? weight,
    bool? italic,
    bool clearItalic = false,
    bool? underline,
    bool clearUnderline = false,
    bool? upper,
    bool clearUpper = false,
    double? size,
    String? color,
    double? tracking,
    bool clearTracking = false,
    double? lineHeight,
    String? align,
    String? valign,
    v1api.CoverTextShadow? shadow,
    bool clearShadow = false,
    v1api.CoverColorWidth? outline,
    bool clearOutline = false,
    v1api.CoverTextPlate? plate,
    bool clearPlate = false,
  }) =>
      v1api.CoverTextStyle(
        font: font ?? s.font,
        weight: weight ?? s.weight,
        italic: clearItalic ? null : (italic ?? s.italic),
        underline: clearUnderline ? null : (underline ?? s.underline),
        upper: clearUpper ? null : (upper ?? s.upper),
        size: size != null ? round4(size) : s.size,
        color: color ?? s.color,
        tracking: clearTracking ? null : (tracking != null ? round4(tracking) : s.tracking),
        lineHeight: lineHeight != null ? round4(lineHeight) : s.lineHeight,
        align: align ?? s.align,
        valign: valign ?? s.valign,
        shadow: clearShadow ? null : (shadow ?? s.shadow),
        outline: clearOutline ? null : (outline ?? s.outline),
        plate: clearPlate ? null : (plate ?? s.plate),
      );

  static v1api.CoverLayer newTextLayer(
    List<v1api.CoverLayer> existing,
    v1api.CoverTextPresetOption preset,
    v1api.CoverRect safe,
    String color,
  ) {
    final w = round4(safe.w * 0.86);
    final h = preset.h;
    return v1api.CoverLayer(
      id: nextLayerId(existing),
      kind: 'text',
      text: preset.sampleText,
      x: round4(safe.x + (safe.w - w) / 2),
      y: round4(safe.y + (safe.h - h) / 2),
      w: w,
      h: h,
      style: v1api.CoverTextStyle(
        font: preset.font,
        weight: preset.weight,
        size: preset.size,
        color: color,
        lineHeight: preset.lineHeight,
        tracking: preset.tracking,
        upper: preset.upper,
        align: 'center',
        valign: 'middle',
      ),
    );
  }

  static v1api.CoverLayer newImageLayer(
    List<v1api.CoverLayer> existing, {
    String? photoId,
    String? stock,
    required v1api.CoverRect safe,
    required v1api.CoverBoardSize board,
    double aspect = 4 / 3,
  }) {
    var w = safe.w * 0.7;
    var h = (w * board.w) / aspect / board.h;
    if (h > 0.6) {
      h = 0.6;
      w = (h * board.h * aspect) / board.w;
    }
    w = round4(w);
    h = round4(h);
    return v1api.CoverLayer(
      id: nextLayerId(existing),
      kind: 'image',
      photoId: photoId,
      stock: stock,
      mask: 'rect',
      x: round4(safe.x + (safe.w - w) / 2),
      y: round4(safe.y + (safe.h - h) / 2),
      w: w,
      h: h,
    );
  }

  static v1api.CoverLayer newShapeLayer(
    List<v1api.CoverLayer> existing,
    v1api.CoverShapeOption shape,
    v1api.CoverRect safe,
    v1api.CoverBoardSize board,
    String color,
  ) {
    final id = nextLayerId(existing);
    if (shape.id == 'line') {
      final w = round4(safe.w * 0.5);
      const h = 0.02;
      return v1api.CoverLayer(
        id: id,
        kind: 'shape',
        shape: shape.id,
        stroke: color,
        strokeWidth: 0.004,
        x: round4(safe.x + (safe.w - w) / 2),
        y: round4(safe.y + (safe.h - h) / 2),
        w: w,
        h: h,
      );
    }
    if (shape.outlineOnly) {
      final w = round4(safe.w * 0.92);
      final h = round4(safe.h * 0.92);
      return v1api.CoverLayer(
        id: id,
        kind: 'shape',
        shape: shape.id,
        stroke: color,
        strokeWidth: 0.004,
        x: round4(safe.x + (safe.w - w) / 2),
        y: round4(safe.y + (safe.h - h) / 2),
        w: w,
        h: h,
      );
    }
    final side = safe.w * 0.4;
    final w = round4(side);
    final h = round4((side * board.w) / board.h);
    return v1api.CoverLayer(
      id: id,
      kind: 'shape',
      shape: shape.id,
      fill: color,
      x: round4(safe.x + (safe.w - w) / 2),
      y: round4(safe.y + (safe.h - h) / 2),
      w: w,
      h: h,
    );
  }

  static v1api.CoverLayer newDecorLayer(
    List<v1api.CoverLayer> existing,
    v1api.CoverDecorOption decor,
    v1api.CoverRect safe,
    v1api.CoverBoardSize board,
    String color,
  ) {
    final w = round4(safe.w * (decor.aspect > 2 ? 0.5 : 0.22));
    final h = round4((w * board.w) / math.max(decor.aspect, 0.1) / board.h);
    return v1api.CoverLayer(
      id: nextLayerId(existing),
      kind: 'decor',
      motif: decor.id,
      color: color,
      x: round4(safe.x + (safe.w - w) / 2),
      y: round4(safe.y + (safe.h - h) / 2),
      w: w,
      h: h,
    );
  }

  static List<v1api.CoverLayer> moveZ(List<v1api.CoverLayer> layers, String id, String how) {
    final i = layers.indexWhere((l) => l.id == id);
    if (i < 0) return layers;
    final to = switch (how) {
      'front' => layers.length - 1,
      'back' => 0,
      'up' => math.min(layers.length - 1, i + 1),
      'down' => math.max(0, i - 1),
      _ => i,
    };
    if (to == i) return layers;
    final next = [...layers];
    final item = next.removeAt(i);
    next.insert(to, item);
    return next;
  }

  static v1api.CoverLayer alignLayer(v1api.CoverLayer l, String how, v1api.CoverRect safe) {
    return switch (how) {
      'left' => copyLayer(l, x: safe.x),
      'right' => copyLayer(l, x: safe.x + safe.w - l.w),
      'center' => copyLayer(l, x: 0.5 - l.w / 2),
      'top' => copyLayer(l, y: safe.y),
      'bottom' => copyLayer(l, y: safe.y + safe.h - l.h),
      'middle' => copyLayer(l, y: 0.5 - l.h / 2),
      _ => l,
    };
  }

  static v1api.CoverLayer duplicateLayer(
    List<v1api.CoverLayer> layers,
    v1api.CoverLayer l,
    String resolvedText,
  ) {
    return copyLayer(
      l,
      id: nextLayerId(layers),
      x: l.x + 0.025,
      y: l.y + 0.025,
      clearLocked: true,
      clearHidden: true,
      clearBind: l.kind == 'text' && l.bind != null,
      text: l.kind == 'text' && l.bind != null ? resolvedText : l.text,
    );
  }

  static String resolveText(v1api.CoverLayer l, v1api.Cover cover) {
    final names = cover.namesOnCover.trim().isNotEmpty ? cover.namesOnCover : cover.autoNames;
    return switch (l.bind) {
      'title' => cover.title,
      'subtitle' => cover.subtitle,
      'names' => names,
      _ => l.text ?? '',
    };
  }

  static List<v1api.CoverLayer> unsafeTextLayers(
    List<v1api.CoverLayer> layers,
    v1api.CoverRect safe,
    v1api.Cover cover,
    v1api.CoverBoardSize board,
  ) {
    const eps = 0.002;
    final out = <v1api.CoverLayer>[];
    for (final l in layers) {
      if (l.kind != 'text' || l.hidden == true) continue;
      if (resolveText(l, cover).trim().isEmpty) continue;
      final rot = l.rotate ?? 0;
      double x = l.x, y = l.y, w = l.w, h = l.h;
      if (rot != 0) {
        final rad = rot * math.pi / 180;
        final wm = w * board.w;
        final hm = h * board.h;
        final rw = (wm * math.cos(rad)).abs() + (hm * math.sin(rad)).abs();
        final rh = (wm * math.sin(rad)).abs() + (hm * math.cos(rad)).abs();
        final cx = x + w / 2;
        final cy = y + h / 2;
        w = rw / board.w;
        h = rh / board.h;
        x = cx - w / 2;
        y = cy - h / 2;
      }
      if (x < safe.x - eps || y < safe.y - eps || x + w > safe.x + safe.w + eps || y + h > safe.y + safe.h + eps) {
        out.add(l);
      }
    }
    return out;
  }

  static int effectiveDpi(int imgW, int imgH, double boxWMm, double boxHMm, double zoom) {
    if (imgW <= 0 || imgH <= 0 || boxWMm <= 0 || boxHMm <= 0) return 0;
    final mmPerPx = math.max(boxWMm / imgW, boxHMm / imgH) * zoom;
    return (25.4 / mmPerPx).round();
  }

  static double mirrorAngle(double angle) => (((180 - angle) % 360) + 360) % 360;

  static Alignment gradientBegin(double angle) {
    final rad = angle * math.pi / 180;
    return Alignment(-math.cos(rad), -math.sin(rad));
  }

  static Alignment gradientEnd(double angle) {
    final rad = angle * math.pi / 180;
    return Alignment(math.cos(rad), math.sin(rad));
  }
}

/// Полноценный нативный конструктор обложки (лицо и оборот): интерактивный холст с выбором, перетаскиванием и
/// масштабированием слоёв, панель инструментов (отмена/повтор, дублировать, удалить, безопасная зона, сетка, сброс),
/// вкладки «Добавить» (тексты, фото книги/сток/загрузка, фигуры и декоративные линии, декор), «Свойства», «Слои»,
/// «Макеты» и «Фон». Все надписи, палитры, шрифты, SVG-мотивы и пределы приходят с сервера в [catalog].
class CoverDesignerView extends StatefulWidget {
  const CoverDesignerView({
    super.key,
    required this.bookId,
    required this.view,
    required this.catalog,
    required this.side,
    required this.photos,
    required this.saving,
    required this.onSaveDesign,
    required this.onSaveBookText,
    required this.onToggleCoverLines,
    required this.onApplyLayout,
    required this.onReset,
    required this.onUploadPhoto,
    this.stageSpread,
    this.saveError,
  });

  final String bookId;
  final v1api.CoverView view;
  final v1api.CoverDesignerCatalog catalog;
  final String side;
  final List<v1api.CabPhoto> photos;
  final bool saving;
  final String? saveError;
  final Widget? stageSpread;
  final Future<void> Function(v1api.CoverDesign design) onSaveDesign;
  final Future<void> Function(String bind, String value) onSaveBookText;
  final Future<void> Function(bool lines) onToggleCoverLines;
  final Future<void> Function({String? layoutId, String? backLayout}) onApplyLayout;
  final Future<void> Function() onReset;
  final Future<v1api.CabPhoto?> Function() onUploadPhoto;

  @override
  State<CoverDesignerView> createState() => _CoverDesignerViewState();
}

class _CoverDesignerViewState extends State<CoverDesignerView> {
  late v1api.CoverDesign _design;
  final List<v1api.CoverDesign> _past = [];
  final List<v1api.CoverDesign> _future = [];
  String? _selectedId;
  String _panel = 'add';
  bool _showSafe = true;
  bool _showGrid = false;
  String _stockGroup = 'people';
  String _layoutGenre = 'all';
  String _layoutQuery = '';
  Timer? _saveTimer;
  Timer? _textTimer;
  v1api.CoverDesign? _pendingDesign;
  String? _pendingBind;
  String? _pendingBindValue;

  bool get _isBack => widget.side == 'back';
  v1api.Cover get _cover => widget.view.cover;
  v1api.CoverDesignerCatalog get _cat => widget.catalog;
  v1api.CoverDesignerLabels get _l => _cat.labels;
  v1api.CoverDesignerLimits get _lim => _cat.limits;
  v1api.CoverBoardSize get _board => _cover.board ?? const v1api.CoverBoardSize(w: 152, h: 216);
  v1api.CoverRect get _safe => _isBack ? (_cover.safeBack ?? const v1api.CoverRect(x: 0.05, y: 0.04, w: 0.89, h: 0.92)) : (_cover.safeFront ?? const v1api.CoverRect(x: 0.06, y: 0.04, w: 0.89, h: 0.92));

  v1api.CoverDesign _designFromView(v1api.CoverView v) {
    if (_isBack) {
      final b = v.cover.coverBack;
      return v1api.CoverDesign(
        v: 1,
        background: b?.background ?? const v1api.CoverBackground(kind: 'template'),
        layers: b?.layers ?? const [],
      );
    }
    return v.cover.coverDesign ?? const v1api.CoverDesign(v: 1, background: v1api.CoverBackground(kind: 'template'), layers: []);
  }

  @override
  void initState() {
    super.initState();
    _design = _designFromView(widget.view);
    if (_cat.stockGroups.isNotEmpty) _stockGroup = _cat.stockGroups.first.id;
  }

  @override
  void didUpdateWidget(covariant CoverDesignerView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.side != widget.side) {
      _flush();
      _past.clear();
      _future.clear();
      _selectedId = null;
      _design = _designFromView(widget.view);
    } else if (_pendingDesign == null && _saveTimer == null) {
      final incoming = _designFromView(widget.view);
      if (jsonEncode(incoming.toJson()) != jsonEncode(_design.toJson())) {
        _design = incoming;
        if (_selectedId != null && !_design.layers.any((l) => l.id == _selectedId)) {
          _selectedId = null;
        }
      }
    }
  }

  @override
  void dispose() {
    _flush();
    _saveTimer?.cancel();
    _textTimer?.cancel();
    super.dispose();
  }

  void _flush() {
    _saveTimer?.cancel();
    _saveTimer = null;
    final d = _pendingDesign;
    _pendingDesign = null;
    if (d != null) widget.onSaveDesign(d);

    _textTimer?.cancel();
    _textTimer = null;
    final bind = _pendingBind;
    final val = _pendingBindValue;
    _pendingBind = null;
    _pendingBindValue = null;
    if (bind != null && val != null) widget.onSaveBookText(bind, val);
  }

  void _scheduleSave(v1api.CoverDesign next, {bool immediate = false}) {
    _pendingDesign = next;
    _saveTimer?.cancel();
    if (immediate) {
      _pendingDesign = null;
      widget.onSaveDesign(next);
    } else {
      _saveTimer = Timer(const Duration(milliseconds: 650), () {
        final d = _pendingDesign;
        _pendingDesign = null;
        _saveTimer = null;
        if (d != null && mounted) widget.onSaveDesign(d);
      });
    }
  }

  void _commit(v1api.CoverDesign next, {bool recordHistory = true, bool immediate = false}) {
    if (!_cover.editable) return;
    setState(() {
      if (recordHistory) {
        _past.add(_design);
        if (_past.length > _lim.historyLimit) _past.removeAt(0);
        _future.clear();
      }
      _design = next;
    });
    _scheduleSave(next, immediate: immediate);
  }

  void _undo() {
    if (_past.isEmpty || !_cover.editable) return;
    final prev = _past.removeLast();
    setState(() {
      _future.insert(0, _design);
      _design = prev;
      if (_selectedId != null && !_design.layers.any((l) => l.id == _selectedId)) _selectedId = null;
    });
    _scheduleSave(prev, immediate: true);
  }

  void _redo() {
    if (_future.isEmpty || !_cover.editable) return;
    final next = _future.removeAt(0);
    setState(() {
      _past.add(_design);
      _design = next;
      if (_selectedId != null && !_design.layers.any((l) => l.id == _selectedId)) _selectedId = null;
    });
    _scheduleSave(next, immediate: true);
  }

  v1api.CoverLayer? get _selected {
    if (_selectedId == null) return null;
    for (final l in _design.layers) {
      if (l.id == _selectedId) return l;
    }
    return null;
  }

  void _patchLayer(String id, v1api.CoverLayer Function(v1api.CoverLayer) fn, {bool recordHistory = true, bool immediate = false}) {
    final next = v1api.CoverDesign(
      v: 1,
      background: _design.background,
      layers: [for (final l in _design.layers) l.id == id ? fn(l) : l],
    );
    _commit(next, recordHistory: recordHistory, immediate: immediate);
  }

  void _addLayer(v1api.CoverLayer l) {
    if (!_cover.editable || _design.layers.length >= _lim.layers) return;
    final next = v1api.CoverDesign(v: 1, background: _design.background, layers: [..._design.layers, l]);
    setState(() {
      _selectedId = l.id;
      _panel = 'properties';
    });
    _commit(next, immediate: true);
  }

  void _removeSelected() {
    final sel = _selected;
    if (sel == null || !_cover.editable) return;
    final next = v1api.CoverDesign(v: 1, background: _design.background, layers: _design.layers.where((l) => l.id != sel.id).toList());
    setState(() => _selectedId = null);
    _commit(next, immediate: true);
  }

  void _duplicateSelected() {
    final sel = _selected;
    if (sel == null || !_cover.editable || _design.layers.length >= _lim.layers) return;
    final copy = CoverDesignerLogic.duplicateLayer(_design.layers, sel, CoverDesignerLogic.resolveText(sel, _cover));
    final idx = _design.layers.indexWhere((l) => l.id == sel.id);
    final list = [..._design.layers];
    list.insert(idx + 1, copy);
    setState(() => _selectedId = copy.id);
    _commit(v1api.CoverDesign(v: 1, background: _design.background, layers: list), immediate: true);
  }

  void _pickPhotoForAddOrSelected({String? photoId, String? stock, double aspect = 4 / 3}) {
    final sel = _selected;
    if (sel != null && sel.kind == 'image') {
      _patchLayer(
        sel.id,
        (l) => CoverDesignerLogic.copyLayer(
          l,
          photoId: photoId,
          clearPhotoId: photoId == null,
          stock: stock,
          clearStock: stock == null,
          clearFrame: true,
        ),
        immediate: true,
      );
      return;
    }
    _addLayer(CoverDesignerLogic.newImageLayer(_design.layers, photoId: photoId, stock: stock, safe: _safe, board: _board, aspect: aspect));
  }

  Future<void> _renameLayer(v1api.CoverLayer l) async {
    final ctrl = TextEditingController(text: l.name ?? '');
    final res = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_l.layers.rename),
        content: TextField(controller: ctrl, maxLength: _lim.name, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(_l.replace.cancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: Text(_l.props.image.cropDone)),
        ],
      ),
    );
    ctrl.dispose();
    if (res != null && mounted) {
      _patchLayer(l.id, (x) => CoverDesignerLogic.copyLayer(x, name: res.isEmpty ? null : res, clearName: res.isEmpty), immediate: true);
    }
  }

  Future<void> _confirmReset() async {
    final title = _isBack ? _l.backCta.reset : _l.cta.reset;
    final body = _isBack ? _l.backCta.confirmReset : _l.cta.confirmReset;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(_l.replace.cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: ctx.c.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(title),
          ),
        ],
      ),
    );
    if (ok == true) {
      _flush();
      await widget.onReset();
    }
  }

  String get _accent => CoverDesignerLogic.contrastAccent(_design.background, _cover.templateBaseColor);
  String get _shapeAccent => _accent == '#1F1A17' ? '#B8925A' : _accent;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final sel = _selected;
    final unsafe = CoverDesignerLogic.unsafeTextLayers(_design.layers, _safe, _cover, _board);
    final panels = [
      ('add', _l.panels.add, null as int?),
      ('properties', _l.panels.properties, null),
      ('layers', _l.panels.layers, _design.layers.isEmpty ? null : _design.layers.length),
      ('layouts', _l.panels.layouts, null),
      ('background', _l.panels.background, null),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Панель инструментов конструктора (отмена, повтор, дублировать, удалить, безопасная зона, сетка, сброс).
        _DesignerToolbar(
          labels: _l.toolbar,
          resetLabel: _isBack ? _l.backCta.reset : _l.cta.reset,
          editable: _cover.editable,
          canUndo: _past.isNotEmpty,
          canRedo: _future.isNotEmpty,
          hasSelection: sel != null,
          full: _design.layers.length >= _lim.layers,
          showSafe: _showSafe,
          showGrid: _showGrid,
          onUndo: _undo,
          onRedo: _redo,
          onDuplicate: _duplicateSelected,
          onRemove: _removeSelected,
          onToggleSafe: () => setState(() => _showSafe = !_showSafe),
          onToggleGrid: () => setState(() => _showGrid = !_showGrid),
          onReset: _cover.editable ? _confirmReset : null,
        ),
        const SizedBox(height: 12),

        // Сцена: развёртка целиком или интерактивный холст конструктора.
        if (widget.stageSpread != null)
          widget.stageSpread!
        else
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: _DesignerCanvas(
                cover: _cover,
                design: _design,
                catalog: _cat,
                side: widget.side,
                board: _board,
                safe: _safe,
                selectedId: _selectedId,
                showSafe: _showSafe,
                showGrid: _showGrid,
                editable: _cover.editable,
                onSelect: (id) {
                  setState(() {
                    _selectedId = id;
                    if (id != null && _panel != 'layers') _panel = 'properties';
                  });
                },
                onDragStart: () {
                  if (_cover.editable) {
                    _past.add(_design);
                    if (_past.length > _lim.historyLimit) _past.removeAt(0);
                    _future.clear();
                  }
                },
                onMoveLayer: (id, x, y) {
                  _patchLayer(id, (l) => CoverDesignerLogic.copyLayer(l, x: x, y: y), recordHistory: false);
                },
                onResizeLayer: (id, w, h) {
                  _patchLayer(id, (l) => CoverDesignerLogic.copyLayer(l, w: w, h: h), recordHistory: false);
                },
              ),
            ),
          ),

        const SizedBox(height: 8),
        SizedBox(
          height: 20,
          child: Center(
            child: widget.saving
                ? Row(mainAxisSize: MainAxisSize.min, children: [
                    const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.6)),
                    const SizedBox(width: 8),
                    Text(widget.view.labels.saving, style: TextStyle(fontSize: 13, color: c.textMuted)),
                  ])
                : widget.saveError != null
                    ? Text(widget.saveError!, style: TextStyle(fontSize: 13, color: c.danger), textAlign: TextAlign.center)
                    : null,
          ),
        ),

        if (unsafe.isNotEmpty) ...[
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(Cab.ctl)),
            child: Row(children: [
              Icon(LucideIcons.triangleAlert, size: 16, color: c.warn),
              const SizedBox(width: 8),
              Expanded(child: Text(_l.canvas.unsafeWarning, style: TextStyle(fontSize: 13, color: c.warn))),
              TextButton(
                onPressed: () => setState(() {
                  _selectedId = unsafe.first.id;
                  _panel = 'properties';
                }),
                child: Text(_l.canvas.unsafeShow, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.warn)),
              ),
            ]),
          ),
        ],

        const SizedBox(height: 12),

        // Вкладки конструктора (Добавить, Свойства, Слои, Макеты, Фон).
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Container(
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
            child: Row(children: [
              for (final p in panels)
                InkWell(
                  onTap: () => setState(() => _panel = p.$1),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(4, 10, 4, 10),
                    margin: const EdgeInsets.only(right: 16),
                    decoration: BoxDecoration(
                      border: Border(bottom: BorderSide(color: _panel == p.$1 ? c.brand : Colors.transparent, width: 2)),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(
                        p.$2,
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: _panel == p.$1 ? FontWeight.w600 : FontWeight.w500,
                          color: _panel == p.$1 ? c.text : c.textMuted,
                        ),
                      ),
                      if (p.$3 != null) ...[
                        const SizedBox(width: 5),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(999)),
                          child: Text('${p.$3}', style: TextStyle(fontSize: 11.5, color: c.textMuted, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ]),
                  ),
                ),
            ]),
          ),
        ),
        const SizedBox(height: 16),

        switch (_panel) {
          'add' => _buildAddPanel(),
          'properties' => _buildPropertiesPanel(sel),
          'layers' => _buildLayersPanel(),
          'layouts' => _buildLayoutsPanel(),
          _ => _buildBackgroundPanel(),
        },
      ],
    );
  }

  // ─── Панель «Добавить» ──────────────────────────────────────────────────────

  Widget _buildAddPanel() {
    final c = context.c;
    final full = _design.layers.length >= _lim.layers;
    final enabled = _cover.editable && !full;
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: IgnorePointer(
        ignoring: !enabled,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (full) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_l.add.limit, style: TextStyle(fontSize: 13, color: c.textMuted))),

          // 1. Текст
          _SectionTitle(_l.add.text),
          const SizedBox(height: 8),
          for (final p in _cat.textPresets)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                onTap: () => _addLayer(CoverDesignerLogic.newTextLayer(_design.layers, p, _safe, _accent)),
                borderRadius: BorderRadius.circular(Cab.ctl),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.ctl), border: Border.all(color: c.border)),
                  child: Text(
                    p.upper == true ? p.label.toUpperCase() : p.label,
                    style: _previewTextStyle(p.font, p.weight, p.id == 'heading' ? 20 : (p.id == 'script' ? 20 : (p.id == 'subheading' ? 13 : 15)), c.text, tracking: p.tracking),
                  ),
                ),
              ),
            ),

          const SizedBox(height: 14),

          // 2. Фото (фото книги, загрузка и коллекция стока)
          _SectionTitle(_l.add.photo),
          const SizedBox(height: 8),
          _buildPhotoSourcePicker(onPick: _pickPhotoForAddOrSelected),

          const SizedBox(height: 18),

          // 3. Фигуры и декоративные линии (линия, рамка, двойная рамка, уголки, прямоугольник, круг, арка)
          _SectionTitle(_l.add.shapes),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 0.9,
            children: [
              for (final s in _cat.shapes)
                InkWell(
                  onTap: () => _addLayer(CoverDesignerLogic.newShapeLayer(_design.layers, s, _safe, _board, _shapeAccent)),
                  borderRadius: BorderRadius.circular(Cab.ctl),
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.ctl), border: Border.all(color: c.border)),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Expanded(child: SvgPicture.string(s.svg, fit: BoxFit.contain)),
                      const SizedBox(height: 4),
                      Text(s.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, color: c.textMuted)),
                    ]),
                  ),
                ),
            ],
          ),

          const SizedBox(height: 18),

          // 4. Декор (22 векторных мотива)
          _SectionTitle(_l.add.decor),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 5,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 6,
            crossAxisSpacing: 6,
            children: [
              for (final d in _cat.decors)
                Tooltip(
                  message: d.label,
                  child: InkWell(
                    onTap: () => _addLayer(CoverDesignerLogic.newDecorLayer(_design.layers, d, _safe, _board, _shapeAccent)),
                    borderRadius: BorderRadius.circular(Cab.ctl),
                    child: Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.ctl), border: Border.all(color: c.border)),
                      child: SvgPicture.string(d.svg, fit: BoxFit.contain),
                    ),
                  ),
                ),
            ],
          ),
        ]),
      ),
    );
  }

  Widget _buildPhotoSourcePicker({
    String? selectedPhotoId,
    String? selectedStock,
    required void Function({String? photoId, String? stock, double aspect}) onPick,
  }) {
    final c = context.c;
    final backend = context.read<ClientSession>().backend;
    final stockList = _cat.stockPhotos.where((s) => s.group == _stockGroup).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(_l.add.bookPhotos, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted))),
        if (_cover.editable)
          TextButton.icon(
            onPressed: () async {
              final uploaded = await widget.onUploadPhoto();
              if (uploaded != null && mounted) {
                final aspect = uploaded.height > 0 ? uploaded.width / uploaded.height : 4 / 3;
                onPick(photoId: uploaded.id, aspect: aspect);
              }
            },
            icon: const Icon(LucideIcons.imagePlus, size: 16),
            label: Text(_l.add.upload),
          ),
      ]),
      if (widget.photos.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Text(_l.add.noBookPhotos, style: TextStyle(fontSize: 13, color: c.textMuted)),
        )
      else
        GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
          children: [
            for (final p in widget.photos)
              GestureDetector(
                onTap: _cover.editable
                    ? () => onPick(photoId: p.id, aspect: p.height > 0 ? p.width / p.height : 4 / 3)
                    : null,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: selectedPhotoId == p.id ? c.brand : Colors.transparent, width: 2.5),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Image.network(
                      backend.url(p.thumbUrl),
                      headers: backend.imageHeaders,
                      fit: BoxFit.cover,
                      cacheWidth: 240,
                      gaplessPlayback: true,
                      errorBuilder: (_, _, _) => ColoredBox(color: c.surface),
                    ),
                  ),
                ),
              ),
          ],
        ),
      const SizedBox(height: 12),
      Text(_l.add.stock, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
      const SizedBox(height: 6),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final g in _cat.stockGroups)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _DesignerChip(label: g.label, on: _stockGroup == g.id, onTap: () => setState(() => _stockGroup = g.id)),
            ),
        ]),
      ),
      const SizedBox(height: 8),
      GridView.count(
        crossAxisCount: 4,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        children: [
          for (final s in stockList)
            GestureDetector(
              onTap: _cover.editable ? () => onPick(stock: s.id, aspect: 4 / 3) : null,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: selectedStock == s.id ? c.brand : Colors.transparent, width: 2.5),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Image.network(
                    backend.url(s.thumbUrl),
                    fit: BoxFit.cover,
                    cacheWidth: 240,
                    gaplessPlayback: true,
                    errorBuilder: (_, _, _) => ColoredBox(color: c.surface),
                  ),
                ),
              ),
            ),
        ],
      ),
    ]);
  }

  // ─── Панель «Свойства» ──────────────────────────────────────────────────────

  Widget _buildPropertiesPanel(v1api.CoverLayer? sel) {
    final c = context.c;
    if (sel == null) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(_l.props.nothing, style: TextStyle(fontSize: 14, color: c.textMuted)),
        const SizedBox(height: 16),
        _buildBackgroundPanel(),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _buildLayerActionBar(sel),
      const SizedBox(height: 14),
      if (sel.kind == 'text') _buildTextProps(sel),
      if (sel.kind == 'image') _buildImageProps(sel),
      if (sel.kind == 'shape') _buildShapeProps(sel),
      if (sel.kind == 'decor') _buildDecorProps(sel),
      const SizedBox(height: 18),
      _buildGeometryProps(sel),
    ]);
  }

  Widget _buildLayerActionBar(v1api.CoverLayer sel) {
    final c = context.c;
    final on = _cover.editable;
    final canAlign = on && sel.locked != true;
    Widget btn(IconData icon, String tip, VoidCallback? onTap, {bool active = false}) => Tooltip(
          message: tip,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: active ? c.bubbleOut : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 18, color: onTap == null ? c.textFaint : (active ? c.brand : c.text)),
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Cab.ctl)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 2, children: [
          btn(LucideIcons.arrowUpToLine, _l.toolbar.front, on ? () => _commit(v1api.CoverDesign(v: 1, background: _design.background, layers: CoverDesignerLogic.moveZ(_design.layers, sel.id, 'front')), immediate: true) : null),
          btn(LucideIcons.arrowUp, _l.toolbar.forward, on ? () => _commit(v1api.CoverDesign(v: 1, background: _design.background, layers: CoverDesignerLogic.moveZ(_design.layers, sel.id, 'up')), immediate: true) : null),
          btn(LucideIcons.arrowDown, _l.toolbar.backward, on ? () => _commit(v1api.CoverDesign(v: 1, background: _design.background, layers: CoverDesignerLogic.moveZ(_design.layers, sel.id, 'down')), immediate: true) : null),
          btn(LucideIcons.arrowDownToLine, _l.toolbar.back, on ? () => _commit(v1api.CoverDesign(v: 1, background: _design.background, layers: CoverDesignerLogic.moveZ(_design.layers, sel.id, 'back')), immediate: true) : null),
          btn(sel.locked == true ? LucideIcons.lock : LucideIcons.lockOpen, sel.locked == true ? _l.toolbar.unlock : _l.toolbar.lock, on ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, locked: l.locked == true ? null : true, clearLocked: l.locked == true), immediate: true) : null, active: sel.locked == true),
          btn(sel.hidden == true ? LucideIcons.eyeOff : LucideIcons.eye, sel.hidden == true ? _l.toolbar.show : _l.toolbar.hide, on ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, hidden: l.hidden == true ? null : true, clearHidden: l.hidden == true), immediate: true) : null, active: sel.hidden == true),
        ]),
        const SizedBox(height: 4),
        Wrap(spacing: 2, children: [
          btn(LucideIcons.alignStartVertical, _l.toolbar.alignLeft, canAlign ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.alignLayer(l, 'left', _safe), immediate: true) : null),
          btn(LucideIcons.alignCenterVertical, _l.toolbar.alignCenter, canAlign ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.alignLayer(l, 'center', _safe), immediate: true) : null),
          btn(LucideIcons.alignEndVertical, _l.toolbar.alignRight, canAlign ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.alignLayer(l, 'right', _safe), immediate: true) : null),
          btn(LucideIcons.alignStartHorizontal, _l.toolbar.alignTop, canAlign ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.alignLayer(l, 'top', _safe), immediate: true) : null),
          btn(LucideIcons.alignCenterHorizontal, _l.toolbar.alignMiddle, canAlign ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.alignLayer(l, 'middle', _safe), immediate: true) : null),
          btn(LucideIcons.alignEndHorizontal, _l.toolbar.alignBottom, canAlign ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.alignLayer(l, 'bottom', _safe), immediate: true) : null),
        ]),
      ]),
    );
  }

  Widget _buildTextProps(v1api.CoverLayer sel) {
    final c = context.c;
    final t = _l.props.text;
    final st = sel.style ?? const v1api.CoverTextStyle(font: 'cormorant', weight: 400, size: 0.08, color: '#1F1A17', align: 'center', valign: 'middle');
    final currentText = CoverDesignerLogic.resolveText(sel, _cover);
    final fontOpt = _cat.fonts.firstWhere((f) => f.id == st.font, orElse: () => _cat.fonts.first);
    final sizePt = (st.size * _board.w * _lim.ptPerMm);
    final minPt = (_lim.fontSizeMin * _board.w * _lim.ptPerMm).ceilToDouble();
    final maxPt = (_lim.fontSizeMax * _board.w * _lim.ptPerMm).floorToDouble();

    void patchStyle(v1api.CoverTextStyle nextStyle, {bool immediate = false}) {
      _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, style: nextStyle), immediate: immediate);
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionTitle(t.title),
      const SizedBox(height: 8),
      Text(t.content, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
      const SizedBox(height: 6),
      TextFormField(
        key: ValueKey('txt-${sel.id}-${sel.bind ?? 'free'}'),
        initialValue: currentText,
        enabled: _cover.editable,
        maxLength: _lim.text,
        minLines: 2,
        maxLines: 4,
        decoration: const InputDecoration(counterText: ''),
        onChanged: (val) {
          if (sel.bind != null) {
            _pendingBind = sel.bind;
            _pendingBindValue = val;
            _textTimer?.cancel();
            _textTimer = Timer(const Duration(milliseconds: 700), () {
              final b = _pendingBind;
              final v = _pendingBindValue;
              _pendingBind = null;
              _pendingBindValue = null;
              _textTimer = null;
              if (b != null && v != null && mounted) widget.onSaveBookText(b, v);
            });
          } else {
            _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, text: val));
          }
        },
      ),
      if (sel.bind != null) ...[
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: Text(
              switch (sel.bind) {
                'title' => t.linkedTitle,
                'subtitle' => t.linkedSubtitle,
                _ => t.linkedNames,
              },
              style: TextStyle(fontSize: 12, color: c.textMuted),
            ),
          ),
          if (_cover.editable)
            TextButton(
              onPressed: () => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, clearBind: true, text: currentText), immediate: true),
              child: Text(t.unlink, style: TextStyle(fontSize: 12.5, color: c.brand)),
            ),
        ]),
      ],
      const SizedBox(height: 12),

      // Шрифт
      Text(t.font, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
      const SizedBox(height: 6),
      InkWell(
        onTap: _cover.editable ? () => _openFontPicker(st.font, (fontId) => patchStyle(CoverDesignerLogic.copyTextStyle(st, font: fontId), immediate: true)) : null,
        borderRadius: BorderRadius.circular(Cab.ctl),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.ctl), border: Border.all(color: c.border)),
          child: Row(children: [
            Expanded(child: Text(fontOpt.name, style: _previewTextStyle(fontOpt.id, st.weight, 16, c.text))),
            Icon(LucideIcons.chevronDown, size: 18, color: c.textMuted),
          ]),
        ),
      ),

      // Насыщенность и стиль начертания
      if (fontOpt.weights.length > 1) ...[
        const SizedBox(height: 12),
        Text(t.weight, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final w in fontOpt.weights)
            _DesignerChip(
              label: _weightLabel(w),
              on: st.weight == w,
              onTap: _cover.editable ? () => patchStyle(CoverDesignerLogic.copyTextStyle(st, weight: w), immediate: true) : null,
            ),
        ]),
      ],
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        if (fontOpt.italic)
          _DesignerChip(
            label: t.italic,
            on: st.italic == true,
            onTap: _cover.editable ? () => patchStyle(CoverDesignerLogic.copyTextStyle(st, italic: st.italic == true ? null : true, clearItalic: st.italic == true), immediate: true) : null,
          ),
        _DesignerChip(
          label: t.upper,
          on: st.upper == true,
          onTap: _cover.editable ? () => patchStyle(CoverDesignerLogic.copyTextStyle(st, upper: st.upper == true ? null : true, clearUpper: st.upper == true), immediate: true) : null,
        ),
        _DesignerChip(
          label: t.underline,
          on: st.underline == true,
          onTap: _cover.editable ? () => patchStyle(CoverDesignerLogic.copyTextStyle(st, underline: st.underline == true ? null : true, clearUnderline: st.underline == true), immediate: true) : null,
        ),
      ]),

      const SizedBox(height: 14),
      _SliderField(
        label: t.size,
        value: sizePt.clamp(minPt, maxPt),
        min: minPt,
        max: maxPt,
        unit: _l.props.pt,
        decimals: 0,
        enabled: _cover.editable,
        onChanged: (pt) => patchStyle(CoverDesignerLogic.copyTextStyle(st, size: pt / _lim.ptPerMm / _board.w)),
      ),

      const SizedBox(height: 12),
      _ColorPickerRow(
        label: t.color,
        value: st.color,
        swatches: _cat.swatches,
        enabled: _cover.editable,
        onChanged: (hex) => hex != null ? patchStyle(CoverDesignerLogic.copyTextStyle(st, color: hex), immediate: true) : null,
      ),

      const SizedBox(height: 12),
      _SliderField(
        label: t.tracking,
        value: ((st.tracking ?? 0) * 100).clamp(_lim.trackingMin * 100, _lim.trackingMax * 100),
        min: _lim.trackingMin * 100,
        max: _lim.trackingMax * 100,
        unit: _l.props.pct,
        decimals: 0,
        enabled: _cover.editable,
        onChanged: (pct) => patchStyle(CoverDesignerLogic.copyTextStyle(st, tracking: pct == 0 ? null : pct / 100, clearTracking: pct == 0)),
      ),
      const SizedBox(height: 8),
      _SliderField(
        label: t.lineHeight,
        value: (st.lineHeight ?? 1.2).clamp(_lim.lineHeightMin, _lim.lineHeightMax),
        min: _lim.lineHeightMin,
        max: _lim.lineHeightMax,
        unit: '',
        decimals: 2,
        enabled: _cover.editable,
        onChanged: (lh) => patchStyle(CoverDesignerLogic.copyTextStyle(st, lineHeight: lh)),
      ),

      const SizedBox(height: 12),
      _OptionRow(
        label: t.align,
        value: st.align,
        options: _cat.aligns,
        enabled: _cover.editable,
        onChanged: (a) => patchStyle(CoverDesignerLogic.copyTextStyle(st, align: a), immediate: true),
      ),
      const SizedBox(height: 10),
      _OptionRow(
        label: t.valign,
        value: st.valign,
        options: _cat.valigns,
        enabled: _cover.editable,
        onChanged: (v) => patchStyle(CoverDesignerLogic.copyTextStyle(st, valign: v), immediate: true),
      ),

      // Эффекты текста: тень, контур, подложка
      const SizedBox(height: 16),
      _SectionTitle(t.effects),
      const SizedBox(height: 4),
      Text(t.effectsNote, style: TextStyle(fontSize: 12, color: c.textMuted)),
      const SizedBox(height: 8),
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(t.shadow, style: const TextStyle(fontSize: 14)),
        value: st.shadow != null,
        onChanged: _cover.editable
            ? (on) => patchStyle(
                  CoverDesignerLogic.copyTextStyle(
                    st,
                    shadow: on ? const v1api.CoverTextShadow(color: '#000000', x: 0.04, y: 0.05, opacity: 0.5) : null,
                    clearShadow: !on,
                  ),
                  immediate: true,
                )
            : null,
      ),
      if (st.shadow != null) ...[
        _ColorPickerRow(
          label: t.color,
          value: st.shadow!.color,
          swatches: ['#000000', '#FFFFFF', ..._cat.swatches],
          enabled: _cover.editable,
          onChanged: (hex) => hex != null ? patchStyle(CoverDesignerLogic.copyTextStyle(st, shadow: v1api.CoverTextShadow(color: hex, x: st.shadow!.x, y: st.shadow!.y, opacity: st.shadow!.opacity)), immediate: true) : null,
        ),
        _SliderField(
          label: t.shadowX,
          value: (st.shadow!.x * 100).clamp(_lim.shadowMin * 100, _lim.shadowMax * 100),
          min: _lim.shadowMin * 100,
          max: _lim.shadowMax * 100,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (v) => patchStyle(CoverDesignerLogic.copyTextStyle(st, shadow: v1api.CoverTextShadow(color: st.shadow!.color, x: v / 100, y: st.shadow!.y, opacity: st.shadow!.opacity))),
        ),
        _SliderField(
          label: t.shadowY,
          value: (st.shadow!.y * 100).clamp(_lim.shadowMin * 100, _lim.shadowMax * 100),
          min: _lim.shadowMin * 100,
          max: _lim.shadowMax * 100,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (v) => patchStyle(CoverDesignerLogic.copyTextStyle(st, shadow: v1api.CoverTextShadow(color: st.shadow!.color, x: st.shadow!.x, y: v / 100, opacity: st.shadow!.opacity))),
        ),
      ],
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(t.outline, style: const TextStyle(fontSize: 14)),
        value: st.outline != null,
        onChanged: _cover.editable
            ? (on) => patchStyle(
                  CoverDesignerLogic.copyTextStyle(
                    st,
                    outline: on ? const v1api.CoverColorWidth(color: '#FFFFFF', width: 0.04) : null,
                    clearOutline: !on,
                  ),
                  immediate: true,
                )
            : null,
      ),
      if (st.outline != null) ...[
        _ColorPickerRow(
          label: t.color,
          value: st.outline!.color,
          swatches: ['#FFFFFF', '#000000', ..._cat.swatches],
          enabled: _cover.editable,
          onChanged: (hex) => hex != null ? patchStyle(CoverDesignerLogic.copyTextStyle(st, outline: v1api.CoverColorWidth(color: hex, width: st.outline!.width)), immediate: true) : null,
        ),
        _SliderField(
          label: t.outlineWidth,
          value: (st.outline!.width * 100).clamp(0.5, _lim.outlineMax * 100),
          min: 0.5,
          max: _lim.outlineMax * 100,
          unit: _l.props.pct,
          decimals: 1,
          enabled: _cover.editable,
          onChanged: (v) => patchStyle(CoverDesignerLogic.copyTextStyle(st, outline: v1api.CoverColorWidth(color: st.outline!.color, width: v / 100))),
        ),
      ],
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(t.plate, style: const TextStyle(fontSize: 14)),
        value: st.plate != null,
        onChanged: _cover.editable
            ? (on) => patchStyle(
                  CoverDesignerLogic.copyTextStyle(
                    st,
                    plate: on ? const v1api.CoverTextPlate(color: '#FFFFFF', opacity: 0.85, radius: 0.01, pad: 0.4) : null,
                    clearPlate: !on,
                  ),
                  immediate: true,
                )
            : null,
      ),
      if (st.plate != null) ...[
        _ColorPickerRow(
          label: t.color,
          value: st.plate!.color,
          swatches: ['#FFFFFF', '#000000', ..._cat.swatches],
          enabled: _cover.editable,
          onChanged: (hex) => hex != null
              ? patchStyle(
                  CoverDesignerLogic.copyTextStyle(
                    st,
                    plate: v1api.CoverTextPlate(color: hex, opacity: st.plate!.opacity, radius: st.plate!.radius, pad: st.plate!.pad),
                  ),
                  immediate: true,
                )
              : null,
        ),
        _SliderField(
          label: _l.props.opacity,
          value: (st.plate!.opacity * 100).clamp(0, 100),
          min: 0,
          max: 100,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (v) => patchStyle(
            CoverDesignerLogic.copyTextStyle(
              st,
              plate: v1api.CoverTextPlate(color: st.plate!.color, opacity: v / 100, radius: st.plate!.radius, pad: st.plate!.pad),
            ),
          ),
        ),
      ],
    ]);
  }

  Widget _buildImageProps(v1api.CoverLayer sel) {
    final c = context.c;
    final t = _l.props.image;
    final frame = sel.frame ?? const v1api.CoverPhotoFrame(zoom: 1, x: 0.5, y: 0.5);
    v1api.CabPhoto? photo;
    if (sel.photoId != null) {
      for (final p in widget.photos) {
        if (p.id == sel.photoId) {
          photo = p;
          break;
        }
      }
    }
    final dpi = photo != null ? CoverDesignerLogic.effectiveDpi(photo.width, photo.height, sel.w * _board.w, sel.h * _board.h, frame.zoom) : 0;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionTitle(t.title),
      const SizedBox(height: 8),
      if (sel.photoId == null && sel.stock == null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(t.empty, style: TextStyle(fontSize: 13.5, color: c.textMuted))),
      if (dpi > 0 && dpi < _lim.minDpi)
        Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(Cab.ctl)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(LucideIcons.triangleAlert, size: 16, color: c.warn),
            const SizedBox(width: 8),
            Expanded(child: Text(t.lowResPrefix.replaceFirst('0', '$dpi'), style: TextStyle(fontSize: 12.5, color: c.warn))),
          ]),
        ),
      _buildPhotoSourcePicker(
        selectedPhotoId: sel.photoId,
        selectedStock: sel.stock,
        onPick: ({photoId, stock, aspect = 4 / 3}) => _patchLayer(
          sel.id,
          (l) => CoverDesignerLogic.copyLayer(l, photoId: photoId, clearPhotoId: photoId == null, stock: stock, clearStock: stock == null, clearFrame: true),
          immediate: true,
        ),
      ),
      if (sel.photoId != null || sel.stock != null) ...[
        const SizedBox(height: 14),
        _SliderField(
          label: t.zoom,
          value: (frame.zoom * 100).clamp(_lim.frameZoomMin * 100, _lim.frameZoomMax * 100),
          min: _lim.frameZoomMin * 100,
          max: _lim.frameZoomMax * 100,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (pct) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, frame: v1api.CoverPhotoFrame(zoom: pct / 100, x: frame.x, y: frame.y))),
        ),
        _SliderField(
          label: _l.props.x,
          value: (frame.x * 100).clamp(0, 100),
          min: 0,
          max: 100,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (pct) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, frame: v1api.CoverPhotoFrame(zoom: frame.zoom, x: pct / 100, y: frame.y))),
        ),
        _SliderField(
          label: _l.props.y,
          value: (frame.y * 100).clamp(0, 100),
          min: 0,
          max: 100,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (pct) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, frame: v1api.CoverPhotoFrame(zoom: frame.zoom, x: frame.x, y: pct / 100))),
        ),
        if (sel.frame != null && _cover.editable)
          TextButton(
            onPressed: () => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, clearFrame: true), immediate: true),
            child: Text(t.resetFrame),
          ),
      ],
      const SizedBox(height: 10),
      _OptionRow(
        label: t.mask,
        value: sel.mask ?? 'rect',
        options: _cat.imageMasks,
        enabled: _cover.editable,
        onChanged: (m) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, mask: m), immediate: true),
      ),
      if (sel.mask == 'rounded') ...[
        const SizedBox(height: 8),
        _SliderField(
          label: t.radius,
          value: ((sel.radius ?? 0.08) * 100).clamp(0, 50),
          min: 0,
          max: 50,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (v) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, radius: v / 100)),
        ),
      ],
      const SizedBox(height: 8),
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(t.border, style: const TextStyle(fontSize: 14)),
        value: sel.border != null,
        onChanged: _cover.editable
            ? (on) => _patchLayer(
                  sel.id,
                  (l) => CoverDesignerLogic.copyLayer(l, border: on ? const v1api.CoverColorWidth(color: '#FFFFFF', width: 0.01) : null, clearBorder: !on),
                  immediate: true,
                )
            : null,
      ),
      if (sel.border != null) ...[
        _ColorPickerRow(
          label: _l.props.text.color,
          value: sel.border!.color,
          swatches: ['#FFFFFF', ..._cat.swatches],
          enabled: _cover.editable,
          onChanged: (hex) => hex != null ? _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, border: v1api.CoverColorWidth(color: hex, width: sel.border!.width)), immediate: true) : null,
        ),
        _SliderField(
          label: t.borderWidth,
          value: (sel.border!.width * _board.w).clamp(0.2, _lim.borderMax * _board.w),
          min: 0.2,
          max: _lim.borderMax * _board.w,
          unit: _l.props.mm,
          decimals: 1,
          enabled: _cover.editable,
          onChanged: (mm) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, border: v1api.CoverColorWidth(color: sel.border!.color, width: mm / _board.w))),
        ),
      ],
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(t.mono, style: const TextStyle(fontSize: 14)),
        value: sel.mono == true,
        onChanged: _cover.editable ? (on) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, mono: on ? true : null, clearMono: !on), immediate: true) : null,
      ),
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(t.overlay, style: const TextStyle(fontSize: 14)),
        value: sel.overlay != null,
        onChanged: _cover.editable
            ? (on) => _patchLayer(
                  sel.id,
                  (l) => CoverDesignerLogic.copyLayer(l, overlay: on ? const v1api.CoverColorOpacity(color: '#000000', opacity: 0.3) : null, clearOverlay: !on),
                  immediate: true,
                )
            : null,
      ),
      if (sel.overlay != null) ...[
        _ColorPickerRow(
          label: _l.props.text.color,
          value: sel.overlay!.color,
          swatches: ['#000000', '#FFFFFF', ..._cat.swatches],
          enabled: _cover.editable,
          onChanged: (hex) => hex != null ? _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, overlay: v1api.CoverColorOpacity(color: hex, opacity: sel.overlay!.opacity)), immediate: true) : null,
        ),
        _SliderField(
          label: _l.props.opacity,
          value: (sel.overlay!.opacity * 100).clamp(0, 100),
          min: 0,
          max: 100,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (v) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, overlay: v1api.CoverColorOpacity(color: sel.overlay!.color, opacity: v / 100))),
        ),
      ],
    ]);
  }

  Widget _buildShapeProps(v1api.CoverLayer sel) {
    final c = context.c;
    final t = _l.props.shape;
    final currentShape = _cat.shapes.firstWhere((s) => s.id == (sel.shape ?? 'rect'), orElse: () => _cat.shapes.first);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionTitle(t.title),
      const SizedBox(height: 8),
      Text(t.kind, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
      const SizedBox(height: 6),
      GridView.count(
        crossAxisCount: 4,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        children: [
          for (final s in _cat.shapes)
            InkWell(
              onTap: _cover.editable
                  ? () => _patchLayer(
                        sel.id,
                        (l) => CoverDesignerLogic.copyLayer(
                          l,
                          shape: s.id,
                          stroke: s.outlineOnly ? (l.stroke ?? l.fill ?? '#1F1A17') : l.stroke,
                          strokeWidth: s.outlineOnly ? (l.strokeWidth ?? 0.004) : l.strokeWidth,
                          fill: !s.outlineOnly ? (l.fill ?? l.stroke ?? '#B8925A') : l.fill,
                        ),
                        immediate: true,
                      )
                  : null,
              borderRadius: BorderRadius.circular(Cab.ctl),
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: c.surfaceRaised,
                  borderRadius: BorderRadius.circular(Cab.ctl),
                  border: Border.all(color: sel.shape == s.id ? c.brand : c.border, width: sel.shape == s.id ? 2 : 1),
                ),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Expanded(child: SvgPicture.string(s.svg, fit: BoxFit.contain)),
                  Text(s.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, color: c.textMuted)),
                ]),
              ),
            ),
        ],
      ),
      if (!currentShape.outlineOnly) ...[
        const SizedBox(height: 12),
        _ColorPickerRow(
          label: t.fill,
          value: sel.fill,
          swatches: _cat.swatches,
          allowNone: true,
          noneLabel: _l.props.none,
          enabled: _cover.editable,
          onChanged: (hex) => _patchLayer(
            sel.id,
            (l) => CoverDesignerLogic.copyLayer(l, fill: hex, clearFill: hex == null, clearGradient: hex == null),
            immediate: true,
          ),
        ),
        if (sel.fill != null) ...[
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: Text(t.gradient, style: const TextStyle(fontSize: 14)),
            value: sel.gradient != null,
            onChanged: _cover.editable
                ? (on) => _patchLayer(
                      sel.id,
                      (l) => CoverDesignerLogic.copyLayer(l, gradient: on ? const v1api.CoverShapeGradient(to: '#FFFFFF', angle: 90) : null, clearGradient: !on),
                      immediate: true,
                    )
                : null,
          ),
          if (sel.gradient != null) ...[
            _ColorPickerRow(
              label: t.gradientTo,
              value: sel.gradient!.to,
              swatches: _cat.swatches,
              enabled: _cover.editable,
              onChanged: (hex) => hex != null ? _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, gradient: v1api.CoverShapeGradient(to: hex, angle: sel.gradient!.angle)), immediate: true) : null,
            ),
            _SliderField(
              label: t.angle,
              value: sel.gradient!.angle.clamp(0, 360),
              min: 0,
              max: 360,
              unit: _l.props.deg,
              decimals: 0,
              enabled: _cover.editable,
              onChanged: (a) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, gradient: v1api.CoverShapeGradient(to: sel.gradient!.to, angle: a))),
            ),
          ],
        ],
      ],
      const SizedBox(height: 12),
      _ColorPickerRow(
        label: t.stroke,
        value: sel.stroke,
        swatches: _cat.swatches,
        allowNone: !currentShape.outlineOnly,
        noneLabel: _l.props.none,
        enabled: _cover.editable,
        onChanged: (hex) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, stroke: hex, clearStroke: hex == null), immediate: true),
      ),
      if (sel.stroke != null || currentShape.outlineOnly) ...[
        const SizedBox(height: 8),
        _SliderField(
          label: t.strokeWidth,
          value: ((sel.strokeWidth ?? 0.004) * _board.w).clamp(0.1, _lim.strokeMax * _board.w),
          min: 0.1,
          max: _lim.strokeMax * _board.w,
          unit: _l.props.mm,
          decimals: 1,
          enabled: _cover.editable,
          onChanged: (mm) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, strokeWidth: mm / _board.w)),
        ),
      ],
      if (currentShape.supportsRadius) ...[
        const SizedBox(height: 8),
        _SliderField(
          label: t.radius,
          value: ((sel.radius ?? 0) * 100).clamp(0, 50),
          min: 0,
          max: 50,
          unit: _l.props.pct,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (pct) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, radius: pct == 0 ? null : pct / 100, clearRadius: pct == 0)),
        ),
      ],
    ]);
  }

  Widget _buildDecorProps(v1api.CoverLayer sel) {
    final c = context.c;
    final t = _l.props.decor;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionTitle(t.title),
      const SizedBox(height: 8),
      Text(t.motif, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
      const SizedBox(height: 6),
      GridView.count(
        crossAxisCount: 5,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        children: [
          for (final d in _cat.decors)
            Tooltip(
              message: d.label,
              child: InkWell(
                onTap: _cover.editable ? () => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, motif: d.id), immediate: true) : null,
                borderRadius: BorderRadius.circular(Cab.ctl),
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: c.surfaceRaised,
                    borderRadius: BorderRadius.circular(Cab.ctl),
                    border: Border.all(color: sel.motif == d.id ? c.brand : c.border, width: sel.motif == d.id ? 2 : 1),
                  ),
                  child: SvgPicture.string(d.svg, fit: BoxFit.contain),
                ),
              ),
            ),
        ],
      ),
      const SizedBox(height: 12),
      _ColorPickerRow(
        label: t.color,
        value: sel.color ?? '#B8925A',
        swatches: _cat.swatches,
        enabled: _cover.editable,
        onChanged: (hex) => hex != null ? _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, color: hex), immediate: true) : null,
      ),
      if (sel.motif == 'art') ...[
        const SizedBox(height: 10),
        _ColorPickerRow(
          label: t.accent,
          value: sel.accent ?? sel.color ?? '#B8925A',
          swatches: _cat.swatches,
          enabled: _cover.editable,
          onChanged: (hex) => hex != null ? _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, accent: hex), immediate: true) : null,
        ),
        const SizedBox(height: 6),
        Text(t.artNote, style: TextStyle(fontSize: 12, color: c.textMuted)),
      ],
    ]);
  }

  Widget _buildGeometryProps(v1api.CoverLayer sel) {
    final p = _l.props;
    final b = _lim.bleed;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionTitle(p.position),
      const SizedBox(height: 8),
      _SliderField(
        label: p.opacity,
        value: ((sel.opacity ?? 1) * 100).clamp(0, 100),
        min: 0,
        max: 100,
        unit: p.pct,
        decimals: 0,
        enabled: _cover.editable,
        onChanged: (pct) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, opacity: pct >= 99.5 ? null : pct / 100, clearOpacity: pct >= 99.5)),
      ),
      _SliderField(
        label: p.rotate,
        value: (sel.rotate ?? 0).clamp(-180, 180),
        min: -180,
        max: 180,
        unit: p.deg,
        decimals: 0,
        enabled: _cover.editable && sel.locked != true,
        onChanged: (deg) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, rotate: deg.round() == 0 ? null : deg.roundToDouble(), clearRotate: deg.round() == 0)),
      ),
      _SliderField(
        label: p.x,
        value: (sel.x * _board.w).clamp(-b * _board.w, (1 + b) * _board.w),
        min: -b * _board.w,
        max: (1 + b) * _board.w,
        unit: p.mm,
        decimals: 1,
        enabled: _cover.editable && sel.locked != true,
        onChanged: (mm) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, x: mm / _board.w)),
      ),
      _SliderField(
        label: p.y,
        value: (sel.y * _board.h).clamp(-b * _board.h, (1 + b) * _board.h),
        min: -b * _board.h,
        max: (1 + b) * _board.h,
        unit: p.mm,
        decimals: 1,
        enabled: _cover.editable && sel.locked != true,
        onChanged: (mm) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, y: mm / _board.h)),
      ),
      _SliderField(
        label: p.w,
        value: (sel.w * _board.w).clamp(_lim.minSize * _board.w, _lim.maxSize * _board.w),
        min: _lim.minSize * _board.w,
        max: _lim.maxSize * _board.w,
        unit: p.mm,
        decimals: 1,
        enabled: _cover.editable && sel.locked != true,
        onChanged: (mm) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, w: mm / _board.w)),
      ),
      _SliderField(
        label: p.h,
        value: (sel.h * _board.h).clamp(_lim.minSize * _board.h, _lim.maxSize * _board.h),
        min: _lim.minSize * _board.h,
        max: _lim.maxSize * _board.h,
        unit: p.mm,
        decimals: 1,
        enabled: _cover.editable && sel.locked != true,
        onChanged: (mm) => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, h: mm / _board.h)),
      ),
      if ((sel.kind == 'image' || sel.kind == 'shape') && _cover.editable && sel.locked != true) ...[
        const SizedBox(height: 8),
        CabinetButton(
          label: p.fullCover,
          icon: LucideIcons.expand,
          kind: CabBtn.outline,
          large: false,
          onPressed: () => _patchLayer(sel.id, (l) => CoverDesignerLogic.copyLayer(l, x: -0.03, y: -0.03, w: 1.06, h: 1.06, clearRotate: true), immediate: true),
        ),
      ],
    ]);
  }

  // ─── Панель «Слои» ──────────────────────────────────────────────────────────

  Widget _buildLayersPanel() {
    final c = context.c;
    final tl = _l.layers;
    if (_design.layers.isEmpty) {
      return Text(tl.empty, style: TextStyle(fontSize: 14, color: c.textMuted));
    }
    // Верхний слой — первым в списке, как в LayersPanel.tsx.
    final reversed = _design.layers.reversed.toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(tl.hint, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      const SizedBox(height: 10),
      for (final l in reversed)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: InkWell(
            onTap: () => setState(() => _selectedId = l.id),
            borderRadius: BorderRadius.circular(Cab.ctl),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: _selectedId == l.id ? c.bubbleOut : c.surfaceRaised,
                borderRadius: BorderRadius.circular(Cab.ctl),
                border: Border.all(color: _selectedId == l.id ? c.brand : c.border),
              ),
              child: Row(children: [
                Icon(_layerIcon(l.kind), size: 17, color: _selectedId == l.id ? c.brand : c.textMuted),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(
                      _layerTitle(l),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: l.hidden == true ? c.textFaint : c.text),
                    ),
                    Text(_layerSubtitle(l), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: c.textMuted)),
                  ]),
                ),
                if (_cover.editable) ...[
                  IconButton(
                    icon: const Icon(LucideIcons.pencil, size: 15),
                    tooltip: tl.rename,
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _renameLayer(l),
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.arrowUp, size: 16),
                    tooltip: _l.toolbar.forward,
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _commit(v1api.CoverDesign(v: 1, background: _design.background, layers: CoverDesignerLogic.moveZ(_design.layers, l.id, 'up')), immediate: true),
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.arrowDown, size: 16),
                    tooltip: _l.toolbar.backward,
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _commit(v1api.CoverDesign(v: 1, background: _design.background, layers: CoverDesignerLogic.moveZ(_design.layers, l.id, 'down')), immediate: true),
                  ),
                  IconButton(
                    icon: Icon(l.hidden == true ? LucideIcons.eyeOff : LucideIcons.eye, size: 16),
                    tooltip: l.hidden == true ? _l.toolbar.show : _l.toolbar.hide,
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _patchLayer(l.id, (x) => CoverDesignerLogic.copyLayer(x, hidden: x.hidden == true ? null : true, clearHidden: x.hidden == true), immediate: true),
                  ),
                ],
              ]),
            ),
          ),
        ),
    ]);
  }

  // ─── Панель «Макеты» ────────────────────────────────────────────────────────

  Widget _buildLayoutsPanel() {
    final c = context.c;
    final tl = _l.layouts;
    if (_isBack) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _SectionTitle(tl.backTitle),
        const SizedBox(height: 6),
        Text(tl.backText, style: TextStyle(fontSize: 13, color: c.textMuted)),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (_, box) {
          const gap = 10.0;
          final w = (box.maxWidth - gap) / 2;
          return Wrap(spacing: gap, runSpacing: gap, children: [
            for (final b in widget.view.backLayouts)
              SizedBox(
                width: w,
                child: InkWell(
                  onTap: _cover.editable ? () => widget.onApplyLayout(backLayout: b.id) : null,
                  borderRadius: BorderRadius.circular(Cab.ctl),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.ctl), border: Border.all(color: c.border)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(b.name, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(b.hint, maxLines: 2, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
                    ]),
                  ),
                ),
              ),
          ]);
        }),
      ]);
    }

    final q = _layoutQuery.trim().toLowerCase();
    final shown = _cat.layouts.where((l) {
      if (_layoutGenre != 'all' && l.genre != _layoutGenre) return false;
      if (q.isEmpty) return true;
      return '${l.name} ${l.description} ${_genreLabel(l.genre)}'.toLowerCase().contains(q);
    }).toList();

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionTitle(tl.title),
      const SizedBox(height: 4),
      Text(tl.text, style: TextStyle(fontSize: 13, color: c.textMuted)),
      const SizedBox(height: 10),
      TextField(
        decoration: InputDecoration(
          hintText: tl.search,
          prefixIcon: const Icon(LucideIcons.search, size: 18),
        ),
        onChanged: (v) => setState(() => _layoutQuery = v),
      ),
      const SizedBox(height: 10),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final g in _cat.layoutGenres)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _DesignerChip(label: g.label, on: _layoutGenre == g.id, onTap: () => setState(() => _layoutGenre = g.id)),
            ),
        ]),
      ),
      if (widget.photos.length < 5) ...[
        const SizedBox(height: 8),
        Text(tl.photosNote, style: TextStyle(fontSize: 12, color: c.textMuted)),
      ],
      const SizedBox(height: 12),
      if (shown.isEmpty)
        Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Center(child: Text(tl.empty, style: TextStyle(fontSize: 14, color: c.textMuted))))
      else
        for (final l in shown)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              onTap: _cover.editable ? () => widget.onApplyLayout(layoutId: l.id) : null,
              borderRadius: BorderRadius.circular(Cab.ctl),
              child: Container(
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.ctl), border: Border.all(color: c.border)),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Text(l.name, style: AppText.serif(context, size: 18, weight: FontWeight.w600)),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(999)),
                          child: Text(_genreLabel(l.genre), style: TextStyle(fontSize: 11, color: c.textMuted)),
                        ),
                      ]),
                      const SizedBox(height: 3),
                      Text(l.description, style: TextStyle(fontSize: 12.5, height: 1.35, color: c.textMuted)),
                    ]),
                  ),
                  const SizedBox(width: 8),
                  Icon(LucideIcons.chevronRight, size: 18, color: c.brand),
                ]),
              ),
            ),
          ),
    ]);
  }

  // ─── Панель «Фон» ───────────────────────────────────────────────────────────

  Widget _buildBackgroundPanel() {
    final c = context.c;
    final tb = _l.props.background;
    final bg = _design.background;
    final swatches = _isBack ? _cat.backSwatches : _cat.swatches;
    final base = bg.kind == 'color'
        ? (bg.color ?? '#F4EEE6')
        : bg.kind == 'gradient'
            ? (bg.from ?? '#F4EEE6')
            : (swatches.isNotEmpty ? swatches.first : '#F4EEE6');

    void setBg(v1api.CoverBackground next, {bool immediate = false}) {
      _commit(v1api.CoverDesign(v: 1, background: next, layers: _design.layers), immediate: immediate);
    }

    final options = [
      for (final o in _cat.bgKinds) v1api.CoverOption(id: o.id, label: _isBack && o.id == 'template' ? tb.likeFront : o.label),
    ];

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionTitle(_isBack ? tb.titleBack : tb.title),
      const SizedBox(height: 8),
      _OptionRow(
        label: '',
        value: bg.kind,
        options: options,
        enabled: _cover.editable,
        onChanged: (kind) {
          if (kind == 'template') {
            setBg(const v1api.CoverBackground(kind: 'template'), immediate: true);
          } else if (kind == 'color') {
            setBg(v1api.CoverBackground(kind: 'color', color: base), immediate: true);
          } else {
            setBg(
              v1api.CoverBackground(
                kind: 'gradient',
                from: base,
                to: bg.kind == 'gradient' ? (bg.to ?? '#D9C7B3') : '#D9C7B3',
                angle: bg.kind == 'gradient' ? (bg.angle ?? 120) : 120,
              ),
              immediate: true,
            );
          }
        },
      ),
      const SizedBox(height: 12),
      if (bg.kind == 'template') ...[
        Text(_isBack ? tb.likeFrontNote : tb.templateNote, style: TextStyle(fontSize: 13, color: c.textMuted)),
        if (!_isBack) ...[
          const SizedBox(height: 12),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _cover.lines,
            onChanged: _cover.editable ? (v) => widget.onToggleCoverLines(v ?? true) : null,
            title: Text(widget.view.labels.text.coverLines, style: const TextStyle(fontSize: 14.5)),
            subtitle: Text(widget.view.labels.text.coverLinesHint, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
          ),
        ],
      ],
      if (bg.kind == 'color')
        _ColorPickerRow(
          label: tb.color,
          value: bg.color ?? '#F4EEE6',
          swatches: [...swatches, '#F4EEE6', '#141414', '#E9DCCB'],
          enabled: _cover.editable,
          onChanged: (hex) => hex != null ? setBg(v1api.CoverBackground(kind: 'color', color: hex), immediate: true) : null,
        ),
      if (bg.kind == 'gradient') ...[
        _ColorPickerRow(
          label: tb.fromColor,
          value: bg.from ?? '#F4EEE6',
          swatches: swatches,
          enabled: _cover.editable,
          onChanged: (hex) => hex != null ? setBg(v1api.CoverBackground(kind: 'gradient', from: hex, to: bg.to ?? '#D9C7B3', angle: bg.angle ?? 120), immediate: true) : null,
        ),
        const SizedBox(height: 10),
        _ColorPickerRow(
          label: tb.toColor,
          value: bg.to ?? '#D9C7B3',
          swatches: swatches,
          enabled: _cover.editable,
          onChanged: (hex) => hex != null ? setBg(v1api.CoverBackground(kind: 'gradient', from: bg.from ?? '#F4EEE6', to: hex, angle: bg.angle ?? 120), immediate: true) : null,
        ),
        const SizedBox(height: 10),
        _SliderField(
          label: tb.angle,
          value: (bg.angle ?? 120).clamp(0, 360),
          min: 0,
          max: 360,
          unit: _l.props.deg,
          decimals: 0,
          enabled: _cover.editable,
          onChanged: (a) => setBg(v1api.CoverBackground(kind: 'gradient', from: bg.from ?? '#F4EEE6', to: bg.to ?? '#D9C7B3', angle: a)),
        ),
      ],
    ]);
  }

  // ─── Модальный выбор шрифта ─────────────────────────────────────────────────

  Future<void> _openFontPicker(String currentFont, ValueChanged<String> onPick) async {
    var cat = 'all';
    var query = '';
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final c = ctx.c;
          final q = query.trim().toLowerCase();
          final list = _cat.fonts.where((f) {
            if (cat != 'all' && f.category != cat) return false;
            if (q.isEmpty) return true;
            return f.name.toLowerCase().contains(q);
          }).toList();
          return DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.72,
            minChildSize: 0.45,
            maxChildSize: 0.92,
            builder: (_, ctrl) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Center(child: Container(width: 36, height: 4, decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 12),
                Text(_l.props.text.font, style: AppText.serif(ctx, size: 22, weight: FontWeight.w500)),
                const SizedBox(height: 10),
                TextField(
                  decoration: InputDecoration(hintText: _l.props.text.fontSearch, prefixIcon: const Icon(LucideIcons.search, size: 18)),
                  onChanged: (v) => setSheet(() => query = v),
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (final fc in _cat.fontCategories)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: _DesignerChip(label: fc.label, on: cat == fc.id, onTap: () => setSheet(() => cat = fc.id)),
                      ),
                  ]),
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: list.isEmpty
                      ? Center(child: Text(_l.props.text.fontEmpty, style: TextStyle(color: c.textMuted)))
                      : ListView.separated(
                          controller: ctrl,
                          itemCount: list.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 6),
                          itemBuilder: (_, i) {
                            final f = list[i];
                            final selected = f.id == currentFont;
                            return InkWell(
                              onTap: () {
                                Navigator.pop(ctx);
                                onPick(f.id);
                              },
                              borderRadius: BorderRadius.circular(Cab.ctl),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                decoration: BoxDecoration(
                                  color: selected ? c.bubbleOut : c.surfaceRaised,
                                  borderRadius: BorderRadius.circular(Cab.ctl),
                                  border: Border.all(color: selected ? c.brand : c.border),
                                ),
                                child: Row(children: [
                                  Expanded(child: Text(f.name, style: _previewTextStyle(f.id, 500, 17, c.text))),
                                  if (selected) Icon(LucideIcons.check, size: 18, color: c.brand),
                                ]),
                              ),
                            );
                          },
                        ),
                ),
              ]),
            ),
          );
        },
      ),
    );
  }

  // ─── Хелперы подписей (только из каталога сервера) ──────────────────────────

  String _weightLabel(int weight) {
    for (final w in _cat.weightLabels) {
      if (w.weight == weight) return w.label;
    }
    return '$weight';
  }

  String _genreLabel(String genre) {
    for (final g in _cat.layoutGenres) {
      if (g.id == genre) return g.label;
    }
    return genre;
  }

  IconData _layerIcon(String kind) => switch (kind) {
        'text' => LucideIcons.type,
        'image' => LucideIcons.image,
        'shape' => LucideIcons.shapes,
        _ => LucideIcons.sparkles,
      };

  String _layerTitle(v1api.CoverLayer l) {
    if (l.name != null && l.name!.trim().isNotEmpty) return l.name!;
    if (l.kind == 'text') {
      final txt = CoverDesignerLogic.resolveText(l, _cover).replaceAll(RegExp(r'\s+'), ' ').trim();
      if (txt.isNotEmpty) return txt;
    }
    if (l.kind == 'shape') {
      for (final s in _cat.shapes) {
        if (s.id == l.shape) return s.label;
      }
    }
    if (l.kind == 'decor') {
      for (final d in _cat.decors) {
        if (d.id == l.motif) return d.label;
      }
    }
    return switch (l.kind) {
      'text' => _l.layers.kindText,
      'image' => _l.layers.kindImage,
      'shape' => _l.layers.kindShape,
      _ => _l.layers.kindDecor,
    };
  }

  String _layerSubtitle(v1api.CoverLayer l) {
    final kindLabel = switch (l.kind) {
      'text' => _l.layers.kindText,
      'image' => _l.layers.kindImage,
      'shape' => _l.layers.kindShape,
      _ => _l.layers.kindDecor,
    };
    if (l.kind == 'text' && l.bind != null) {
      final bindLabel = switch (l.bind) {
        'title' => _l.layers.bindTitle,
        'subtitle' => _l.layers.bindSubtitle,
        _ => _l.layers.bindNames,
      };
      return '$kindLabel · $bindLabel';
    }
    return kindLabel;
  }

  TextStyle _previewTextStyle(String fontId, int weight, double size, Color color, {double? tracking, bool italic = false, bool underline = false}) {
    final fontOpt = _cat.fonts.cast<v1api.CoverFontOption?>().firstWhere((f) => f?.id == fontId, orElse: () => null);
    final isSans = fontOpt?.category == 'sans' || fontOpt?.category == 'kids';
    final isScript = fontOpt?.category == 'script';
    return TextStyle(
      fontFamily: isSans ? 'Onest' : 'Cormorant',
      fontSize: size,
      fontWeight: _toFontWeight(weight),
      fontStyle: italic || isScript ? FontStyle.italic : FontStyle.normal,
      decoration: underline ? TextDecoration.underline : TextDecoration.none,
      letterSpacing: tracking != null ? tracking * size : null,
      color: color,
    );
  }
}

FontWeight _toFontWeight(int w) {
  if (w <= 300) return FontWeight.w300;
  if (w <= 400) return FontWeight.w400;
  if (w <= 500) return FontWeight.w500;
  if (w <= 600) return FontWeight.w600;
  if (w <= 700) return FontWeight.w700;
  return FontWeight.w800;
}

// ─── Интерактивный холст конструктора ─────────────────────────────────────────

class _DesignerCanvas extends StatefulWidget {
  const _DesignerCanvas({
    required this.cover,
    required this.design,
    required this.catalog,
    required this.side,
    required this.board,
    required this.safe,
    required this.selectedId,
    required this.showSafe,
    required this.showGrid,
    required this.editable,
    required this.onSelect,
    required this.onDragStart,
    required this.onMoveLayer,
    required this.onResizeLayer,
  });

  final v1api.Cover cover;
  final v1api.CoverDesign design;
  final v1api.CoverDesignerCatalog catalog;
  final String side;
  final v1api.CoverBoardSize board;
  final v1api.CoverRect safe;
  final String? selectedId;
  final bool showSafe;
  final bool showGrid;
  final bool editable;
  final ValueChanged<String?> onSelect;
  final VoidCallback onDragStart;
  final void Function(String id, double x, double y) onMoveLayer;
  final void Function(String id, double w, double h) onResizeLayer;

  @override
  State<_DesignerCanvas> createState() => _DesignerCanvasState();
}

class _DesignerCanvasState extends State<_DesignerCanvas> {
  double _startX = 0;
  double _startY = 0;
  double _startW = 0;
  double _startH = 0;
  Offset _dragAccum = Offset.zero;

  bool get _isBack => widget.side == 'back';

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final ratio = widget.board.w / widget.board.h;
    return AspectRatio(
      aspectRatio: ratio,
      child: LayoutBuilder(builder: (context, box) {
        final cw = box.maxWidth;
        final ch = box.maxHeight;
        return GestureDetector(
          onTap: () => widget.onSelect(null),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(4),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 18, offset: const Offset(0, 8))],
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(children: [
              // 1. Фон холста
              Positioned.fill(child: _buildBackground()),

              // 2. Повторяемые слои лица на обороте (под слоями оборота, если фон «как спереди»)
              if (_isBack && widget.design.background.kind == 'template' && (widget.cover.backUnderlay?.isNotEmpty ?? false))
                for (final u in widget.cover.backUnderlay!)
                  if (u.hidden != true) _buildLayerBox(u, cw, ch, interactive: false),

              // 3. Слои конструктора
              for (final l in widget.design.layers)
                if (l.hidden != true) _buildLayerBox(l, cw, ch, interactive: true),

              // 4. Сетка
              if (widget.showGrid) Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: _GridPainter()))),

              // 5. Безопасная зона
              if (widget.showSafe)
                Positioned.fill(
                  child: IgnorePointer(
                    child: CustomPaint(painter: _SafeAreaPainter(safe: widget.safe, color: c.brand)),
                  ),
                ),
            ]),
          ),
        );
      }),
    );
  }

  Widget _buildBackground() {
    final bg = widget.design.background;
    if (bg.kind == 'color') {
      return ColoredBox(color: CoverDesignerLogic.parseHex(bg.color, fallback: const Color(0xFFF4EEE6)));
    }
    if (bg.kind == 'gradient') {
      final angle = bg.angle ?? 90;
      return DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: CoverDesignerLogic.gradientBegin(angle),
            end: CoverDesignerLogic.gradientEnd(angle),
            colors: [
              CoverDesignerLogic.parseHex(bg.from, fallback: const Color(0xFFF4EEE6)),
              CoverDesignerLogic.parseHex(bg.to, fallback: const Color(0xFFD9C7B3)),
            ],
          ),
        ),
      );
    }
    // kind == 'template'
    if (_isBack) {
      final frontBg = widget.cover.coverDesign?.background;
      if (frontBg != null && frontBg.kind == 'color') {
        return ColoredBox(color: CoverDesignerLogic.parseHex(frontBg.color, fallback: const Color(0xFFF4EEE6)));
      }
      if (frontBg != null && frontBg.kind == 'gradient') {
        final mirrored = CoverDesignerLogic.mirrorAngle(frontBg.angle ?? 90);
        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: CoverDesignerLogic.gradientBegin(mirrored),
              end: CoverDesignerLogic.gradientEnd(mirrored),
              colors: [
                CoverDesignerLogic.parseHex(frontBg.from, fallback: const Color(0xFFF4EEE6)),
                CoverDesignerLogic.parseHex(frontBg.to, fallback: const Color(0xFFD9C7B3)),
              ],
            ),
          ),
        );
      }
      final url = widget.cover.backTemplateBgUrl ?? widget.cover.backImageUrl;
      return CoverArt(url: url);
    }
    final url = widget.cover.templateBgUrl ?? widget.cover.imageUrl;
    return CoverArt(url: url);
  }

  Widget _buildLayerBox(v1api.CoverLayer l, double cw, double ch, {required bool interactive}) {
    final c = context.c;
    final selected = interactive && widget.selectedId == l.id;
    final locked = l.locked == true;
    final lim = widget.catalog.limits;

    Widget content = _renderLayerContent(l, cw, ch);
    if ((l.opacity ?? 1) < 1) {
      content = Opacity(opacity: (l.opacity ?? 1).clamp(0, 1), child: content);
    }

    if (selected) {
      content = Stack(clipBehavior: Clip.none, children: [
        Positioned.fill(child: content),
        Positioned.fill(
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(border: Border.all(color: c.brand, width: 1.5)),
            ),
          ),
        ),
        if (widget.editable && !locked)
          Positioned(
            right: -7,
            bottom: -7,
            child: GestureDetector(
              onPanStart: (_) {
                _startW = l.w;
                _startH = l.h;
                _dragAccum = Offset.zero;
                widget.onDragStart();
              },
              onPanUpdate: (d) {
                _dragAccum += d.delta;
                final nw = (_startW + _dragAccum.dx / cw).clamp(lim.minSize, lim.maxSize);
                final nh = (_startH + _dragAccum.dy / ch).clamp(lim.minSize, lim.maxSize);
                widget.onResizeLayer(l.id, nw, nh);
              },
              child: Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: c.brand, width: 2),
                ),
              ),
            ),
          ),
      ]);
    }

    if ((l.rotate ?? 0) != 0) {
      content = Transform.rotate(angle: (l.rotate ?? 0) * math.pi / 180, child: content);
    }

    if (interactive) {
      content = GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => widget.onSelect(l.id),
        onPanStart: widget.editable && !locked
            ? (_) {
                widget.onSelect(l.id);
                _startX = l.x;
                _startY = l.y;
                _dragAccum = Offset.zero;
                widget.onDragStart();
              }
            : null,
        onPanUpdate: widget.editable && !locked
            ? (d) {
                _dragAccum += d.delta;
                var nx = (_startX + _dragAccum.dx / cw).clamp(-lim.bleed, 1 + lim.bleed);
                var ny = (_startY + _dragAccum.dy / ch).clamp(-lim.bleed, 1 + lim.bleed);
                // Мягкое прилипание к центру крышки
                if ((nx + l.w / 2 - 0.5).abs() < 0.015) nx = 0.5 - l.w / 2;
                if ((ny + l.h / 2 - 0.5).abs() < 0.015) ny = 0.5 - l.h / 2;
                widget.onMoveLayer(l.id, nx, ny);
              }
            : null,
        child: content,
      );
    }

    return Positioned(
      left: l.x * cw,
      top: l.y * ch,
      width: l.w * cw,
      height: l.h * ch,
      child: content,
    );
  }

  Widget _renderLayerContent(v1api.CoverLayer l, double cw, double ch) {
    final c = context.c;
    if (l.kind == 'text') {
      final st = l.style ?? const v1api.CoverTextStyle(font: 'cormorant', weight: 400, size: 0.08, color: '#1F1A17', align: 'center', valign: 'middle');
      final raw = CoverDesignerLogic.resolveText(l, widget.cover);
      final isPlaceholder = raw.trim().isEmpty;
      final shown = isPlaceholder
          ? switch (l.bind) {
              'title' => widget.catalog.labels.canvas.placeholderTitle,
              'subtitle' => widget.catalog.labels.canvas.placeholderSubtitle,
              'names' => widget.catalog.labels.canvas.placeholderNames,
              _ => widget.catalog.labels.canvas.placeholderText,
            }
          : raw;
      final display = st.upper == true ? shown.toUpperCase() : shown;
      final fontSize = (st.size * cw).clamp(6.0, 200.0);
      final textColor = CoverDesignerLogic.parseHex(st.color).withValues(alpha: isPlaceholder ? 0.35 : 1.0);
      final fontOpt = widget.catalog.fonts.cast<v1api.CoverFontOption?>().firstWhere((f) => f?.id == st.font, orElse: () => null);
      final isSans = fontOpt?.category == 'sans' || fontOpt?.category == 'kids';
      final isScript = fontOpt?.category == 'script';

      final shadows = <Shadow>[];
      if (st.shadow != null) {
        shadows.add(Shadow(
          color: CoverDesignerLogic.parseHex(st.shadow!.color).withValues(alpha: st.shadow!.opacity ?? 1),
          offset: Offset(st.shadow!.x * fontSize, st.shadow!.y * fontSize),
        ));
      }
      if (st.outline != null && st.outline!.width > 0) {
        final ow = st.outline!.width * fontSize;
        final oc = CoverDesignerLogic.parseHex(st.outline!.color);
        for (var i = 0; i < 8; i++) {
          final a = i * math.pi / 4;
          shadows.add(Shadow(color: oc, offset: Offset(math.cos(a) * ow, math.sin(a) * ow)));
        }
      }

      final align = switch (st.align) {
        'left' => TextAlign.left,
        'right' => TextAlign.right,
        _ => TextAlign.center,
      };
      final alignment = Alignment(
        st.align == 'left' ? -1 : (st.align == 'right' ? 1 : 0),
        st.valign == 'top' ? -1 : (st.valign == 'bottom' ? 1 : 0),
      );

      final pad = (st.plate?.pad ?? 0) * fontSize;
      return Container(
        alignment: alignment,
        padding: EdgeInsets.all(pad),
        decoration: st.plate != null
            ? BoxDecoration(
                color: CoverDesignerLogic.parseHex(st.plate!.color).withValues(alpha: st.plate!.opacity),
                borderRadius: BorderRadius.circular((st.plate!.radius ?? 0) * cw),
              )
            : null,
        child: Text(
          display,
          textAlign: align,
          style: TextStyle(
            fontFamily: isSans ? 'Onest' : 'Cormorant',
            fontSize: fontSize,
            height: st.lineHeight ?? 1.2,
            fontWeight: _toFontWeight(st.weight),
            fontStyle: st.italic == true || isScript ? FontStyle.italic : FontStyle.normal,
            decoration: st.underline == true ? TextDecoration.underline : TextDecoration.none,
            letterSpacing: st.tracking != null ? st.tracking! * fontSize : null,
            color: textColor,
            shadows: shadows.isEmpty ? null : shadows,
          ),
        ),
      );
    }

    if (l.kind == 'image') {
      final backend = context.read<ClientSession>().backend;
      final hasSrc = l.photoId != null || l.stock != null;
      Widget img;
      if (!hasSrc) {
        img = Container(
          color: c.surface,
          alignment: Alignment.center,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(LucideIcons.imagePlus, size: 22, color: c.textMuted),
            const SizedBox(height: 4),
            Text(widget.catalog.labels.canvas.imagePlaceholder, textAlign: TextAlign.center, style: TextStyle(fontSize: 10, color: c.textMuted)),
          ]),
        );
      } else {
        final url = l.photoId != null ? backend.url('/api/photos/${l.photoId}?size=view') : backend.url('/api/cover-photos/${l.stock}?w=900');
        final frame = l.frame ?? const v1api.CoverPhotoFrame(zoom: 1, x: 0.5, y: 0.5);
        final align = Alignment(frame.x * 2 - 1, frame.y * 2 - 1);
        img = Transform.scale(
          scale: frame.zoom,
          alignment: align,
          child: Image.network(
            url,
            headers: l.photoId != null ? backend.imageHeaders : null,
            fit: BoxFit.cover,
            alignment: align,
            gaplessPlayback: true,
            errorBuilder: (_, _, _) => ColoredBox(color: c.surface),
          ),
        );
        if (l.mono == true) {
          img = ColorFiltered(
            colorFilter: const ColorFilter.matrix([
              0.2126, 0.7152, 0.0722, 0, 0,
              0.2126, 0.7152, 0.0722, 0, 0,
              0.2126, 0.7152, 0.0722, 0, 0,
              0, 0, 0, 1, 0,
            ]),
            child: img,
          );
        }
        if (l.overlay != null) {
          img = Stack(fit: StackFit.expand, children: [
            img,
            ColoredBox(color: CoverDesignerLogic.parseHex(l.overlay!.color).withValues(alpha: l.overlay!.opacity)),
          ]);
        }
      }
      final mask = l.mask ?? 'rect';
      final lw = l.w * cw;
      final lh = l.h * ch;
      if (mask == 'circle') {
        img = ClipOval(child: img);
      } else if (mask == 'rounded') {
        img = ClipRRect(borderRadius: BorderRadius.circular((l.radius ?? 0.08) * math.min(lw, lh)), child: img);
      } else if (mask == 'arch') {
        img = ClipPath(clipper: _ArchClipper(), child: img);
      }
      if (l.border != null && l.border!.width > 0) {
        final bw = l.border!.width * cw;
        img = Stack(fit: StackFit.expand, children: [
          img,
          IgnorePointer(
            child: CustomPaint(
              painter: _ImageBorderPainter(mask: mask, radius: (l.radius ?? 0.08) * math.min(lw, lh), color: CoverDesignerLogic.parseHex(l.border!.color), strokeWidth: bw),
            ),
          ),
        ]);
      }
      return img;
    }

    if (l.kind == 'shape') {
      return CustomPaint(painter: _ShapeLayerPainter(layer: l, boardPxW: cw));
    }

    if (l.kind == 'decor') {
      final found = widget.catalog.decors.cast<v1api.CoverDecorOption?>().firstWhere((d) => d?.id == l.motif, orElse: () => null);
      if (found != null) {
        final colored = found.svg.replaceAll('#3B332E', l.color ?? '#B8925A');
        return SvgPicture.string(colored, fit: BoxFit.contain);
      }
      return Center(child: Icon(LucideIcons.sparkles, color: CoverDesignerLogic.parseHex(l.color, fallback: const Color(0xFFB8925A))));
    }

    return const SizedBox.shrink();
  }
}

// ─── CustomPainters и клипперы для точного совпадения с geometry.ts ──────────

class _ArchClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final r = math.min(size.width / 2, size.height);
    return Path()
      ..moveTo(0, size.height)
      ..lineTo(0, r)
      ..arcToPoint(Offset(size.width, r), radius: Radius.circular(r))
      ..lineTo(size.width, size.height)
      ..close();
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class _ImageBorderPainter extends CustomPainter {
  _ImageBorderPainter({required this.mask, required this.radius, required this.color, required this.strokeWidth});
  final String mask;
  final double radius;
  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;
    final rect = Rect.fromLTWH(strokeWidth / 2, strokeWidth / 2, math.max(0, size.width - strokeWidth), math.max(0, size.height - strokeWidth));
    if (mask == 'circle') {
      canvas.drawOval(rect, paint);
    } else if (mask == 'rounded') {
      canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(radius)), paint);
    } else if (mask == 'arch') {
      final r = math.min(rect.width / 2, rect.height);
      final p = Path()
        ..moveTo(rect.left, rect.bottom)
        ..lineTo(rect.left, rect.top + r)
        ..arcToPoint(Offset(rect.right, rect.top + r), radius: Radius.circular(r))
        ..lineTo(rect.right, rect.bottom)
        ..close();
      canvas.drawPath(p, paint);
    } else {
      canvas.drawRect(rect, paint);
    }
  }

  @override
  bool shouldRepaint(_ImageBorderPainter old) => old.mask != mask || old.radius != radius || old.color != color || old.strokeWidth != strokeWidth;
}

class _ShapeLayerPainter extends CustomPainter {
  _ShapeLayerPainter({required this.layer, required this.boardPxW});
  final v1api.CoverLayer layer;
  final double boardPxW;

  @override
  void paint(Canvas canvas, Size size) {
    final shape = layer.shape ?? 'rect';
    final outlineOnly = shape == 'line' || shape == 'frame' || shape == 'double' || shape == 'corners';
    final sw = (layer.strokeWidth ?? (outlineOnly ? 0.004 : 0)) * boardPxW;
    final strokeHex = layer.stroke ?? (outlineOnly ? (layer.fill ?? '#1F1A17') : null);
    final r = (layer.radius ?? 0) * math.min(size.width, size.height);
    final rect = Rect.fromLTWH(sw / 2, sw / 2, math.max(0, size.width - sw), math.max(0, size.height - sw));

    Paint? fillPaint;
    if (!outlineOnly && layer.fill != null) {
      fillPaint = Paint()..style = PaintingStyle.fill;
      if (layer.gradient != null) {
        final angle = layer.gradient!.angle;
        fillPaint.shader = LinearGradient(
          begin: CoverDesignerLogic.gradientBegin(angle),
          end: CoverDesignerLogic.gradientEnd(angle),
          colors: [CoverDesignerLogic.parseHex(layer.fill), CoverDesignerLogic.parseHex(layer.gradient!.to)],
        ).createShader(Offset.zero & size);
      } else {
        fillPaint.color = CoverDesignerLogic.parseHex(layer.fill);
      }
    }

    Paint? strokePaint;
    if (strokeHex != null && sw > 0) {
      strokePaint = Paint()
        ..color = CoverDesignerLogic.parseHex(strokeHex)
        ..style = PaintingStyle.stroke
        ..strokeWidth = sw;
    }

    switch (shape) {
      case 'rect':
        final rr = RRect.fromRectAndRadius(rect, Radius.circular(r));
        if (fillPaint != null) canvas.drawRRect(rr, fillPaint);
        if (strokePaint != null) canvas.drawRRect(rr, strokePaint);
      case 'ellipse':
        if (fillPaint != null) canvas.drawOval(rect, fillPaint);
        if (strokePaint != null) canvas.drawOval(rect, strokePaint);
      case 'arch':
        final ar = math.min(rect.width / 2, rect.height);
        final p = Path()
          ..moveTo(rect.left, rect.bottom)
          ..lineTo(rect.left, rect.top + ar)
          ..arcToPoint(Offset(rect.right, rect.top + ar), radius: Radius.circular(ar))
          ..lineTo(rect.right, rect.bottom)
          ..close();
        if (fillPaint != null) canvas.drawPath(p, fillPaint);
        if (strokePaint != null) canvas.drawPath(p, strokePaint);
      case 'line':
        final lp = Paint()
          ..color = CoverDesignerLogic.parseHex(strokeHex, fallback: const Color(0xFF1F1A17))
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(sw, 1.0);
        canvas.drawLine(Offset(0, size.height / 2), Offset(size.width, size.height / 2), lp);
      case 'frame':
        if (strokePaint != null) canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(r)), strokePaint);
      case 'double':
        if (strokePaint != null) {
          canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(r)), strokePaint);
          final gap = sw * 3;
          final inner = Rect.fromLTWH(
            gap + sw / 2,
            gap + sw / 2,
            math.max(0, size.width - gap * 2 - sw),
            math.max(0, size.height - gap * 2 - sw),
          );
          final innerPaint = Paint()
            ..color = strokePaint.color
            ..style = PaintingStyle.stroke
            ..strokeWidth = sw * 0.6;
          canvas.drawRRect(RRect.fromRectAndRadius(inner, Radius.circular(math.max(0, r - gap))), innerPaint);
        }
      case 'corners':
        if (strokePaint != null) {
          strokePaint
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round;
          final len = math.min(size.width, size.height) * 0.22;
          final o = sw / 2;
          final p = Path()
            ..moveTo(o, o + len)
            ..lineTo(o, o)
            ..lineTo(o + len, o)
            ..moveTo(size.width - o - len, o)
            ..lineTo(size.width - o, o)
            ..lineTo(size.width - o, o + len)
            ..moveTo(size.width - o, size.height - o - len)
            ..lineTo(size.width - o, size.height - o)
            ..lineTo(size.width - o - len, size.height - o)
            ..moveTo(o + len, size.height - o)
            ..lineTo(o, size.height - o)
            ..lineTo(o, size.height - o - len);
          canvas.drawPath(p, strokePaint);
        }
    }
  }

  @override
  bool shouldRepaint(_ShapeLayerPainter old) => old.layer != layer || old.boardPxW != boardPxW;
}

class _SafeAreaPainter extends CustomPainter {
  _SafeAreaPainter({required this.safe, required this.color});
  final v1api.CoverRect safe;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(safe.x * size.width, safe.y * size.height, safe.w * size.width, safe.h * size.height);
    final paint = Paint()
      ..color = color.withValues(alpha: 0.45)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final path = Path()..addRect(rect);
    for (final m in path.computeMetrics()) {
      for (double d = 0; d < m.length; d += 8) {
        canvas.drawPath(m.extractPath(d, math.min(d + 4, m.length)), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_SafeAreaPainter old) => old.safe != safe || old.color != color;
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black.withValues(alpha: 0.14)
      ..strokeWidth = 0.7;
    for (var i = 1; i < 6; i++) {
      final dx = size.width * i / 6;
      final dy = size.height * i / 6;
      canvas.drawLine(Offset(dx, 0), Offset(dx, size.height), paint);
      canvas.drawLine(Offset(0, dy), Offset(size.width, dy), paint);
    }
  }

  @override
  bool shouldRepaint(_GridPainter old) => false;
}

// ─── Вспомогательные контролы конструктора ────────────────────────────────────

class _DesignerToolbar extends StatelessWidget {
  const _DesignerToolbar({
    required this.labels,
    required this.resetLabel,
    required this.editable,
    required this.canUndo,
    required this.canRedo,
    required this.hasSelection,
    required this.full,
    required this.showSafe,
    required this.showGrid,
    required this.onUndo,
    required this.onRedo,
    required this.onDuplicate,
    required this.onRemove,
    required this.onToggleSafe,
    required this.onToggleGrid,
    required this.onReset,
  });

  final v1api.CoverDesignerLabelsToolbar labels;
  final String resetLabel;
  final bool editable;
  final bool canUndo;
  final bool canRedo;
  final bool hasSelection;
  final bool full;
  final bool showSafe;
  final bool showGrid;
  final VoidCallback onUndo;
  final VoidCallback onRedo;
  final VoidCallback onDuplicate;
  final VoidCallback onRemove;
  final VoidCallback onToggleSafe;
  final VoidCallback onToggleGrid;
  final VoidCallback? onReset;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    Widget tool(IconData icon, String tip, VoidCallback? onTap, {bool active = false}) => Tooltip(
          message: tip,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(8),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: active ? c.bubbleOut : Colors.transparent, borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, size: 18, color: onTap == null ? c.textFaint : (active ? c.brand : c.text)),
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.panel), border: Border.all(color: c.border)),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          tool(LucideIcons.undo2, labels.undo, editable && canUndo ? onUndo : null),
          tool(LucideIcons.redo2, labels.redo, editable && canRedo ? onRedo : null),
          Container(width: 1, height: 22, color: c.border, margin: const EdgeInsets.symmetric(horizontal: 4)),
          tool(LucideIcons.copyPlus, labels.duplicate, editable && hasSelection && !full ? onDuplicate : null),
          tool(LucideIcons.trash2, labels.remove, editable && hasSelection ? onRemove : null),
          Container(width: 1, height: 22, color: c.border, margin: const EdgeInsets.symmetric(horizontal: 4)),
          tool(LucideIcons.scanLine, labels.safe, onToggleSafe, active: showSafe),
          tool(LucideIcons.grid3x3, labels.grid, onToggleGrid, active: showGrid),
          if (onReset != null) ...[
            Container(width: 1, height: 22, color: c.border, margin: const EdgeInsets.symmetric(horizontal: 4)),
            tool(LucideIcons.rotateCcw, resetLabel, onReset),
          ],
        ]),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(text, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600));
}

class _DesignerChip extends StatelessWidget {
  const _DesignerChip({required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: on ? c.text : c.surfaceRaised,
      shape: StadiumBorder(side: BorderSide(color: on ? c.text : c.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: on ? c.bg : c.text)),
        ),
      ),
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({required this.label, required this.value, required this.options, required this.enabled, required this.onChanged});
  final String label;
  final String value;
  final List<v1api.CoverOption> options;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (label.isNotEmpty) ...[
        Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
        const SizedBox(height: 6),
      ],
      Wrap(spacing: 6, runSpacing: 6, children: [
        for (final o in options)
          _DesignerChip(label: o.label, on: o.id == value, onTap: enabled ? () => onChanged(o.id) : null),
      ]),
    ]);
  }
}

class _SliderField extends StatelessWidget {
  const _SliderField({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.unit,
    required this.decimals,
    required this.enabled,
    required this.onChanged,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final String unit;
  final int decimals;
  final bool enabled;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final clamped = value.clamp(min, max);
    final display = decimals == 0 ? '${clamped.round()}' : clamped.toStringAsFixed(decimals);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted))),
        Text('$display${unit.isEmpty ? '' : ' $unit'}', style: TextStyle(fontSize: 12.5, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()])),
      ]),
      Slider(
        value: clamped,
        min: min,
        max: max > min ? max : min + 1,
        onChanged: enabled ? onChanged : null,
      ),
    ]);
  }
}

class _ColorPickerRow extends StatelessWidget {
  const _ColorPickerRow({
    required this.label,
    required this.value,
    required this.swatches,
    required this.enabled,
    required this.onChanged,
    this.allowNone = false,
    this.noneLabel = '',
  });

  final String label;
  final String? value;
  final List<String> swatches;
  final bool enabled;
  final ValueChanged<String?> onChanged;
  final bool allowNone;
  final String noneLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final unique = <String>[];
    for (final s in swatches) {
      final up = s.toUpperCase();
      if (!unique.contains(up)) unique.add(up);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted))),
        if (value != null) Text(value!.toUpperCase(), style: TextStyle(fontSize: 12, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()])),
      ]),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        if (allowNone)
          GestureDetector(
            onTap: enabled ? () => onChanged(null) : null,
            child: Container(
              height: 32,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: value == null ? c.bubbleOut : c.surfaceRaised,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: value == null ? c.brand : c.border, width: value == null ? 2 : 1),
              ),
              child: Text(noneLabel, style: TextStyle(fontSize: 12, color: value == null ? c.brand : c.textMuted)),
            ),
          ),
        for (final hex in unique)
          GestureDetector(
            onTap: enabled ? () => onChanged(hex) : null,
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: CoverDesignerLogic.parseHex(hex),
                shape: BoxShape.circle,
                border: Border.all(
                  color: value?.toUpperCase() == hex ? c.brand : c.border,
                  width: value?.toUpperCase() == hex ? 3 : 1,
                ),
              ),
            ),
          ),
      ]),
    ]);
  }
}
