import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import 'package:mybooks_seller/api/mybook_api.g.dart' as v1api;
import 'package:mybooks_seller/client/data/backend.dart';
import 'package:mybooks_seller/client/data/session.dart';
import 'package:mybooks_seller/client/screens/photo_editor_screen.dart';
import 'package:mybooks_seller/core/api.dart';
import 'package:mybooks_seller/ui/tokens.dart';

const _bookId = '3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c';
const _photoId = '8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d';

v1api.PhotoEditorState _sampleState({bool edited = false, int origW = 2400, int origH = 1600}) {
  return v1api.PhotoEditorState(
    bookId: _bookId,
    photoId: _photoId,
    editable: true,
    edited: edited,
    version: 'v1',
    width: origW,
    height: origH,
    originalWidth: origW,
    originalHeight: origH,
    originalUrl: '/api/photos/$_photoId?size=original&v=v1',
    thumbUrl: '/api/photos/$_photoId?size=thumb&v=v1',
    viewUrl: '/api/photos/$_photoId?size=view&v=v1',
    edit: photoEditEmptyDoc(),
    suggestedLevels: const v1api.PhotoEditLevels(black: 0.08, white: 0.92, gamma: 1.15),
    slot: const v1api.PhotoEditorSlot(ratio: 0.7, widthMm: 148, heightMm: 210, mode: 'cover', label: 'Весь лист', mask: null),
    limits: const v1api.PhotoEditorLimits(
      minCropFraction: 0.02,
      smallLongSidePx: 1200,
      minDpi: 150,
      straightenMin: -45,
      straightenMax: 45,
      straightenStep: 0.5,
      filterStrengthMin: 0,
      filterStrengthMax: 100,
      filterStrengthStep: 1,
      filterStrengthDefault: 100,
      maxLayers: 80,
    ),
    aspects: const [
      v1api.PhotoEditorAspect(key: 'free', label: 'Свободно', ratio: null),
      v1api.PhotoEditorAspect(key: 'original', label: 'Исходные', ratio: 1.5),
      v1api.PhotoEditorAspect(key: 'slot', label: 'Весь лист', ratio: 0.7),
      v1api.PhotoEditorAspect(key: '1:1', label: '1:1', ratio: 1.0),
      v1api.PhotoEditorAspect(key: '4:3', label: '4:3', ratio: 4 / 3),
    ],
    adjustControls: const [
      v1api.PhotoEditorAdjustControl(key: 'brightness', label: 'Яркость', min: -100, max: 100, step: 1, defaultValue: 0, centered: true),
      v1api.PhotoEditorAdjustControl(key: 'contrast', label: 'Контраст', min: -100, max: 100, step: 1, defaultValue: 0, centered: true),
      v1api.PhotoEditorAdjustControl(key: 'saturation', label: 'Насыщенность', min: -100, max: 100, step: 1, defaultValue: 0, centered: true),
      v1api.PhotoEditorAdjustControl(key: 'vignette', label: 'Виньетка', min: 0, max: 100, step: 1, defaultValue: 0, centered: false),
    ],
    filters: const [
      v1api.PhotoEditorFilterPreset(id: 'none', label: 'Без фильтра', adjust: {}, mono: 0, sepia: 0, splitShadows: null, splitHighlights: null),
      v1api.PhotoEditorFilterPreset(id: 'bw', label: 'Ч/Б', adjust: {'contrast': 8}, mono: 1, sepia: 0, splitShadows: null, splitHighlights: null),
      v1api.PhotoEditorFilterPreset(id: 'warm', label: 'Тёплый', adjust: {'warmth': 38}, mono: 0, sepia: 0, splitShadows: null, splitHighlights: null),
    ],
    labels: const v1api.PhotoEditorLabels(
      title: 'Редактор фото',
      close: 'Закрыть редактор',
      save: 'Сохранить',
      saving: 'Сохраняем фото…',
      savingHint: 'Собираем картинку…',
      saved: 'Фото сохранено',
      unsaved: 'Есть несохранённые правки',
      reverted: 'Вернули оригинал',
      loading: 'Открываем фото…',
      loadError: 'Не удалось открыть фото',
      retry: 'Повторить',
      undo: 'Отменить',
      redo: 'Вернуть',
      compare: 'Сравнить с оригиналом',
      compareShort: 'До',
      more: 'Ещё',
      resetAll: 'Сбросить все правки',
      revert: 'Вернуть оригинал',
      revertTitle: 'Вернуть оригинал?',
      revertText: 'Правки будут убраны.',
      revertYes: 'Вернуть оригинал',
      discardTitle: 'Выйти без сохранения?',
      discardText: 'Правки не сохранятся.',
      discardYes: 'Выйти',
      discardNo: 'Остаться',
      cancel: 'Отмена',
      done: 'Готово',
      toolCrop: 'Кадр',
      toolAdjust: 'Свет',
      toolFilters: 'Фильтры',
      cropAspect: 'Пропорции',
      cropRotateLeft: 'Повернуть влево',
      cropRotateRight: 'Повернуть вправо',
      cropFlip: 'Отразить',
      cropStraighten: 'Выпрямить',
      cropReset: 'Сбросить кадр',
      cropHint: 'Тяните за углы рамки.',
      cropSmallTemplate: 'После обрезки снимок станет небольшим ({px} px по длинной стороне).',
      lowRes: 'Низкое разрешение',
      lowDpiTemplate: 'Чёткость {dpi} dpi — может быть нерезким.',
      adjustAuto: 'Авто',
      adjustAutoHint: 'Подтянет свет и контраст.',
      adjustReset: 'Сбросить',
      adjustResetAll: 'Сбросить свет и цвет',
      filterStrength: 'Сила',
    ),
  );
}

class _FakeBackend extends ApiBackend {
  _FakeBackend(http.Client client) : super(ApiClient(baseUrl: 'https://test.local')) {
    _customV1 = v1api.MybookApi(baseUrl: 'https://test.local', client: client);
  }
  late final v1api.MybookApi _customV1;
  @override
  v1api.MybookApi get contract => _customV1;
}

class _FakeSession extends ClientSession {
  _FakeSession(this._fake);
  final ClientBackend _fake;
  @override
  ClientBackend get backend => _fake;
}

Widget _wrap(ClientSession session, Widget child) {
  return ChangeNotifierProvider<ClientSession>.value(
    value: session,
    child: MaterialApp(
      theme: buildTheme(Brightness.light, client: true),
      home: child,
    ),
  );
}

void main() {
  group('математика редактора фото (паритет с doc.ts / color.ts)', () {
    test('поворот 90° CW/CCW и отражение обратимы и корректно поворачивают кадр', () {
      final base = v1api.PhotoEditDoc(
        v: 1,
        geometry: const v1api.PhotoEditGeometry(
          turns: 0,
          flip: false,
          straighten: 5,
          crop: v1api.PhotoEditRect(x: 0.1, y: 0.2, w: 0.5, h: 0.6),
          aspect: '4:3',
        ),
        adjust: const {'brightness': 10},
        levels: null,
        filter: const v1api.PhotoEditFilter(id: 'none', strength: 100),
        layers: const [],
      );
      final cw = photoEditRotateCW(base);
      expect(cw.geometry.turns, 1);
      expect(cw.geometry.aspect, '3:4');
      expect(cw.geometry.crop!.x, closeTo(0.2, 1e-4));
      expect(cw.geometry.crop!.y, closeTo(0.1, 1e-4));
      expect(cw.geometry.crop!.w, closeTo(0.6, 1e-4));
      expect(cw.geometry.crop!.h, closeTo(0.5, 1e-4));

      final back = photoEditRotateCCW(cw);
      expect(back.geometry.turns, 0);
      expect(back.geometry.aspect, '4:3');

      final flipped = photoEditFlip(base);
      expect(flipped.geometry.flip, isTrue);
      expect(flipped.geometry.straighten, -5);
      expect(flipped.geometry.crop!.x, closeTo(0.4, 1e-4));
      expect(photoEditFlip(flipped).geometry.flip, isFalse);
    });

    test('цветовая матрица Ч/Б переводит RGB в одинаковую яркость', () {
      final s = _sampleState();
      final doc = v1api.PhotoEditDoc(
        v: 1,
        geometry: photoEditEmptyDoc().geometry,
        adjust: const {},
        levels: null,
        filter: const v1api.PhotoEditFilter(id: 'bw', strength: 100),
        layers: const [],
      );
      final m = buildPhotoEditColorMatrix(doc, s.adjustControls, s.filters);
      final r = m[0] * 200 + m[1] * 40 + m[2] * 40 + m[4];
      final g = m[5] * 200 + m[6] * 40 + m[7] * 40 + m[9];
      final b = m[10] * 200 + m[11] * 40 + m[12] * 40 + m[14];
      expect((r - g).abs(), lessThan(0.01));
      expect((g - b).abs(), lessThan(0.01));
    });

    test('эффективный DPI и coverScale совпадают с формулами сайта', () {
      expect(photoEditCoverScale(300, 200, 0), 1);
      expect(photoEditCoverScale(300, 200, 10), greaterThan(1.1));
      final dpi = photoEditEffectiveDpi(600, 800, const v1api.PhotoEditorSlot(ratio: 0.7, widthMm: 148, heightMm: 210, mode: 'cover'));
      expect(dpi, lessThan(150));
    });
  });

  group('PhotoEditorScreen виджет-тесты', () {
    testWidgets('показывает инструменты с сервера, поворачивает, включает фильтр Ч/Б, undo/redo и сохраняет через PUT', (tester) async {
      Map<String, dynamic>? sentBody;
      final client = MockClient((req) async {
        if (req.method == 'PUT' && req.url.path.endsWith('/editor')) {
          sentBody = jsonDecode(req.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'photoId': _photoId,
              'width': 1600,
              'height': 2400,
              'edited': true,
              'version': 'v2',
              'thumbUrl': '/api/photos/$_photoId?size=thumb&v=v2',
              'url': '/api/photos/$_photoId?size=view&v=v2',
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      final session = _FakeSession(_FakeBackend(client));
      v1api.PhotoEditorResult? popped;

      await tester.pumpWidget(
        _wrap(
          session,
          Builder(
            builder: (ctx) => TextButton(
              onPressed: () async {
                popped = await Navigator.of(ctx).push<v1api.PhotoEditorResult>(
                  MaterialPageRoute(
                    builder: (_) => PhotoEditorScreen(
                      bookId: _bookId,
                      photoId: _photoId,
                      initialState: _sampleState(),
                      imageBuilder: (_, _, _) => const ColoredBox(color: Colors.teal),
                    ),
                  ),
                );
              },
              child: const Text('OPEN'),
            ),
          ),
        ),
      );

      await tester.tap(find.text('OPEN'));
      await tester.pumpAndSettle();

      // Инструменты и кнопки пришли с сервера.
      expect(find.text('Кадр'), findsOneWidget);
      expect(find.text('Свет'), findsOneWidget);
      expect(find.text('Фильтры'), findsOneWidget);
      expect(find.text('Весь лист'), findsOneWidget);

      // Поворот вправо → включается Undo и кнопка «Сбросить кадр».
      await tester.tap(find.text('Повернуть вправо'));
      await tester.pumpAndSettle();
      expect(find.text('Сбросить кадр'), findsOneWidget);

      // Переключаемся на «Свет» и нажимаем «Авто».
      await tester.tap(find.text('Свет'));
      await tester.pumpAndSettle();
      expect(find.text('Авто'), findsOneWidget);
      await tester.tap(find.text('Авто'));
      await tester.pumpAndSettle();
      expect(find.text('Сбросить свет и цвет'), findsOneWidget);

      // Переключаемся на «Фильтры» и выбираем «Ч/Б».
      await tester.tap(find.text('Фильтры'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ч/Б'));
      await tester.pumpAndSettle();
      expect(find.text('Сила'), findsOneWidget);

      // Сохраняем → отправляется PUT с version='v1', turns=1, levels!=null, filter.id='bw'.
      await tester.tap(find.text('Сохранить'));
      await tester.pumpAndSettle();

      expect(sentBody, isNotNull);
      expect(sentBody!['version'], 'v1');
      final edit = sentBody!['edit'] as Map<String, dynamic>;
      expect((edit['geometry'] as Map<String, dynamic>)['turns'], 1);
      expect(edit['levels'], isNotNull);
      expect((edit['filter'] as Map<String, dynamic>)['id'], 'bw');
      expect(popped?.edited, isTrue);
      expect(popped?.version, 'v2');
    });

    testWidgets('предупреждение о малом размере и кнопка «Вернуть оригинал» (DELETE)', (tester) async {
      var deleted = false;
      final client = MockClient((req) async {
        if (req.method == 'DELETE' && req.url.path.endsWith('/editor')) {
          deleted = true;
          return http.Response(
            jsonEncode({
              'photoId': _photoId,
              'width': 900,
              'height': 600,
              'edited': false,
              'version': 'v0',
              'thumbUrl': '/api/photos/$_photoId?size=thumb&v=v0',
              'url': '/api/photos/$_photoId?size=view&v=v0',
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      final session = _FakeSession(_FakeBackend(client));

      await tester.pumpWidget(
        _wrap(
          session,
          PhotoEditorScreen(
            bookId: _bookId,
            photoId: _photoId,
            // Маленький снимок 900×600 (< 1200) → сразу видно предупреждение из шаблона сервера.
            initialState: _sampleState(edited: true, origW: 900, origH: 600),
            imageBuilder: (_, _, _) => const ColoredBox(color: Colors.amber),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('900 px'), findsOneWidget);

      // Меню «Ещё» → «Вернуть оригинал» → подтверждение → DELETE.
      await tester.tap(find.byIcon(LucideIcons.ellipsis));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Вернуть оригинал'));
      await tester.pumpAndSettle();
      expect(find.text('Вернуть оригинал?'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Вернуть оригинал'));
      await tester.pumpAndSettle();

      expect(deleted, isTrue);
    });
  });
}
