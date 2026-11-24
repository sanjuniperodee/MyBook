import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import 'models.dart';

/// Откуда клиентское приложение берёт данные. Экраны знают только этот интерфейс; на сервере — контракт API v1.
abstract class ClientBackend {
  Future<({String token, ClientUser user})> login(
    String login,
    String password,
  );
  Future<ClientUser> me();
  Future<void> logout();
  Future<List<BookSummary>> books();

  /// Полка «Мои книги» — модель экрана сайта (подписи, сроки, заказ, обложки).
  Future<v1api.CabinetShelf> shelf();

  /// Штаб книги — модель страницы книги сайта.
  Future<v1api.CabinetBook> hub(String bookId);

  /// Вкладка «Фото» — модель страницы фото сайта: места, итоги, фильтры, лист «Где стоит фото».
  Future<v1api.CabinetPhotos> photosTab(String bookId);

  /// Правка фото (место, подпись, вид на странице). Ключи с null — явно сбросить (убрать из ответа, «встанет само»).
  Future<void> updatePhoto(String bookId, String photoId, Map<String, Object?> patch);

  Future<void> deletePhoto(String bookId, String photoId);

  /// Помощник по книге: беседа и подсказки (section — раздел кабинета для частых вопросов), вопрос.
  Future<v1api.CabinetHelp> help(String bookId, String section);

  // ── Новая книга (мастер) и голос → текст ──
  Future<v1api.BookWizard> wizard();
  Future<String?> wizardDeadline(String occasion, String date);
  Future<String> createBook(v1api.CreateBookBody body);

  /// Голос → текст для ответа: запись на языке книги (m4a), ответ — распознанный текст.
  Future<String> dictate(String bookId, File audio);

  // ── Обложка (режим «Шаблон») ──
  Future<v1api.CoverView> cover(String bookId);
  Future<v1api.CoverView> updateCover(String bookId, v1api.CoverPatch patch);

  // ── Макет книги (экранная сборка) ──
  Future<v1api.BuildState> build(String bookId, {bool retry = false});
  Future<v1api.BuildProgress> buildProgress(String bookId);

  /// Объёмная модель книги для 3D-книги (размеры, развёртка обложки, ракурсы, подписи — всё с сервера).
  Future<v1api.BookModel> bookModel(String bookId, int pages);

  // ── Заказ и оплата ──
  Future<v1api.CabinetCheckout> checkout(String bookId);
  Future<v1api.CheckoutQuote> quote(String bookId, v1api.CheckoutQuoteBody body);
  Future<String> placeOrder(String bookId, v1api.OrderPlaceBody body);
  Future<v1api.CabinetOrders> orders();
  Future<v1api.CabinetOrder> order(String orderId);
  Future<v1api.KaspiInvoice> kaspiPay(String orderId, String method, String phone);
  Future<v1api.KaspiInvoice> kaspiStatus(String orderId, String invoiceId);
  Future<void> claimPayment(String orderId);
  Future<void> cancelOrder(String orderId);
  Future<v1api.HelpAnswer> askHelp(String bookId, String text, {bool human = false});

  /// Полный адрес своего ресурса (обложка, фото) и заголовки для картинок (токен автора).
  String url(String path);
  Map<String, String> get imageHeaders;
  Future<BookModel> book(String id);

  /// Автосохранение ответа (как редактор кабинета: `PATCH /api/books/{id}/questions/{qid}`).
  Future<void> saveAnswer(String bookId, String questionId, String answer);

  /// Загрузка фото в книгу (`POST /api/books/{id}/photos`, поле files): новые фото и тексты ошибок по файлам.
  Future<({List<BookPhoto> photos, List<String> errors})> uploadPhotos(
    String bookId,
    List<File> files,
  );

  /// Картинка фото: адрес и заголовки (фото книги — только автору, по токену).
  ({String url, Map<String, String> headers}) photo(
    String photoId, {
    bool full = false,
  });
}

/// Сервер MyBooks: контракт API v1 (сгенерированный клиент lib/api/mybook_api.g.dart, ADR 0012); загрузка фото — пока
/// маршрутом кабинета (в контракте её ещё нет).
class ApiBackend implements ClientBackend {
  ApiBackend(this.api) : v1 = v1api.MybookApi(baseUrl: api.baseUrl);
  final ApiClient api;
  final v1api.MybookApi v1;

  Map<String, String> get _auth =>
      api.token == null ? const {} : {'Authorization': 'Bearer ${api.token}'};

  /// Ошибки контракта — в те же ApiException, что ждут экраны (401 — выход, 0 — нет сети).
  Future<T> _call<T>(Future<T> Function() run) async {
    v1.token = api.token;
    try {
      return await run();
    } on v1api.MybookApiException catch (e) {
      if (e.status == 401 && api.token != null) api.onUnauthorized?.call();
      throw ApiException(e.status, e.message, e.code);
    } on SocketException {
      throw ApiException(0, 'Нет связи с сервером. Проверьте интернет.');
    } on http.ClientException {
      throw ApiException(0, 'Нет связи с сервером. Проверьте интернет.');
    }
  }

  static ClientUser _user(v1api.User u) =>
      ClientUser(id: u.id, name: u.name, phone: u.phone ?? u.email);

  @override
  Future<({String token, ClientUser user})> login(
    String login,
    String password,
  ) => _call(() async {
    final r = await v1.authLogin(
      body: v1api.LoginBody(login: login, password: password),
    );
    final s = r.session;
    if (s == null)
      throw ApiException(
        403,
        'У аккаунта включён вход с кодом — войдите на сайте mybooks.kz',
      );
    if (s.user.isStaff)
      throw ApiException(
        403,
        'Это аккаунт сотрудника — для него приложение MyBooks CRM',
      );
    return (token: s.token, user: _user(s.user));
  });

  @override
  Future<ClientUser> me() => _call(() async => _user(await v1.me()));

  @override
  Future<void> logout() => _call(() async {
    await v1.authLogout();
  });

  @override
  Future<List<BookSummary>> books() => _call(
    () async => [
      for (final b in (await v1.booksList()).books)
        BookSummary(
          id: b.id,
          title: b.title,
          status: b.status,
          answered: b.answered,
          questions: b.total,
          photos: b.photos,
          updatedAt: DateTime.tryParse(b.updatedAt),
        ),
    ],
  );

  @override
  Future<v1api.CabinetShelf> shelf() => _call(() => v1.cabinetShelf());

  @override
  Future<v1api.CabinetBook> hub(String bookId) =>
      _call(() => v1.cabinetBook(bookId: bookId));

  @override
  Future<v1api.CabinetPhotos> photosTab(String bookId) => _call(() => v1.cabinetPhotos(bookId: bookId));

  @override
  Future<v1api.BookWizard> wizard() => _call(() => v1.bookWizard());

  @override
  Future<String?> wizardDeadline(String occasion, String date) => _call(() async => (await v1.wizardDeadline(occasion: occasion, date: date)).text);

  @override
  Future<String> createBook(v1api.CreateBookBody body) => _call(() async => (await v1.bookCreate(body: body)).id);

  @override
  Future<String> dictate(String bookId, File audio) => _call(() async {
        final part = await http.MultipartFile.fromPath('audio', audio.path, filename: audio.uri.pathSegments.last, contentType: MediaType.parse('audio/mp4'));
        return (await v1.answerDictate(bookId: bookId, files: [part])).text;
      });

  @override
  Future<v1api.CoverView> cover(String bookId) => _call(() => v1.coverGet(bookId: bookId));

  @override
  Future<v1api.CoverView> updateCover(String bookId, v1api.CoverPatch patch) => _call(() => v1.coverUpdate(bookId: bookId, body: patch));

  @override
  Future<v1api.BuildState> build(String bookId, {bool retry = false}) => _call(() => v1.bookBuild(bookId: bookId, retry: retry ? '1' : null));

  @override
  Future<v1api.BuildProgress> buildProgress(String bookId) => _call(() => v1.bookBuildProgress(bookId: bookId));

  @override
  Future<v1api.BookModel> bookModel(String bookId, int pages) => _call(() => v1.bookModel(bookId: bookId, pages: pages));

  @override
  Future<v1api.CabinetCheckout> checkout(String bookId) => _call(() => v1.cabinetCheckout(bookId: bookId));

  @override
  Future<v1api.CheckoutQuote> quote(String bookId, v1api.CheckoutQuoteBody body) => _call(() => v1.cabinetCheckoutQuote(bookId: bookId, body: body));

  @override
  Future<String> placeOrder(String bookId, v1api.OrderPlaceBody body) => _call(() async => (await v1.cabinetOrderPlace(bookId: bookId, body: body)).orderId);

  @override
  Future<v1api.CabinetOrders> orders() => _call(() => v1.cabinetOrders());

  @override
  Future<v1api.CabinetOrder> order(String orderId) => _call(() => v1.cabinetOrder(orderId: orderId));

  @override
  Future<v1api.KaspiInvoice> kaspiPay(String orderId, String method, String phone) => _call(() async => (await v1.cabinetOrderKaspi(orderId: orderId, body: v1api.KaspiPayBody(method: method, phone: phone))).invoice);

  @override
  Future<v1api.KaspiInvoice> kaspiStatus(String orderId, String invoiceId) => _call(() async => (await v1.cabinetOrderKaspiStatus(orderId: orderId, invoiceId: invoiceId)).invoice);

  @override
  Future<void> claimPayment(String orderId) => _call(() async {
        await v1.cabinetOrderClaim(orderId: orderId);
      });

  @override
  Future<void> cancelOrder(String orderId) => _call(() async {
        await v1.cabinetOrderCancel(orderId: orderId);
      });

  @override
  Future<v1api.CabinetHelp> help(String bookId, String section) => _call(() => v1.cabinetHelp(bookId: bookId, section: section));

  @override
  Future<v1api.HelpAnswer> askHelp(String bookId, String text, {bool human = false}) => _call(() => v1.cabinetHelpAsk(bookId: bookId, body: v1api.HelpAskBody(text: text, human: human)));

  // Ключи со значением null — явный сброс (nulls у сгенерированной модели): убрать из ответа, «встанет само».
  @override
  Future<void> updatePhoto(String bookId, String photoId, Map<String, Object?> patch) => _call(() async {
        final body = v1api.PhotoPatch(
          caption: patch['caption'] as String?,
          layout: patch['layout'] as String?,
          questionId: patch['questionId'] as String?,
          chapter: patch['chapter'] as String?,
          opener: patch['opener'] as bool?,
          nulls: {for (final e in patch.entries) if (e.value == null) e.key},
        );
        await v1.photoUpdate(bookId: bookId, photoId: photoId, body: body);
      });

  @override
  Future<void> deletePhoto(String bookId, String photoId) => _call(() async {
        await v1.photoDelete(bookId: bookId, photoId: photoId);
      });

  @override
  String url(String path) => path.startsWith('http')
      ? path
      : '${api.baseUrl.replaceAll(RegExp(r'/+$'), '')}$path';

  @override
  Map<String, String> get imageHeaders => _auth;

  @override
  Future<BookModel> book(String id) => _call(() async {
    final e = await v1.bookEditor(bookId: id);
    return BookModel(
      id: e.book.id,
      title: e.book.title,
      // editable — право автора (черновик и его книга); экраны смотрят на status.
      status: e.editable
          ? 'draft'
          : (e.book.status == 'draft' ? 'readonly' : e.book.status),
      chapters: [
        for (final c in e.chapters) Chapter(key: c.key, title: c.title),
      ],
      questions: [
        for (final q in e.questions)
          Question(
            id: q.id,
            chapter: q.chapter,
            prompt: q.prompt,
            hint: q.hint,
            title: q.defaultTitle,
            answer: q.answer,
          ),
      ],
      photos: <BookPhoto>[],
      maxPhotos: 100,
    );
  });

  @override
  Future<void> saveAnswer(String bookId, String questionId, String answer) =>
      _call(() async {
        await v1.questionSave(
          bookId: bookId,
          questionId: questionId,
          body: v1api.QuestionPatch(answer: answer),
        );
      });

  @override
  Future<({List<BookPhoto> photos, List<String> errors})> uploadPhotos(String bookId, List<File> files) => _call(() async {
        final parts = [
          for (final f in files) await http.MultipartFile.fromPath('files', f.path, filename: f.uri.pathSegments.last, contentType: MediaType.parse(_mime(f.path))),
        ];
        final r = await v1.photoUpload(bookId: bookId, files: parts);
        return (
          photos: [for (final p in r.photos) BookPhoto(id: p.id, width: p.width, height: p.height, caption: p.caption, questionId: p.questionId)],
          errors: r.errors,
        );
      });

  @override
  ({String url, Map<String, String> headers}) photo(
    String photoId, {
    bool full = false,
  }) => (
    url: api.uri('/api/photos/$photoId', {
      'size': full ? 'view' : null,
    }).toString(),
    headers: _auth,
  );

  static String _mime(String path) {
    final p = path.toLowerCase();
    if (p.endsWith('.png')) return 'image/png';
    if (p.endsWith('.heic') || p.endsWith('.heif')) return 'image/heic';
    if (p.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}
