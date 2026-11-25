import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mybooks_seller/api/mybook_api.g.dart' as v1api;
import 'package:mybooks_seller/client/data/backend.dart';
import 'package:mybooks_seller/client/data/models.dart';
import 'package:mybooks_seller/client/data/session.dart';
import 'package:mybooks_seller/client/data/stores.dart';
import 'package:mybooks_seller/client/screens/answer_media_sheet.dart';
import 'package:mybooks_seller/client/screens/answer_screen.dart';
import 'package:mybooks_seller/core/api.dart';
import 'package:mybooks_seller/ui/tokens.dart';
import 'package:provider/provider.dart';

const _bookId = '3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c';
const _questionId = '8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d';
const _fileId = '11111111-1111-4111-8111-111111111111';
const _purchaseId = '33333333-3333-4333-8333-333333333333';
const _invoiceId = '44444444-4444-4444-8444-444444444444';
const _qrSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="#FFFFFF"/><path d="M10,10h20v20h-20z" fill="#141414"/></svg>';

Map<String, dynamic> _labelsJson() => {
      'add': 'Видео или музыка',
      'addTitle': 'Добавить QR-код к видео, аудио или музыке',
      'title': 'Видео, аудио и музыка по QR-коду',
      'intro': 'Загрузите своё видео или голосовое — или вставьте ссылку.',
      'howTo': 'Пожелания близких: вставьте ссылку на YouTube.',
      'urlLabel': 'Ссылка на YouTube или другое видео',
      'urlPlaceholder': 'https://youtu.be/…',
      'submit': 'Добавить',
      'cancel': 'Отмена',
      'badUrl': 'Это не похоже на ссылку.',
      'limitReached': 'В один ответ — не больше 8 QR-кодов',
      'duplicate': 'Эта ссылка уже есть в ответе',
      'kind': 'Что это',
      'kinds': {'video': 'Видео', 'music': 'Музыка', 'audio': 'Аудио'},
      'caption': 'Подпись в книге',
      'captionPlaceholder': {'video': 'Например: Пожелание', 'music': 'Например: Кюй', 'audio': 'Например: Голос'},
      'place': 'Место в тексте',
      'open': 'Проверить ссылку',
      'openFile': 'Открыть страницу файла',
      'remove': 'Убрать',
      'printNote': 'QR-код печатается размером около 2 см.',
      'upload': {
        'button': 'Загрузить видео или аудио',
        'hint': 'Видео до 10 минут, аудио — до 30 минут.',
        'orLink': 'или вставьте ссылку',
        'reading': 'Проверяем файл…',
        'progressTemplate': 'Загружаем… {pct}%',
        'keepOpen': 'Не закрывайте страницу, пока файл загружается.',
        'retrying': 'Связь прервалась — пробуем снова…',
        'stop': 'Остановить',
        'retry': 'Повторить',
        'notMedia': 'Это не видео и не аудио.',
        'tooBig': 'Файл больше 1 ГБ.',
        'tooLongVideo': 'Запись длиннее 10 минут.',
        'tooLongAudio': 'Запись длиннее 30 минут.',
        'needMinutes': 'В книге не хватает минут.',
        'more': 'Добавить минуты к книге',
        'featured': 'выгоднее',
        'buy': 'Купить',
        'payUnavailable': 'Оплата через Kaspi сейчас недоступна.',
        'close': 'Закрыть',
        'networkError': 'Нет связи с сервером.',
      },
      'file': {
        'queued': 'Ждёт обработки…',
        'processing': 'Сжимаем файл…',
        'wait': 'Обычно это несколько минут.',
        'reupload': 'Уберите эту карточку и загрузите файл ещё раз.',
        'removeConfirm': 'Удалить файл? Загружать его придётся заново.',
        'removeYes': 'Удалить',
        'removeNo': 'Оставить',
        'gone': 'Файл удалён.',
      },
      'kaspi': {
        'title': 'Оплата через Kaspi',
        'phoneLabel': 'Номер, к которому привязан Kaspi',
        'invoiceNote': 'Счёт придёт в приложение Kaspi.kz.',
        'sendInvoice': 'Выставить счёт в Kaspi',
        'payByQr': 'Оплатить по QR-коду',
        'sentSteps': 'Откройте Kaspi.kz и подтвердите оплату.',
        'scanQr': 'Отсканируйте QR-код в приложении Kaspi.kz.',
        'openKaspi': 'Открыть в Kaspi',
        'waiting': 'Ждём подтверждения оплаты…',
        'paid': 'Оплата получена!',
        'failed': 'Оплата не прошла.',
        'cancelled': 'Счёт отменён.',
        'expired': 'Время на оплату истекло.',
        'again': 'Выставить новый счёт',
      },
    };

Map<String, dynamic> _limitsJson({int chunkBytes = 4, int pollIntervalMs = 40, int kaspiPollIntervalMs = 40}) => {
      'maxMedia': 8,
      'titleMax': 90,
      'urlMax': 600,
      'chunkBytes': chunkBytes,
      'maxSourceBytes': 1024,
      'maxVideoSec': 600,
      'maxAudioSec': 1800,
      'maxFilesPerBook': 40,
      'pollIntervalMs': pollIntervalMs,
      'kaspiPollIntervalMs': kaspiPollIntervalMs,
      'maxRetries': 2,
      'videoExtensions': ['mp4', 'mov'],
      'audioExtensions': ['m4a', 'mp3', 'ogg'],
    };

Map<String, dynamic> _fileStateJson({
  String id = _fileId,
  String kind = 'audio',
  String status = 'ready',
  String statusLabel = 'Готово · 1:05',
  int? durationSec = 65,
  String? durationLabel = '1:05',
  String? playbackUrl = '/api/v/Ab3dE9xK2m',
  int sourceBytes = 10,
  int receivedBytes = 10,
}) =>
    {
      'id': id,
      'token': 'Ab3dE9xK2m',
      'url': 'https://mybooks.kz/v/Ab3dE9xK2m',
      'kind': kind,
      'status': status,
      'name': 'voice.m4a',
      'durationSec': durationSec,
      'durationLabel': durationLabel,
      'sourceBytes': sourceBytes,
      'receivedBytes': receivedBytes,
      'error': null,
      'statusLabel': statusLabel,
      'errorText': null,
      'poster': null,
      'playbackUrl': playbackUrl,
      'downloadUrl': playbackUrl != null ? '$playbackUrl?download=1' : null,
    };

Map<String, dynamic> _mediaStateJson({
  bool editable = true,
  List<Map<String, dynamic>>? media,
  Map<String, dynamic>? quota,
  List<Map<String, dynamic>>? packs,
  int chunkBytes = 4,
  int pollIntervalMs = 40,
  int kaspiPollIntervalMs = 40,
}) =>
    {
      'editable': editable,
      'media': media ?? [],
      'quota': quota ??
          {
            'minutes': 30,
            'usedSec': 0,
            'leftSec': 1800,
            'files': 0,
            'maxFiles': 40,
            'full': false,
            'statusText': 'Свободно в книге: 30 из 30 мин',
          },
      'packs': packs ?? [],
      'positions': [
        {'anchor': -1, 'label': 'Перед текстом'},
        {'anchor': null, 'label': 'В конце ответа'},
      ],
      'limits': _limitsJson(chunkBytes: chunkBytes, pollIntervalMs: pollIntervalMs, kaspiPollIntervalMs: kaspiPollIntervalMs),
      'labels': _labelsJson(),
    };

class _FakeBackend extends ApiBackend {
  _FakeBackend(http.Client client)
      : _v1 = v1api.MybookApi(baseUrl: 'https://mybooks.kz', token: 'tok', client: client),
        super(ApiClient(baseUrl: 'https://mybooks.kz', token: 'tok'));

  final v1api.MybookApi _v1;

  @override
  v1api.MybookApi get contract => _v1;

  @override
  Future<T> call<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on v1api.MybookApiException catch (e) {
      throw ApiException(e.status, e.message, e.code);
    }
  }

  @override
  Future<void> saveAnswer(String bookId, String questionId, String answer) async {}

  @override
  Future<({List<BookPhoto> photos, List<String> errors})> uploadPhotos(String bookId, List<File> files) async =>
      (photos: const <BookPhoto>[], errors: const <String>[]);
}

class _FakeAudioPlayer implements MediaAudioPlayer {
  final _pos = StreamController<Duration>.broadcast();
  final _dur = StreamController<Duration?>.broadcast();
  final _playing = StreamController<bool>.broadcast();
  String? lastUrl;
  bool isPlaying = false;

  @override
  Stream<Duration> get positionStream => _pos.stream;
  @override
  Stream<Duration?> get durationStream => _dur.stream;
  @override
  Stream<bool> get playingStream => _playing.stream;
  @override
  Future<void> setUrl(String url) async {
    lastUrl = url;
    _dur.add(const Duration(seconds: 65));
  }

  @override
  Future<void> play() async {
    isPlaying = true;
    _playing.add(true);
    _pos.add(const Duration(seconds: 10));
  }

  @override
  Future<void> pause() async {
    isPlaying = false;
    _playing.add(false);
  }

  @override
  Future<void> seek(Duration position) async => _pos.add(position);
  @override
  Future<void> stop() async {
    isPlaying = false;
    _playing.add(false);
  }

  @override
  Future<void> dispose() async {
    await _pos.close();
    await _dur.close();
    await _playing.close();
  }
}

class _FakeSession extends ClientSession {
  _FakeSession(this._backend);
  final ClientBackend _backend;

  @override
  ClientBackend get backend => _backend;
}

Widget _wrap(ClientBackend backend, Widget child) {
  final session = _FakeSession(backend);
  return ChangeNotifierProvider<ClientSession>.value(
    value: session,
    child: MaterialApp(
      theme: buildTheme(Brightness.light, client: true),
      home: Scaffold(body: child),
    ),
  );
}

http.Response _jsonRes(Map<String, dynamic> data, {int status = 200}) =>
    http.Response(jsonEncode(data), status, headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  testWidgets('список QR-медиа, опрос обработки processing → ready, воспроизведение аудио и показ QR', (tester) async {
    var pollCount = 0;
    var state = _mediaStateJson(
      media: [
        {
          'id': 'm1',
          'kind': 'audio',
          'url': 'https://mybooks.kz/v/Ab3dE9xK2m',
          'fileId': _fileId,
          'title': 'Голос бабушки',
          'anchor': null,
          'source': 'MyBooks',
          'qrSvg': _qrSvg,
          'thumbUrl': null,
          'playbackUrl': null,
          'file': _fileStateJson(status: 'processing', statusLabel: 'Сжимаем файл…', playbackUrl: null),
        },
      ],
    );

    final client = MockClient((req) async {
      if (req.method == 'GET' && req.url.path.endsWith('/media')) {
        return _jsonRes(state);
      }
      if (req.method == 'GET' && req.url.path.endsWith('/files/$_fileId')) {
        pollCount++;
        final readyFile = _fileStateJson(status: 'ready', statusLabel: 'Готово · 1:05', playbackUrl: '/api/v/Ab3dE9xK2m');
        state = _mediaStateJson(
          media: [
            {
              'id': 'm1',
              'kind': 'audio',
              'url': 'https://mybooks.kz/v/Ab3dE9xK2m',
              'fileId': _fileId,
              'title': 'Голос бабушки',
              'anchor': null,
              'source': 'MyBooks',
              'qrSvg': _qrSvg,
              'thumbUrl': null,
              'playbackUrl': '/api/v/Ab3dE9xK2m',
              'file': readyFile,
            },
          ],
        );
        return _jsonRes({'file': readyFile, 'quota': state['quota']});
      }
      return _jsonRes({'error': 'unexpected ${req.method} ${req.url.path}'}, status: 500);
    });

    final player = _FakeAudioPlayer();
    final opened = <String>[];
    await tester.pumpWidget(
      _wrap(
        _FakeBackend(client),
        AnswerMediaSheet(
          bookId: _bookId,
          questionId: _questionId,
          openUrl: (u) async => opened.add(u),
          audioPlayerFactory: () => player,
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Сжимаем файл…'), findsOneWidget);

    // После интервала опроса файл становится ready и появляется встроенный плеер.
    await tester.pump(const Duration(milliseconds: 60));
    await tester.pump();
    expect(pollCount, greaterThanOrEqualTo(1));
    expect(find.text('Готово · 1:05'), findsOneWidget);

    // Воспроизведение аудио по кнопке Play.
    await tester.tap(find.byIcon(LucideIcons.play));
    await tester.pump();
    expect(player.isPlaying, isTrue);
    expect(player.lastUrl, 'https://mybooks.kz/api/v/Ab3dE9xK2m');
  });

  testWidgets('чанковая загрузка видео с телефона, валидация файла и удаление с подтверждением', (tester) async {
    final offsets = <int>[];
    var finished = false;
    var deleted = false;
    var state = _mediaStateJson(chunkBytes: 4, pollIntervalMs: 5000);

    final client = MockClient((req) async {
      if (req.method == 'GET' && req.url.path.endsWith('/media')) return _jsonRes(state);
      if (req.method == 'POST' && req.url.path.endsWith('/files')) {
        return _jsonRes({
          'file': _fileStateJson(kind: 'video', status: 'uploading', statusLabel: 'Загружаем… 0%', sourceBytes: 10, receivedBytes: 0, playbackUrl: null),
          'chunkBytes': 4,
        });
      }
      if (req.method == 'PUT' && req.url.path.endsWith('/files/$_fileId/chunk')) {
        final offset = int.parse(req.url.queryParameters['offset']!);
        offsets.add(offset);
        final next = (offset + 4).clamp(0, 10);
        return _jsonRes({'received': next});
      }
      if (req.method == 'POST' && req.url.path.endsWith('/files/$_fileId/finish')) {
        finished = true;
        final queued = _fileStateJson(kind: 'video', status: 'queued', statusLabel: 'Ждёт обработки…', sourceBytes: 10, receivedBytes: 10, playbackUrl: null);
        return _jsonRes({'file': queued, 'quota': state['quota']});
      }
      if (req.method == 'PUT' && req.url.path.endsWith('/media')) {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        final list = (body['media'] as List).cast<Map<String, dynamic>>();
        state = _mediaStateJson(
          chunkBytes: 4,
          pollIntervalMs: 5000,
          media: [
            for (final m in list)
              {
                ...m,
                'source': 'MyBooks',
                'qrSvg': _qrSvg,
                'thumbUrl': null,
                'playbackUrl': null,
                'file': _fileStateJson(kind: 'video', status: 'queued', statusLabel: 'Ждёт обработки…', playbackUrl: null),
              },
          ],
        );
        return _jsonRes(state);
      }
      if (req.method == 'DELETE' && req.url.path.endsWith('/files/$_fileId')) {
        deleted = true;
        return _jsonRes({'ok': true});
      }
      return _jsonRes({'error': 'unexpected'}, status: 500);
    });

    await tester.pumpWidget(
      _wrap(
        _FakeBackend(client),
        AnswerMediaSheet(
          bookId: _bookId,
          questionId: _questionId,
          pickFile: (_) async => PickedMediaFile.fromBytes(
            name: 'clip.mp4',
            bytes: Uint8List.fromList(List.generate(10, (i) => i)),
            mime: 'video/mp4',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Загрузить видео или аудио'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump();

    // Файл 10 байт с чанком 4 байта ушёл тремя кусками (0, 4, 8), завершился и прикрепился к ответу.
    expect(offsets, [0, 4, 8]);
    expect(finished, isTrue);
    expect(find.text('Ждёт обработки…'), findsOneWidget);

    // Удаление своего файла требует подтверждения, затем удаляет и файл, и карточку.
    await tester.tap(find.byTooltip('Убрать'));
    await tester.pump();
    expect(find.text('Удалить файл? Загружать его придётся заново.'), findsOneWidget);

    await tester.tap(find.text('Удалить'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(deleted, isTrue);
    expect(find.text('Ждёт обработки…'), findsNothing);
  });

  testWidgets('исчерпан лимит минут: показывает пакеты, оплачивает через Kaspi QR и обновляет квоту', (tester) async {
    var paid = false;
    var state = _mediaStateJson(
      quota: {'minutes': 30, 'usedSec': 1800, 'leftSec': 0, 'files': 2, 'maxFiles': 40, 'full': true, 'statusText': 'Все 30 минут заняты.'},
      packs: [
        {'id': 'm60', 'minutes': 60, 'price': 3900, 'featured': true, 'minutesLabel': '+60 минут', 'priceLabel': '3 900 ₸', 'perMinuteLabel': '65 ₸ за минуту'},
      ],
    );

    final client = MockClient((req) async {
      if (req.method == 'GET' && req.url.path.endsWith('/media')) return _jsonRes(state);
      if (req.method == 'POST' && req.url.path.endsWith('/files/packs')) {
        return _jsonRes({
          'purchase': {
            'id': _purchaseId,
            'number': 7,
            'minutes': 60,
            'amount': 3900,
            'amountLabel': '3 900 ₸',
            'title': '+60 минут для видео и аудио',
            'note': 'Комментарий к оплате — MyBooks M7',
            'paidToast': 'Готово: книге добавлено 60 минут',
          },
          'kaspi': {'defaultPhone': '+77011234567', 'current': null},
        });
      }
      if (req.method == 'POST' && req.url.path.endsWith('/files/packs/$_purchaseId/kaspi')) {
        return _jsonRes({
          'invoice': {'id': _invoiceId, 'method': 'qr', 'status': 'pending', 'amount': 3900, 'phone': null, 'link': 'https://kaspi.kz/pay/1', 'qrSvg': _qrSvg, 'expiresAt': null, 'paidAt': null},
        });
      }
      if (req.method == 'GET' && req.url.path.endsWith('/files/packs/$_purchaseId/kaspi/$_invoiceId')) {
        paid = true;
        state = _mediaStateJson(
          quota: {'minutes': 90, 'usedSec': 1800, 'leftSec': 3600, 'files': 2, 'maxFiles': 40, 'full': false, 'statusText': 'Свободно в книге: 60 из 90 мин'},
          packs: [],
        );
        return _jsonRes({
          'invoice': {'id': _invoiceId, 'method': 'qr', 'status': 'paid', 'amount': 3900, 'phone': null, 'link': null, 'qrSvg': null, 'expiresAt': null, 'paidAt': null},
          'quota': state['quota'],
        });
      }
      return _jsonRes({'error': 'unexpected'}, status: 500);
    });

    await tester.pumpWidget(
      _wrap(_FakeBackend(client), AnswerMediaSheet(bookId: _bookId, questionId: _questionId, openUrl: (_) async {})),
    );
    await tester.pumpAndSettle();

    expect(find.text('Добавить минуты к книге'), findsOneWidget);
    expect(find.text('+60 минут'), findsOneWidget);

    await tester.tap(find.text('Купить'));
    await tester.pumpAndSettle();
    expect(find.text('+60 минут для видео и аудио'), findsOneWidget);

    await tester.tap(find.text('Оплатить по QR-коду'));
    await tester.pump();
    expect(find.text('Отсканируйте QR-код в приложении Kaspi.kz.'), findsOneWidget);

    // Опрос подтверждает оплату, закрывает лист и обновляет квоту книги.
    await tester.pump(const Duration(milliseconds: 60));
    await tester.pumpAndSettle();
    expect(paid, isTrue);
    expect(find.text('Свободно в книге: 60 из 90 мин'), findsOneWidget);
  });

  testWidgets('заказанная книга (editable: false): показывает QR-карточку, но скрывает загрузку и удаление', (tester) async {
    final state = _mediaStateJson(
      editable: false,
      media: [
        {
          'id': 'm1',
          'kind': 'video',
          'url': 'https://youtu.be/dQw4w9WgXcQ',
          'fileId': null,
          'title': 'Пожелание семьи',
          'anchor': null,
          'source': 'YouTube',
          'qrSvg': _qrSvg,
          'thumbUrl': null,
          'playbackUrl': null,
          'file': null,
        },
      ],
    );
    final client = MockClient((_) async => _jsonRes(state));

    await tester.pumpWidget(_wrap(_FakeBackend(client), AnswerMediaSheet(bookId: _bookId, questionId: _questionId)));
    await tester.pumpAndSettle();

    expect(find.text('Пожелание семьи'), findsOneWidget);
    expect(find.text('Загрузить видео или аудио'), findsNothing);
    expect(find.byTooltip('Убрать'), findsNothing);
  });

  testWidgets('AnswerScreen показывает секцию QR-медиа и кнопку в нижней панели', (tester) async {
    final state = _mediaStateJson(
      media: [
        {
          'id': 'm1',
          'kind': 'audio',
          'url': 'https://mybooks.kz/v/Ab3dE9xK2m',
          'fileId': _fileId,
          'title': 'Тост дедушки',
          'anchor': null,
          'source': 'MyBooks',
          'qrSvg': _qrSvg,
          'thumbUrl': null,
          'playbackUrl': '/api/v/Ab3dE9xK2m',
          'file': _fileStateJson(),
        },
      ],
    );
    final client = MockClient((_) async => _jsonRes(state));
    final backend = _FakeBackend(client);
    final store = BookStore(backend, _bookId)
      ..book = BookModel(
        id: _bookId,
        title: 'Книга',
        status: 'draft',
        chapters: const [Chapter(key: 'ch1', title: 'Детство')],
        questions: [
          Question(id: _questionId, chapter: 'ch1', prompt: 'Ваш вопрос?', title: 'Ваш вопрос?', answer: 'Мой ответ'),
        ],
        photos: const [],
        maxPhotos: 100,
      );

    await tester.pumpWidget(_wrap(backend, AnswerScreen(store: store, questionId: _questionId)));
    await tester.pumpAndSettle();

    expect(find.text('Видео, аудио и музыка по QR-коду'), findsOneWidget);
    expect(find.text('Тост дедушки'), findsOneWidget);
    expect(find.byTooltip('Добавить QR-код к видео, аудио или музыке'), findsOneWidget);
  });
}
