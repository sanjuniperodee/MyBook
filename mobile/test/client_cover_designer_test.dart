import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import 'package:mybooks_seller/api/mybook_api.g.dart' as v1api;
import 'package:mybooks_seller/client/data/backend.dart';
import 'package:mybooks_seller/client/data/models.dart';
import 'package:mybooks_seller/client/data/session.dart';
import 'package:mybooks_seller/client/screens/cover_designer.dart';
import 'package:mybooks_seller/client/screens/cover_screen.dart';
import 'package:mybooks_seller/ui/tokens.dart';

const _bookId = '3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c';
const _photoId = '11111111-2222-4333-8444-555555555501';

const _sampleShapeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" fill="none" stroke="#3B332E" stroke-width="2"/></svg>';
const _sampleDecorSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#3B332E"/></svg>';

Map<String, dynamic> _coverViewJson({
  bool hasDesign = false,
  bool hasBackDesign = false,
  bool lines = true,
  Map<String, dynamic>? coverDesign,
  Map<String, dynamic>? coverBack,
}) =>
    {
      'cover': {
        'template': 'linen',
        'lines': lines,
        'title': 'Наша история',
        'subtitle': 'Четыре года вместе',
        'namesOnCover': '',
        'hideRecipientOnCover': false,
        'authorName': 'Айгерим',
        'recordedBy': '',
        'recipientName': 'Арман',
        'kind': 'gift',
        'recipientLabel': 'Любимый человек',
        'autoNames': 'Айгерим & Арман',
        'year': 2026,
        'photoIds': <String?>[_photoId],
        'backText': 'С любовью',
        'backLayout': 'quote',
        'backPhotoId': _photoId,
        'backPhotoIds': [_photoId],
        'hasDesign': hasDesign,
        'hasBackDesign': hasBackDesign,
        'coverDesign': coverDesign,
        'coverBack': coverBack,
        'backUnderlay': <Map<String, dynamic>>[],
        'photoFrames': <Map<String, dynamic>>[],
        'format': 'a5',
        'board': {'w': 152, 'h': 216},
        'safeFront': {'x': 0.06, 'y': 0.04, 'w': 0.89, 'h': 0.92},
        'safeBack': {'x': 0.05, 'y': 0.04, 'w': 0.89, 'h': 0.92},
        'imageUrl': '/api/books/$_bookId/cover-image?v=v1',
        'backImageUrl': '/api/books/$_bookId/cover-image?side=back&v=b1',
        'spreadImageUrl': '/api/books/$_bookId/cover-image?side=spread&p=120&v=s1',
        'templateBgUrl': '/api/covers/linen-a5.svg?v=1',
        'backTemplateBgUrl': '/api/covers/linen-a5-back.svg?v=1',
        'templateBaseColor': '#F4EEE6',
        'editable': true,
      },
      'templates': [
        {'id': 'linen', 'name': 'Лён', 'mood': 'classic', 'requiresPhoto': true, 'photoSlots': 1, 'previewUrl': '/api/covers/linen-a5-lite.svg?v=1'},
        {'id': 'velvet', 'name': 'Бархат', 'mood': 'romantic', 'requiresPhoto': false, 'photoSlots': 0, 'previewUrl': '/api/covers/velvet-a5-lite.svg?v=1'},
      ],
      'moods': [
        {'id': 'all', 'label': 'Все'},
        {'id': 'classic', 'label': 'Классика'},
        {'id': 'romantic', 'label': 'Романтика'},
      ],
      'backLayouts': [
        {'id': 'quote', 'name': 'Цитата', 'hint': 'Фраза в центре', 'label': 'Цитата', 'placeholder': 'Фраза', 'note': null, 'photos': 0, 'photosLabel': null},
        {'id': 'photo', 'name': 'Фото', 'hint': 'Снимок с подписью', 'label': 'Подпись к фото', 'placeholder': 'Подпись', 'note': null, 'photos': 1, 'photosLabel': 'Какое фото'},
      ],
      'limits': {'title': 80, 'authorName': 60, 'recordedBy': 80, 'recipientName': 60, 'subtitle': 80, 'namesOnCover': 120, 'backText': 400},
      'labels': {
        'title': 'Обложка',
        'saving': 'Сохраняем…',
        'sides': {'front': 'Лицо', 'back': 'Оборот'},
        'tabs': {'designs': 'Дизайн', 'photo': 'Фото', 'text': 'Текст', 'variant': 'Вариант'},
        'variants': '2 варианта',
        'shown': 12,
        'showAll': 'Показать все обложки (2)',
        'onCover': 'На обложке',
        'designActive': 'Сейчас на обложке — ваш вариант из конструктора.',
        'readonly': 'Книга заказана — обложку уже нельзя менять.',
        'photo': {'title': 'Фото для обложки', 'slots': ['Фото 1'], 'slotsHint': 'Выберите место', 'uploadFirst': 'Сначала загрузите фото', 'note': 'Фото с обложки внутри книги сами не повторяются.'},
        'text': {
          'bookTitle': 'Название книги',
          'subtitle': 'Подзаголовок',
          'subtitlePlaceholder': 'Например, «Четыре года вместе»',
          'author': 'Ваше полное имя',
          'recordedBy': 'Кто записал',
          'recordedByPlaceholder': 'Например, внучка',
          'recipientNone': 'Получателя нет',
          'hideRecipient': 'Не отображать на обложке',
          'namesOnCover': 'Имена на обложке',
          'namesOnCoverText': 'Можно поменять порядок.',
          'coverLines': 'Декоративные линии',
          'coverLinesHint': 'Линии и рамки рисунка шаблона.',
        },
        'back': {'title': 'Задняя сторона', 'text': 'Последние слова.', 'noPhotos': 'В книге пока нет фото.', 'signed': 'Подпись — «Айгерим».'},
      },
      'designer': {
        'swatches': ['#1F1A17', '#FFFFFF', '#7A1F2B', '#B8925A', '#F3D9A4'],
        'backSwatches': ['#1F1A17', '#FFFFFF', '#7A1F2B', '#F4EEE6'],
        'fonts': [
          {'id': 'cormorant', 'name': 'Cormorant', 'category': 'book', 'weights': [400, 500, 600], 'italic': true, 'body': true},
          {'id': 'prata', 'name': 'Prata', 'category': 'editorial', 'weights': [400], 'italic': false, 'body': false},
          {'id': 'onest', 'name': 'Onest', 'category': 'sans', 'weights': [400, 600], 'italic': false, 'body': true},
        ],
        'fontCategories': [
          {'id': 'all', 'label': 'Все'},
          {'id': 'book', 'label': 'Книжные'},
          {'id': 'editorial', 'label': 'Журнальные'},
          {'id': 'sans', 'label': 'Без засечек'},
        ],
        'weightLabels': [
          {'weight': 400, 'label': 'Обычный'},
          {'weight': 500, 'label': 'Средний'},
          {'weight': 600, 'label': 'Полужирный'},
        ],
        'shapes': [
          {'id': 'rect', 'label': 'Прямоугольник', 'outlineOnly': false, 'supportsRadius': true, 'svg': _sampleShapeSvg},
          {'id': 'line', 'label': 'Линия', 'outlineOnly': true, 'supportsRadius': false, 'svg': _sampleShapeSvg},
          {'id': 'frame', 'label': 'Рамка', 'outlineOnly': true, 'supportsRadius': true, 'svg': _sampleShapeSvg},
          {'id': 'double', 'label': 'Двойная рамка', 'outlineOnly': true, 'supportsRadius': true, 'svg': _sampleShapeSvg},
          {'id': 'corners', 'label': 'Уголки', 'outlineOnly': true, 'supportsRadius': false, 'svg': _sampleShapeSvg},
        ],
        'decors': [
          {'id': 'laurel', 'label': 'Лавровый венок', 'aspect': 1.5, 'svg': _sampleDecorSvg},
          {'id': 'heart', 'label': 'Сердце', 'aspect': 1.0, 'svg': _sampleDecorSvg},
        ],
        'textPresets': [
          {'id': 'heading', 'label': 'Заголовок', 'sampleText': 'Ваш заголовок', 'font': 'prata', 'weight': 400, 'size': 0.085, 'lineHeight': 1.1, 'h': 0.14},
          {'id': 'body', 'label': 'Обычный текст', 'sampleText': 'Несколько слов о книге', 'font': 'cormorant', 'weight': 400, 'size': 0.032, 'lineHeight': 1.35, 'h': 0.1},
        ],
        'imageMasks': [
          {'id': 'rect', 'label': 'Прямоугольник'},
          {'id': 'rounded', 'label': 'Скругление'},
          {'id': 'circle', 'label': 'Круг'},
          {'id': 'arch', 'label': 'Арка'},
        ],
        'aligns': [
          {'id': 'left', 'label': 'Влево'},
          {'id': 'center', 'label': 'По центру'},
          {'id': 'right', 'label': 'Вправо'},
        ],
        'valigns': [
          {'id': 'top', 'label': 'Верх'},
          {'id': 'middle', 'label': 'Центр'},
          {'id': 'bottom', 'label': 'Низ'},
        ],
        'bgKinds': [
          {'id': 'template', 'label': 'Рисунок шаблона'},
          {'id': 'color', 'label': 'Цвет'},
          {'id': 'gradient', 'label': 'Градиент'},
        ],
        'stockGroups': [
          {'id': 'people', 'label': 'Люди'},
          {'id': 'flowers', 'label': 'Цветы'},
        ],
        'stockPhotos': [
          {'id': 'couple', 'group': 'people', 'thumbUrl': '/api/cover-photos/couple?w=480', 'viewUrl': '/api/cover-photos/couple?w=900'},
        ],
        'layoutGenres': [
          {'id': 'all', 'label': 'Все'},
          {'id': 'premium', 'label': 'Премиум'},
        ],
        'layouts': [
          {'id': 'premium-deco', 'genre': 'premium', 'name': 'Золото', 'description': 'Чёрная обложка, двойная золотая рамка', 'template': null},
        ],
        'limits': {
          'layers': 40,
          'text': 300,
          'name': 40,
          'bleed': 0.2,
          'minSize': 0.01,
          'maxSize': 1.4,
          'fontSizeMin': 0.012,
          'fontSizeMax': 0.4,
          'trackingMin': -0.1,
          'trackingMax': 0.8,
          'lineHeightMin': 0.7,
          'lineHeightMax': 2.5,
          'shadowMin': -0.3,
          'shadowMax': 0.3,
          'outlineMin': 0.0,
          'outlineMax': 0.12,
          'strokeMin': 0.0,
          'strokeMax': 0.06,
          'borderMin': 0.0,
          'borderMax': 0.05,
          'frameZoomMin': 1.0,
          'frameZoomMax': 4.0,
          'minDpi': 200,
          'ptPerMm': 72 / 25.4,
          'historyLimit': 100,
        },
        'labels': {
          'modes': {'template': 'Готовые дизайны', 'designer': 'Конструктор'},
          'views': {'flat': 'Плоско', 'spread': 'Целиком', 'spreadHint': 'Нажмите на сторону, чтобы править её.'},
          'cta': {'title': 'Конструктор обложки', 'text': 'Двигайте любые надписи', 'open': 'Открыть конструктор', 'openActive': 'Открыть конструктор', 'reset': 'Вернуться к обложке шаблона', 'confirmReset': 'Вернуть обложку шаблона?'},
          'backCta': {'title': 'Оборот в конструкторе', 'text': 'Двигайте надписи на обороте', 'open': 'Открыть оборот в конструкторе', 'active': 'Оборот собран в конструкторе', 'openActive': 'Открыть оборот', 'reset': 'Вернуть оборот по варианту', 'confirmReset': 'Вернуть оборот?', 'readonly': 'Оборот нельзя менять.'},
          'replace': {'titleTemplate': 'Поставить обложку «{name}»?', 'text': 'Правки сбросятся.', 'ok': 'Поставить', 'cancel': 'Отмена'},
          'backFill': {'title': 'Фон оборота', 'likeFront': 'Как спереди', 'own': 'Свой цвет', 'likeFrontNote': 'Повторяет лицо', 'ownNote': 'Корешок в тон', 'color': 'Цвет оборота', 'frontColors': 'Цвета лица первыми', 'more': 'Градиент — в конструкторе оборота.'},
          'frame': {'title': 'Кадр фото', 'hint': 'Двигайте фото', 'zoom': 'Масштаб фото', 'reset': 'Сбросить', 'slotPrefix': 'Фото'},
          'panels': {'add': 'Добавить', 'layouts': 'Макеты', 'background': 'Фон', 'properties': 'Свойства', 'layers': 'Слои', 'fill': 'Фон'},
          'toolbar': {
            'undo': 'Отменить',
            'redo': 'Повторить',
            'duplicate': 'Дублировать',
            'remove': 'Удалить',
            'front': 'На передний план',
            'forward': 'Выше',
            'backward': 'Ниже',
            'back': 'На задний план',
            'lock': 'Закрепить',
            'unlock': 'Открепить',
            'hide': 'Скрыть',
            'show': 'Показать',
            'safe': 'Безопасная зона',
            'grid': 'Сетка',
            'alignTitle': 'Выровнять',
            'alignLeft': 'По левому краю',
            'alignCenter': 'По центру',
            'alignRight': 'По правому краю',
            'alignTop': 'По верху',
            'alignMiddle': 'По середине',
            'alignBottom': 'По низу',
            'backToTemplate': 'К шаблону и тексту',
          },
          'add': {'text': 'Текст', 'photo': 'Фото', 'bookPhotos': 'Фото книги', 'noBookPhotos': 'Фото нет', 'upload': 'Загрузить фото', 'stock': 'Коллекция', 'shapes': 'Фигуры', 'decor': 'Декор', 'limit': 'Больше слоёв нельзя'},
          'layers': {'empty': 'Слоёв пока нет', 'hint': 'Верхний слой поверх остальных.', 'rename': 'Название слоя', 'kindText': 'Текст', 'kindImage': 'Фото', 'kindShape': 'Фигура', 'kindDecor': 'Декор', 'bindTitle': 'Название', 'bindSubtitle': 'Подзаголовок', 'bindNames': 'Имена'},
          'props': {
            'nothing': 'Выберите слой.',
            'none': 'Нет',
            'position': 'Положение и размер',
            'x': 'Слева',
            'y': 'Сверху',
            'w': 'Ширина',
            'h': 'Высота',
            'rotate': 'Поворот',
            'opacity': 'Непрозрачность',
            'mm': 'мм',
            'pt': 'pt',
            'deg': '°',
            'pct': '%',
            'fullCover': 'На всю обложку',
            'text': {
              'title': 'Текст',
              'content': 'Надпись',
              'linkedTitle': 'Связано с названием',
              'linkedSubtitle': 'Связано с подзаголовком',
              'linkedNames': 'Связано с именами',
              'unlink': 'Отвязать от книги',
              'font': 'Шрифт',
              'fontSearch': 'Найти шрифт',
              'fontEmpty': 'Такого шрифта нет',
              'weight': 'Насыщенность',
              'italic': 'Курсив',
              'size': 'Кегль',
              'color': 'Цвет',
              'tracking': 'Межбуквенный интервал',
              'lineHeight': 'Межстрочный интервал',
              'align': 'Выключка',
              'valign': 'По вертикали',
              'underline': 'Подчёркнутый',
              'upper': 'Прописные',
              'effects': 'Эффекты',
              'shadow': 'Тень',
              'shadowX': 'Сдвиг вправо',
              'shadowY': 'Сдвиг вниз',
              'outline': 'Контур',
              'outlineWidth': 'Толщина контура',
              'plate': 'Подложка',
              'plateRadius': 'Скругление',
              'platePad': 'Поля',
              'effectsNote': 'Печатаются точно так же.',
            },
            'image': {
              'title': 'Фото',
              'source': 'Снимок',
              'crop': 'Кадрировать',
              'cropDone': 'Готово',
              'cropHint': 'Перетащите снимок',
              'zoom': 'Масштаб',
              'resetFrame': 'Сбросить кадр',
              'mask': 'Форма',
              'radius': 'Скругление',
              'border': 'Окантовка',
              'borderWidth': 'Толщина',
              'mono': 'Чёрно-белое',
              'overlay': 'Тонирование',
              'empty': 'Место под фото',
              'lowResPrefix': 'Снимок мелковат (0 dpi)',
            },
            'shape': {'title': 'Фигура', 'kind': 'Вид', 'fill': 'Заливка', 'gradient': 'Градиент', 'gradientTo': 'Второй цвет', 'angle': 'Угол', 'stroke': 'Обводка', 'strokeWidth': 'Толщина линии', 'radius': 'Скругление'},
            'decor': {'title': 'Декор', 'motif': 'Мотив', 'color': 'Цвет', 'accent': 'Второй цвет', 'artNote': 'Рисунок ИИ'},
            'background': {'title': 'Фон', 'titleBack': 'Фон оборота', 'likeFront': 'Как спереди', 'color': 'Цвет', 'fromColor': 'Цвет 1', 'toColor': 'Цвет 2', 'angle': 'Угол', 'templateNote': 'Фон — рисунок шаблона', 'likeFrontNote': 'Оборот повторяет лицо'},
          },
          'layouts': {'title': 'Готовые макеты', 'text': 'Композиции по жанрам.', 'photosNote': 'В макетах — фото книги.', 'search': 'Найти макет', 'empty': 'Таких макетов нет', 'apply': 'Взять за основу', 'backTitle': 'Варианты оборота', 'backText': 'Раскладывается слоями.'},
          'canvas': {'wrap': 'Загиб', 'spine': 'Корешок', 'placeholderTitle': 'Название книги', 'placeholderSubtitle': 'Подзаголовок', 'placeholderNames': 'Имена', 'placeholderText': 'Текст', 'imagePlaceholder': 'Место под фото', 'unsafeWarning': 'Текст близко к краю', 'unsafeShow': 'Показать'},
          'namesSwap': 'Поменять местами',
          'namesAuto': 'Как было',
          'retry': 'Попробовать снова',
          'loadError': 'Что-то пошло не так',
        },
      },
    };

class _FakeBackend implements ClientBackend {
  _FakeBackend(this.v1, this._onCover, this._onUpdate);
  final v1api.MybookApi v1;
  final Future<v1api.CoverView> Function() _onCover;
  final Future<v1api.CoverView> Function(v1api.CoverPatch) _onUpdate;

  @override
  v1api.MybookApi get contract => v1;
  @override
  Future<T> call<T>(Future<T> Function() run) => run();
  @override
  Future<v1api.CoverView> cover(String bookId) => _onCover();
  @override
  Future<v1api.CoverView> updateCover(String bookId, v1api.CoverPatch patch) => _onUpdate(patch);
  @override
  Future<v1api.CabinetPhotos> photosTab(String bookId) async => const v1api.CabinetPhotos(
        editable: true,
        blank: false,
        maxPhotos: 100,
        title: 'Фото',
        intro: '',
        addLabel: 'Добавить',
        summary: [],
        filters: [],
        ruleTitle: '',
        ruleName: '',
        ruleChange: '',
        noMatch: '',
        photos: [
          v1api.CabPhoto(
            id: _photoId,
            n: 1,
            width: 2400,
            height: 1800,
            caption: '',
            layout: 'full',
            thumbUrl: '/api/photos/$_photoId?size=thumb',
            url: '/api/photos/$_photoId?size=view',
            place: v1api.CabPhotoPlace(kind: 'cover', label: 'Обложка', auto: false, option: 'cover'),
          ),
        ],
        chapters: [],
        answers: [],
        sheet: v1api.CabinetPhotosSheet(
          title: '',
          options: [],
          stepChapter: '',
          stepAnswer: '',
          here: '',
          layoutTitle: '',
          layouts: [],
          caption: '',
          done: '',
          coverNote: '',
          backNote: '',
          deleteLabel: '',
          deleteTitle: '',
          deleteText: '',
          deleteConfirm: '',
          deleteKeep: '',
          cancel: '',
        ),
      );

  @override
  String url(String path) => 'http://127.0.0.1$path';
  @override
  Map<String, String> get imageHeaders => const {};

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeSession extends ChangeNotifier implements ClientSession {
  _FakeSession(this._backend);
  final ClientBackend _backend;

  @override
  ClientBackend get backend => _backend;
  @override
  ClientUser? get user => const ClientUser(id: 'u1', name: 'Айгерим', phone: '+77001112233');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

v1api.CabinetBook _fakeHub() => const v1api.CabinetBook(
      id: _bookId,
      title: 'Наша история',
      subtitle: '',
      kind: 'gift',
      language: 'ru',
      blank: false,
      editable: true,
      coverUrl: '/api/books/$_bookId/cover-image?w=480&v=1',
      coverThumbUrl: '/api/books/$_bookId/cover-image?w=240&v=1',
      pathTitle: '',
      steps: [],
      needsTitle: '',
      needsFix: '',
      needs: [],
      chaptersTitle: 'Главы',
      allChaptersLabel: 'Все главы',
      chapters: [],
      letters: v1api.CabinetBookLetters(title: '', text: '', action: '', href: '', tab: ''),
      help: v1api.CabinetBookHelp(title: '', text: '', url: ''),
      whereToStart: '',
      tips: [],
      preview: v1api.CabinetBookPreview(href: '', tab: '', cta: ''),
      editor: v1api.CabinetBookEditor(answerPlaceholder: '', prev: '', next: '', dictate: '', dictateTitle: '', stop: '', recording: '', recognizing: ''),
    );

void main() {
  group('CoverDesignerLogic', () {
    test('создание слоёв текста, декоративных линий/рамок, фото и декора; z-order, выравнивание и безопасная зона', () {
      const safe = v1api.CoverRect(x: 0.06, y: 0.04, w: 0.89, h: 0.92);
      const board = v1api.CoverBoardSize(w: 152, h: 216);
      final cover = v1api.Cover.fromJson(_coverViewJson()['cover'] as Map<String, dynamic>);

      const preset = v1api.CoverTextPresetOption(id: 'heading', label: 'Заголовок', sampleText: 'Ваш заголовок', font: 'prata', weight: 400, size: 0.085, lineHeight: 1.1, h: 0.14);
      final textLayer = CoverDesignerLogic.newTextLayer(const [], preset, safe, '#1F1A17');
      expect(textLayer.kind, 'text');
      expect(textLayer.style?.font, 'prata');

      const doubleFrame = v1api.CoverShapeOption(id: 'double', label: 'Двойная рамка', outlineOnly: true, supportsRadius: true, svg: _sampleShapeSvg);
      final frameLayer = CoverDesignerLogic.newShapeLayer([textLayer], doubleFrame, safe, board, '#B8925A');
      expect(frameLayer.kind, 'shape');
      expect(frameLayer.shape, 'double');
      expect(frameLayer.stroke, '#B8925A');
      expect(frameLayer.fill, isNull);

      const decorOpt = v1api.CoverDecorOption(id: 'laurel', label: 'Лавровый венок', aspect: 1.5, svg: _sampleDecorSvg);
      final decorLayer = CoverDesignerLogic.newDecorLayer([textLayer, frameLayer], decorOpt, safe, board, '#B8925A');
      expect(decorLayer.kind, 'decor');
      expect(decorLayer.motif, 'laurel');

      // Перемещение по Z и выравнивание
      final reordered = CoverDesignerLogic.moveZ([textLayer, frameLayer, decorLayer], textLayer.id, 'front');
      expect(reordered.last.id, textLayer.id);

      final aligned = CoverDesignerLogic.alignLayer(textLayer, 'left', safe);
      expect(aligned.x, safe.x);

      // Проверка выхода текста за безопасную зону
      final edgeText = CoverDesignerLogic.copyLayer(textLayer, x: 0.0);
      final unsafe = CoverDesignerLogic.unsafeTextLayers([edgeText, frameLayer], safe, cover, board);
      expect(unsafe.map((l) => l.id), [edgeText.id]);

      // DPI и зеркальный угол градиента
      expect(CoverDesignerLogic.effectiveDpi(2400, 1800, 100, 75, 1), greaterThan(300));
      expect(CoverDesignerLogic.mirrorAngle(120), 60);
    });
  });

  group('CoverScreen + CoverDesignerView', () {
    testWidgets('переключается в нативный конструктор, добавляет текст и декоративную рамку, применяет макет, сохраняет и сбрасывает', (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final calls = <String>[];
      var state = _coverViewJson();

      final mockClient = MockClient((req) async {
        calls.add('${req.method} ${req.url.path}');
        if (req.method == 'POST' && req.url.path.endsWith('/cover/design/init')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          if (body['side'] == 'front') {
            final isLayout = body['layoutId'] == 'premium-deco';
            state = _coverViewJson(
              hasDesign: true,
              coverDesign: {
                'v': 1,
                'background': isLayout ? {'kind': 'color', 'color': '#1F1A17'} : {'kind': 'template'},
                'layers': [
                  {
                    'id': 'title',
                    'kind': 'text',
                    'bind': 'title',
                    'text': '',
                    'x': 0.1,
                    'y': 0.35,
                    'w': 0.8,
                    'h': 0.14,
                    'style': {'font': 'prata', 'weight': 400, 'size': 0.085, 'color': '#F3D9A4', 'align': 'center', 'valign': 'middle'},
                  },
                ],
              },
            );
          } else {
            state = _coverViewJson(
              hasDesign: state['cover']['hasDesign'] as bool,
              coverDesign: state['cover']['coverDesign'] as Map<String, dynamic>?,
              hasBackDesign: true,
              coverBack: {
                'v': 1,
                'background': {'kind': 'template'},
                'layers': [
                  {
                    'id': 'bt0',
                    'kind': 'text',
                    'text': 'С любовью',
                    'x': 0.1,
                    'y': 0.4,
                    'w': 0.8,
                    'h': 0.1,
                    'style': {'font': 'cormorant', 'weight': 400, 'size': 0.04, 'color': '#1F1A17', 'align': 'center', 'valign': 'middle'},
                  },
                ],
              },
            );
          }
          return http.Response(jsonEncode(state), 200, headers: {'content-type': 'application/json'});
        }
        if (req.method == 'PUT' && req.url.path.endsWith('/cover/design')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          if (body.containsKey('coverDesign')) {
            state = _coverViewJson(
              hasDesign: body['coverDesign'] != null,
              coverDesign: body['coverDesign'] as Map<String, dynamic>?,
              hasBackDesign: state['cover']['hasBackDesign'] as bool,
              coverBack: state['cover']['coverBack'] as Map<String, dynamic>?,
            );
          }
          return http.Response(jsonEncode(state), 200, headers: {'content-type': 'application/json'});
        }
        if (req.method == 'POST' && req.url.path.endsWith('/cover/design/reset')) {
          state = _coverViewJson(hasDesign: false, coverDesign: null);
          return http.Response(jsonEncode(state), 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(jsonEncode(state), 200, headers: {'content-type': 'application/json'});
      });

      final api = v1api.MybookApi(baseUrl: 'http://127.0.0.1', client: mockClient);
      final backend = _FakeBackend(
        api,
        () async => v1api.CoverView.fromJson(state),
        (patch) async {
          calls.add('PATCH /cover');
          state = _coverViewJson(lines: patch.coverLines ?? (state['cover']['lines'] as bool));
          return v1api.CoverView.fromJson(state);
        },
      );
      final session = _FakeSession(backend);

      await tester.pumpWidget(
        ChangeNotifierProvider<ClientSession>.value(
          value: session,
          child: MaterialApp(
            theme: buildTheme(Brightness.light, client: true),
            home: CoverScreen(hub: _fakeHub()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 1. В шаблонном режиме видны переключатели режимов и сторон с сервера
      expect(find.text('Готовые дизайны'), findsOneWidget);
      expect(find.text('Конструктор'), findsOneWidget);
      expect(find.text('Лицо'), findsOneWidget);
      expect(find.text('Оборот'), findsOneWidget);

      // 2. Вкладка «Текст» содержит переключатель «Декоративные линии»
      await tester.ensureVisible(find.text('Текст'));
      await tester.tap(find.text('Текст'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Декоративные линии'), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text('Декоративные линии'), findsOneWidget);

      // 3. Возвращаемся вверх и переходим в нативный «Конструктор» → вызывается coverDesignInit
      await tester.scrollUntilVisible(find.text('Конструктор'), -300, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('Конструктор'));
      await tester.pumpAndSettle();
      expect(calls, contains('POST /api/v1/books/$_bookId/cover/design/init'));
      expect(find.text('Добавить'), findsOneWidget);
      expect(find.text('Свойства'), findsOneWidget);
      expect(find.text('Слои'), findsOneWidget);
      expect(find.text('Макеты'), findsOneWidget);
      expect(find.text('Фон'), findsOneWidget);

      // 4. Добавляем декоративную рамку («Двойная рамка») из вкладки «Добавить» → сохраняется через PUT /cover/design
      await tester.scrollUntilVisible(find.text('Двойная рамка'), 200, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(find.text('Двойная рамка'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Двойная рамка'));
      await tester.pumpAndSettle();
      expect(calls, contains('PUT /api/v1/books/$_bookId/cover/design'));
      expect((state['cover']['coverDesign']['layers'] as List).length, 2);

      // 5. Undo возвращает к 1 слою
      await tester.scrollUntilVisible(find.byIcon(LucideIcons.undo2), -300, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(find.byIcon(LucideIcons.undo2));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(LucideIcons.undo2));
      await tester.pumpAndSettle();
      expect((state['cover']['coverDesign']['layers'] as List).length, 1);

      // 6. Применяем готовый макет «Золото» во вкладке «Макеты»
      await tester.scrollUntilVisible(find.text('Макеты'), 200, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(find.text('Макеты'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Макеты'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Золото'), 200, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(find.text('Золото'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Золото'));
      await tester.pumpAndSettle();
      expect(state['cover']['coverDesign']['background']['kind'], 'color');

      // 7. Переключаем на «Оборот» прямо в конструкторе → вызывается coverDesignInit(side: back)
      await tester.scrollUntilVisible(find.text('Оборот'), -300, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(find.text('Оборот'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Оборот'));
      await tester.pumpAndSettle();
      expect(state['cover']['hasBackDesign'], isTrue);

      // 8. Возвращаемся на «Лицо» и сбрасываем конструктор обратно к шаблону через диалог подтверждения
      await tester.ensureVisible(find.text('Лицо'));
      await tester.tap(find.text('Лицо'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byIcon(LucideIcons.rotateCcw), 200, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(find.byIcon(LucideIcons.rotateCcw));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(LucideIcons.rotateCcw));
      await tester.pumpAndSettle();
      expect(find.text('Вернуться к обложке шаблона'), findsWidgets);
      await tester.tap(find.widgetWithText(FilledButton, 'Вернуться к обложке шаблона'));
      await tester.pumpAndSettle();
      expect(calls, contains('POST /api/v1/books/$_bookId/cover/design/reset'));
      expect(state['cover']['hasDesign'], isFalse);
    });
  });
}
