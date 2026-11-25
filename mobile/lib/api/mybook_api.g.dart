// Сгенерировано scripts/contracts/generate.ts из packages/contracts (API v1, ADR 0012). Не править руками.
// ignore_for_file: type=lint
import 'dart:convert';

import 'package:http/http.dart' as http;

/// Ошибка API: статус, текст для экрана (на языке пользователя) и стабильный код.
class MybookApiException implements Exception {
  final int status;
  final String? code;
  final String message;
  const MybookApiException(this.status, this.code, this.message);
  @override
  String toString() => 'MybookApiException($status, $code): $message';
}

/// Клиент API v1. token — сессия из authLogin / authSecondFactor (Authorization: Bearer).
class MybookApi {
  final String baseUrl;
  String? token;
  final http.Client _http;

  MybookApi({required this.baseUrl, this.token, http.Client? client}) : _http = client ?? http.Client();

  Future<dynamic> _send(String method, String path, {Object? body, Map<String, String>? query}) async {
    final uri = Uri.parse(baseUrl + path).replace(queryParameters: query == null || query.isEmpty ? null : query);
    final request = http.Request(method, uri);
    request.headers['accept'] = 'application/json';
    if (token != null) request.headers['authorization'] = 'Bearer $token';
    if (body != null) {
      request.headers['content-type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    return _read(await http.Response.fromStream(await _http.send(request)));
  }

  /// Загрузка файлов (multipart/form-data): каждый файл — в поле [field]; filename у MultipartFile обязателен.
  /// Параметры запроса (query) — рядом с файлами: сумма и дата платежа к чеку и т. п.
  Future<dynamic> _sendFiles(String method, String path, String field, List<http.MultipartFile> files, {Map<String, String>? query}) async {
    final request = http.MultipartRequest(method, Uri.parse(baseUrl + path).replace(queryParameters: query == null || query.isEmpty ? null : query));
    request.headers['accept'] = 'application/json';
    if (token != null) request.headers['authorization'] = 'Bearer $token';
    for (final f in files) {
      request.files.add(f.field == field ? f : http.MultipartFile(field, f.finalize(), f.length, filename: f.filename, contentType: f.contentType));
    }
    return _read(await http.Response.fromStream(await _http.send(request)));
  }

  dynamic _read(http.Response res) {
    final text = utf8.decode(res.bodyBytes);
    final data = text.isEmpty ? null : jsonDecode(text);
    if (res.statusCode >= 400) {
      final map = data is Map<String, dynamic> ? data : const <String, dynamic>{};
      throw MybookApiException(res.statusCode, map['code'] as String?, (map['error'] as String?) ?? res.reasonPhrase ?? 'Ошибка');
    }
    return data;
  }

  /// Вход по почте или телефону и паролю (клиент и сотрудник)
  Future<LoginResult> authLogin({required LoginBody body}) async {
    final json = await _send('POST', '/api/v1/auth/login', body: body.toJson());
    return LoginResult.fromJson(json as Map<String, dynamic>);
  }

  /// Второй шаг входа сотрудника: код из приложения-аутентификатора
  Future<Session> authSecondFactor({required SecondFactorBody body}) async {
    final json = await _send('POST', '/api/v1/auth/2fa', body: body.toJson());
    return Session.fromJson(json as Map<String, dynamic>);
  }

  /// Выход: сессия токена закрывается
  Future<Ok> authLogout() async {
    final json = await _send('POST', '/api/v1/auth/logout');
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Сессия для встроенного браузера: оформление и оплата заказа на сайте (/books/{id}/checkout, /orders/{id})
  Future<WebSession> authWebSession() async {
    final json = await _send('POST', '/api/v1/auth/web-session');
    return WebSession.fromJson(json as Map<String, dynamic>);
  }

  /// Кто вошёл
  Future<User> me() async {
    final json = await _send('GET', '/api/v1/me');
    return User.fromJson(json as Map<String, dynamic>);
  }

  /// Виды книг для мастера создания (язык — ?locale=ru|kk)
  Future<ThemeList> themesList({String? locale}) async {
    final json = await _send('GET', '/api/v1/themes', query: {if (locale != null) 'locale': '${locale}'});
    return ThemeList.fromJson(json as Map<String, dynamic>);
  }

  /// Новая книга (мастер создания)
  Future<CreatedBook> bookCreate({required CreateBookBody body}) async {
    final json = await _send('POST', '/api/v1/books', body: body.toJson());
    return CreatedBook.fromJson(json as Map<String, dynamic>);
  }

  /// Мои книги с прогрессом
  Future<BookList> booksList() async {
    final json = await _send('GET', '/api/v1/books');
    return BookList.fromJson(json as Map<String, dynamic>);
  }

  /// Книга для редактора: главы, вопросы с ответами, фото
  Future<BookEditor> bookEditor({required String bookId}) async {
    final json = await _send('GET', '/api/v1/books/${Uri.encodeComponent('$bookId')}/editor');
    return BookEditor.fromJson(json as Map<String, dynamic>);
  }

  /// Автосохранение ответа и заголовка раздела (только изменённые поля)
  Future<Saved> questionSave({required String bookId, required String questionId, required QuestionPatch body}) async {
    final json = await _send('PATCH', '/api/v1/books/${Uri.encodeComponent('$bookId')}/questions/${Uri.encodeComponent('$questionId')}', body: body.toJson());
    return Saved.fromJson(json as Map<String, dynamic>);
  }

  /// Загрузка фото книги (multipart, поле files; JPEG, PNG, HEIC, WebP); лимит — maxPhotos из bookEditor
  Future<PhotoUploadResult> photoUpload({required String bookId, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/books/${Uri.encodeComponent('$bookId')}/photos', 'files', files);
    return PhotoUploadResult.fromJson(json as Map<String, dynamic>);
  }

  /// Правка фото: подпись, раскладка, место (к ответу или в альбом), кадр
  Future<PhotoSaved> photoUpdate({required String bookId, required String photoId, required PhotoPatch body}) async {
    final json = await _send('PATCH', '/api/v1/books/${Uri.encodeComponent('$bookId')}/photos/${Uri.encodeComponent('$photoId')}', body: body.toJson());
    return PhotoSaved.fromJson(json as Map<String, dynamic>);
  }

  /// Удалить фото
  Future<Ok> photoDelete({required String bookId, required String photoId}) async {
    final json = await _send('DELETE', '/api/v1/books/${Uri.encodeComponent('$bookId')}/photos/${Uri.encodeComponent('$photoId')}');
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Голос → текст для ответа: запись (multipart, поле audio; m4a/aac/ogg/webm/mp3, до 10 минут) на языке книги
  Future<DictationResult> answerDictate({required String bookId, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/books/${Uri.encodeComponent('$bookId')}/dictation', 'audio', files);
    return DictationResult.fromJson(json as Map<String, dynamic>);
  }

  /// Письма близких и приглашение
  Future<LettersView> lettersGet({required String bookId}) async {
    final json = await _send('GET', '/api/v1/books/${Uri.encodeComponent('$bookId')}/letters');
    return LettersView.fromJson(json as Map<String, dynamic>);
  }

  /// Включить или выключить приём писем по ссылке; regenerate — новая ссылка
  Future<LetterInvite> letterInviteSet({required String bookId, required LetterInviteBody body}) async {
    final json = await _send('POST', '/api/v1/books/${Uri.encodeComponent('$bookId')}/letters/invite', body: body.toJson());
    return LetterInvite.fromJson(json as Map<String, dynamic>);
  }

  /// Свой текст приглашения ('' — по умолчанию)
  Future<LetterInvite> letterInviteText({required String bookId, required LetterInviteText body}) async {
    final json = await _send('PUT', '/api/v1/books/${Uri.encodeComponent('$bookId')}/letters/invite-text', body: body.toJson());
    return LetterInvite.fromJson(json as Map<String, dynamic>);
  }

  /// Порядок писем в книге (id в нужной очерёдности)
  Future<Ok> lettersReorder({required String bookId, required LettersOrder body}) async {
    final json = await _send('PUT', '/api/v1/books/${Uri.encodeComponent('$bookId')}/letters/order', body: body.toJson());
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Правка письма: текст, подпись, в книге или скрыто
  Future<LetterSaved> letterUpdate({required String bookId, required String letterId, required LetterPatch body}) async {
    final json = await _send('PATCH', '/api/v1/books/${Uri.encodeComponent('$bookId')}/letters/${Uri.encodeComponent('$letterId')}', body: body.toJson());
    return LetterSaved.fromJson(json as Map<String, dynamic>);
  }

  /// Удалить письмо
  Future<Ok> letterDelete({required String bookId, required String letterId}) async {
    final json = await _send('DELETE', '/api/v1/books/${Uri.encodeComponent('$bookId')}/letters/${Uri.encodeComponent('$letterId')}');
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Экранная сборка книги: полосы и адреса картинок; нет — запускается (retry=1 — повтор после сбоя)
  Future<BuildState> bookBuild({required String bookId, String? retry}) async {
    final json = await _send('GET', '/api/v1/books/${Uri.encodeComponent('$bookId')}/build', query: {if (retry != null) 'retry': '${retry}'});
    return BuildState.fromJson(json as Map<String, dynamic>);
  }

  /// Ход идущей сборки (опрашивать раз в секунду)
  Future<BuildProgress> bookBuildProgress({required String bookId}) async {
    final json = await _send('GET', '/api/v1/books/${Uri.encodeComponent('$bookId')}/build/progress');
    return BuildProgress.fromJson(json as Map<String, dynamic>);
  }

  /// Отзыв к заказу: можно ли оставить и свой отзыв
  Future<ReviewView> reviewGet({required String orderId}) async {
    final json = await _send('GET', '/api/v1/orders/${Uri.encodeComponent('$orderId')}/review');
    return ReviewView.fromJson(json as Map<String, dynamic>);
  }

  /// Оставить или поправить отзыв (фото не трогает)
  Future<Review> reviewSubmit({required String orderId, required ReviewBody body}) async {
    final json = await _send('PUT', '/api/v1/orders/${Uri.encodeComponent('$orderId')}/review', body: body.toJson());
    return Review.fromJson(json as Map<String, dynamic>);
  }

  /// Фото к отзыву (multipart, поле photo; до 15 МБ) — после reviewSubmit
  Future<Review> reviewPhotoSet({required String orderId, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/orders/${Uri.encodeComponent('$orderId')}/review/photo', 'photo', files);
    return Review.fromJson(json as Map<String, dynamic>);
  }

  /// Убрать фото из отзыва
  Future<Review> reviewPhotoDelete({required String orderId}) async {
    final json = await _send('DELETE', '/api/v1/orders/${Uri.encodeComponent('$orderId')}/review/photo');
    return Review.fromJson(json as Map<String, dynamic>);
  }

  /// Обложка книги, каталог шаблонов и настроения для фильтра
  Future<CoverView> coverGet({required String bookId}) async {
    final json = await _send('GET', '/api/v1/books/${Uri.encodeComponent('$bookId')}/cover');
    return CoverView.fromJson(json as Map<String, dynamic>);
  }

  /// Правка обложки (только изменённые поля): шаблон, линии, тексты, фото
  Future<CoverView> coverUpdate({required String bookId, required CoverPatch body}) async {
    final json = await _send('PATCH', '/api/v1/books/${Uri.encodeComponent('$bookId')}/cover', body: body.toJson());
    return CoverView.fromJson(json as Map<String, dynamic>);
  }

  /// «Мой день»: плитки, план месяца, задачи, ждут ответа, пропущенные звонки
  Future<CrmToday> crmToday() async {
    final json = await _send('GET', '/api/v1/crm/today');
    return CrmToday.fromJson(json as Map<String, dynamic>);
  }

  /// Задачи: done=1 — выполненные, who (все задачи — с правом), kind, q
  Future<CrmTaskList> crmTasksList({String? done, String? who, String? kind, String? q}) async {
    final json = await _send('GET', '/api/v1/crm/tasks', query: {if (done != null) 'done': '${done}', if (who != null) 'who': '${who}', if (kind != null) 'kind': '${kind}', if (q != null) 'q': '${q}'});
    return CrmTaskList.fromJson(json as Map<String, dynamic>);
  }

  /// Журнал звонков: f=missed|all|in|out|mine, days (1–60, по умолчанию 14)
  Future<CrmCalls> crmCallsList({String? f, int? days}) async {
    final json = await _send('GET', '/api/v1/crm/calls', query: {if (f != null) 'f': '${f}', if (days != null) 'days': '${days}'});
    return CrmCalls.fromJson(json as Map<String, dynamic>);
  }

  /// Клиенты: q (имя, e-mail, телефон), sort=new|ltv|active, mine=1, page
  Future<CrmClients> crmClientsList({String? q, String? sort, String? mine, int? page}) async {
    final json = await _send('GET', '/api/v1/crm/clients', query: {if (q != null) 'q': '${q}', if (sort != null) 'sort': '${sort}', if (mine != null) 'mine': '${mine}', if (page != null) 'page': '${page}'});
    return CrmClients.fromJson(json as Map<String, dynamic>);
  }

  /// Завести клиента с доступом в кабинет, сделкой и предоплатой (как форма «Новый клиент»)
  Future<NewClientResult> crmClientCreate({required NewClientBody body}) async {
    final json = await _send('POST', '/api/v1/crm/clients', body: body.toJson());
    return NewClientResult.fromJson(json as Map<String, dynamic>);
  }

  /// Карточка клиента: деньги, книги, заказы, сделки, задачи, заметки
  Future<CrmClientCard> crmClientCard({required String clientId}) async {
    final json = await _send('GET', '/api/v1/crm/clients/${Uri.encodeComponent('$clientId')}');
    return CrmClientCard.fromJson(json as Map<String, dynamic>);
  }

  /// Правка клиента (только переданные поля)
  Future<Done> crmClientUpdate({required String clientId, required ClientPatch body}) async {
    final json = await _send('PATCH', '/api/v1/crm/clients/${Uri.encodeComponent('$clientId')}', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Сотрудники для выбора ответственного
  Future<CrmStaffList> crmStaffList() async {
    final json = await _send('GET', '/api/v1/crm/staff');
    return CrmStaffList.fromJson(json as Map<String, dynamic>);
  }

  /// Лента уведомлений сотрудника (limit, по умолчанию 60)
  Future<CrmNotifications> crmNotificationsList({int? limit}) async {
    final json = await _send('GET', '/api/v1/crm/notifications', query: {if (limit != null) 'limit': '${limit}'});
    return CrmNotifications.fromJson(json as Map<String, dynamic>);
  }

  /// Диалоги: f=open|mine|unread|waiting|closed, q — поиск
  Future<CrmChatList> crmChatsList({String? f, String? q}) async {
    final json = await _send('GET', '/api/v1/crm/chats', query: {if (f != null) 'f': '${f}', if (q != null) 'q': '${q}'});
    return CrmChatList.fromJson(json as Map<String, dynamic>);
  }

  /// Диалог: шапка, последние сообщения (limit 20–300, по умолчанию 50), права, шаблоны, сделка и счета
  Future<CrmChat> crmChatGet({required String chatId, int? limit}) async {
    final json = await _send('GET', '/api/v1/crm/chats/${Uri.encodeComponent('$chatId')}', query: {if (limit != null) 'limit': '${limit}'});
    return CrmChat.fromJson(json as Map<String, dynamic>);
  }

  /// Сообщения диалога: before (ISO) — старше, limit (10–200, по умолчанию 40)
  Future<CrmMessages> crmChatMessages({required String chatId, String? before, int? limit}) async {
    final json = await _send('GET', '/api/v1/crm/chats/${Uri.encodeComponent('$chatId')}/messages', query: {if (before != null) 'before': '${before}', if (limit != null) 'limit': '${limit}'});
    return CrmMessages.fromJson(json as Map<String, dynamic>);
  }

  /// Воронка: этапы и сделки; p — воронка, фильтры как у страницы «Сделки»: mine, a (ответственный), q, task, stale, src
  Future<CrmDeals> crmDealsList({String? p, String? mine, String? a, String? q, String? task, String? stale, String? src}) async {
    final json = await _send('GET', '/api/v1/crm/deals', query: {if (p != null) 'p': '${p}', if (mine != null) 'mine': '${mine}', if (a != null) 'a': '${a}', if (q != null) 'q': '${q}', if (task != null) 'task': '${task}', if (stale != null) 'stale': '${stale}', if (src != null) 'src': '${src}'});
    return CrmDeals.fromJson(json as Map<String, dynamic>);
  }

  /// Карточка сделки: данные, этапы, задачи, заметки, платежи, счета, чат
  Future<CrmDeal> crmDealGet({required String dealId}) async {
    final json = await _send('GET', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}');
    return CrmDeal.fromJson(json as Map<String, dynamic>);
  }

  /// Удалить сделку (с деньгами или счётом — нельзя)
  Future<Done> crmDealDelete({required String dealId}) async {
    final json = await _send('DELETE', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Правка сделки (только переданные поля)
  Future<Done> crmDealUpdate({required String dealId, required DealPatch body}) async {
    final json = await _send('PATCH', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Отметить прочитанными: id — одно, без id — все
  Future<Ok> crmNotificationsRead({required CrmNotificationsRead body}) async {
    final json = await _send('POST', '/api/v1/crm/notifications/read', body: body.toJson());
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Телефон для push клиентского «MyBooks»: ответ менеджера, заказ, оплата, письмо близкого
  Future<DeviceRegistered> meDevicePut({required DeviceBody body}) async {
    final json = await _send('PUT', '/api/v1/me/devices', body: body.toJson());
    return DeviceRegistered.fromJson(json as Map<String, dynamic>);
  }

  /// Забыть телефон (выход из аккаунта)
  Future<Ok> meDeviceDelete({required DeviceForgetBody body}) async {
    final json = await _send('POST', '/api/v1/me/devices/forget', body: body.toJson());
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Настройки приложения: адреса политики конфиденциальности и оферты (locale=ru|kk)
  Future<AppConfig> appConfig({String? locale}) async {
    final json = await _send('GET', '/api/v1/app-config', query: {if (locale != null) 'locale': '${locale}'});
    return AppConfig.fromJson(json as Map<String, dynamic>);
  }

  /// Объёмная модель книги для 3D-книги: размеры, развёртка обложки, ракурсы, свет, подписи (pages — страниц в сборке)
  Future<BookModel> bookModel({required String bookId, int? pages}) async {
    final json = await _send('GET', '/api/v1/books/${Uri.encodeComponent('$bookId')}/model', query: {if (pages != null) 'pages': '${pages}'});
    return BookModel.fromJson(json as Map<String, dynamic>);
  }

  /// Мастер новой книги: виды книг, поводы, надписи (как /books/new сайта)
  Future<BookWizard> bookWizard() async {
    final json = await _send('GET', '/api/v1/books/new');
    return BookWizard.fromJson(json as Map<String, dynamic>);
  }

  /// Подсказка мастера: до какого дня заказать, чтобы книга успела к дате повода
  Future<WizardDeadline> wizardDeadline({required String occasion, required String date}) async {
    final json = await _send('GET', '/api/v1/occasions/deadline', query: {'occasion': '${occasion}', 'date': '${date}'});
    return WizardDeadline.fromJson(json as Map<String, dynamic>);
  }

  /// Полка «Мои книги» — как на сайте: книги в работе первыми, прогресс, срок к празднику, заказ, обложка
  Future<CabinetShelf> cabinetShelf() async {
    final json = await _send('GET', '/api/v1/cabinet/shelf');
    return CabinetShelf.fromJson(json as Map<String, dynamic>);
  }

  /// Штаб книги — как страница книги на сайте: следующий шаг, срок, путь, замечания, главы, письма
  Future<CabinetBook> cabinetBook({required String bookId}) async {
    final json = await _send('GET', '/api/v1/cabinet/books/${Uri.encodeComponent('$bookId')}');
    return CabinetBook.fromJson(json as Map<String, dynamic>);
  }

  /// Вкладка «Фото» — как на сайте: где стоит каждое фото, итоги, фильтры, правило книги, лист «Где стоит фото»
  Future<CabinetPhotos> cabinetPhotos({required String bookId}) async {
    final json = await _send('GET', '/api/v1/cabinet/books/${Uri.encodeComponent('$bookId')}/photos');
    return CabinetPhotos.fromJson(json as Map<String, dynamic>);
  }

  /// Помощник по книге: беседа, подсказки пустого чата, подписи виджета; section — раздел кабинета для частых вопросов
  Future<CabinetHelp> cabinetHelp({required String bookId, String? section}) async {
    final json = await _send('GET', '/api/v1/cabinet/books/${Uri.encodeComponent('$bookId')}/help', query: {if (section != null) 'section': '${section}'});
    return CabinetHelp.fromJson(json as Map<String, dynamic>);
  }

  /// Вопрос помощнику по книге (или «Позвать менеджера»): ответ и беседа целиком
  Future<HelpAnswer> cabinetHelpAsk({required String bookId, required HelpAskBody body}) async {
    final json = await _send('POST', '/api/v1/cabinet/books/${Uri.encodeComponent('$bookId')}/help', body: body.toJson());
    return HelpAnswer.fromJson(json as Map<String, dynamic>);
  }

  /// Оформление заказа — как на сайте: проверка макета, тарифы, доставка, допы, договорённость
  Future<CabinetCheckout> cabinetCheckout({required String bookId}) async {
    final json = await _send('GET', '/api/v1/cabinet/books/${Uri.encodeComponent('$bookId')}/checkout');
    return CabinetCheckout.fromJson(json as Map<String, dynamic>);
  }

  /// Итог по выбранному: строки чека и «К оплате» (правила цены сервера), проверка промокода
  Future<CheckoutQuote> cabinetCheckoutQuote({required String bookId, required CheckoutQuoteBody body}) async {
    final json = await _send('POST', '/api/v1/cabinet/books/${Uri.encodeComponent('$bookId')}/checkout/quote', body: body.toJson());
    return CheckoutQuote.fromJson(json as Map<String, dynamic>);
  }

  /// Оформить заказ (те же проверки, что у формы сайта)
  Future<OrderPlaced> cabinetOrderPlace({required String bookId, required OrderPlaceBody body}) async {
    final json = await _send('POST', '/api/v1/cabinet/books/${Uri.encodeComponent('$bookId')}/orders', body: body.toJson());
    return OrderPlaced.fromJson(json as Map<String, dynamic>);
  }

  /// Мои заказы
  Future<CabinetOrders> cabinetOrders() async {
    final json = await _send('GET', '/api/v1/cabinet/orders');
    return CabinetOrders.fromJson(json as Map<String, dynamic>);
  }

  /// Заказ — как на сайте: что сейчас, этапы, детали, чек, оплата
  Future<CabinetOrder> cabinetOrder({required String orderId}) async {
    final json = await _send('GET', '/api/v1/cabinet/orders/${Uri.encodeComponent('$orderId')}');
    return CabinetOrder.fromJson(json as Map<String, dynamic>);
  }

  /// Оплата через Kaspi: счёт в приложение Kaspi по номеру или QR-код
  Future<KaspiInvoiceResult> cabinetOrderKaspi({required String orderId, required KaspiPayBody body}) async {
    final json = await _send('POST', '/api/v1/cabinet/orders/${Uri.encodeComponent('$orderId')}/kaspi', body: body.toJson());
    return KaspiInvoiceResult.fromJson(json as Map<String, dynamic>);
  }

  /// Состояние счёта Kaspi (опрос, пока клиент платит)
  Future<KaspiInvoiceResult> cabinetOrderKaspiStatus({required String orderId, required String invoiceId}) async {
    final json = await _send('GET', '/api/v1/cabinet/orders/${Uri.encodeComponent('$orderId')}/kaspi/${Uri.encodeComponent('$invoiceId')}');
    return KaspiInvoiceResult.fromJson(json as Map<String, dynamic>);
  }

  /// «Я оплатил(а)» переводом
  Future<OkResult> cabinetOrderClaim({required String orderId}) async {
    final json = await _send('POST', '/api/v1/cabinet/orders/${Uri.encodeComponent('$orderId')}/claim');
    return OkResult.fromJson(json as Map<String, dynamic>);
  }

  /// Отменить заказ — книга снова открыта для правок
  Future<OkResult> cabinetOrderCancel({required String orderId}) async {
    final json = await _send('POST', '/api/v1/cabinet/orders/${Uri.encodeComponent('$orderId')}/cancel');
    return OkResult.fromJson(json as Map<String, dynamic>);
  }

  /// Сделка: клиент, дубли, прошлые сделки контакта, воронки
  Future<DealExtras> crmDealExtras({required String dealId}) async {
    final json = await _send('GET', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/extras');
    return DealExtras.fromJson(json as Map<String, dynamic>);
  }

  /// Завести клиента из сделки (пароль — один раз)
  Future<DealClientCreated> crmDealClientCreate({required String dealId, required DealClientBody body}) async {
    final json = await _send('POST', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/client', body: body.toJson());
    return DealClientCreated.fromJson(json as Map<String, dynamic>);
  }

  /// Привязать сделку к клиенту сайта или отвязать (null)
  Future<Done> crmDealClientLink({required String dealId, required DealLinkBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/client', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Слить дубль в эту сделку
  Future<Done> crmDealMerge({required String dealId, required DealMergeBody body}) async {
    final json = await _send('POST', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/merge', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Перенести сделку в другую воронку (на первый этап «в работе»)
  Future<Done> crmDealPipeline({required String dealId, required DealPipelineBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/pipeline', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Сделка для правки: поля, свои поля, договорённость
  Future<DealForm> crmDealForm({required String dealId}) async {
    final json = await _send('GET', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/form');
    return DealForm.fromJson(json as Map<String, dynamic>);
  }

  /// Тариф договорённости (null — клиент выберет сам)
  Future<Done> crmDealPlan({required String dealId, required DealPlanBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/plan', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Что бесплатно по договорённости
  Future<Done> crmDealGifts({required String dealId, required DealGiftsBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/gifts', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Клиент для правки: номера, теги, свои поля, язык, канал, ответственный
  Future<ClientForm> crmClientForm({required String clientId}) async {
    final json = await _send('GET', '/api/v1/crm/clients/${Uri.encodeComponent('$clientId')}/form');
    return ClientForm.fromJson(json as Map<String, dynamic>);
  }

  /// Выдать клиенту новый пароль в кабинет (прежние входы завершаются)
  Future<ClientAccess> crmClientAccess({required String clientId}) async {
    final json = await _send('POST', '/api/v1/crm/clients/${Uri.encodeComponent('$clientId')}/access');
    return ClientAccess.fromJson(json as Map<String, dynamic>);
  }

  /// Напомнить клиенту о книге (письмо или WhatsApp)
  Future<Done> crmClientRemind({required String clientId}) async {
    final json = await _send('POST', '/api/v1/crm/clients/${Uri.encodeComponent('$clientId')}/remind');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Запустить или остановить бота в диалоге
  Future<Done> crmChatBot({required String chatId, required ChatBotBody body}) async {
    final json = await _send('POST', '/api/v1/crm/chats/${Uri.encodeComponent('$chatId')}/bot', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Деньги и доставка заказа: платежи, к оплате, тариф и цена, статус и трек
  Future<OrderMoney> crmOrderMoney({required String orderId}) async {
    final json = await _send('GET', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/money');
    return OrderMoney.fromJson(json as Map<String, dynamic>);
  }

  /// Принять оплату с чеком (multipart, поле file; сумма и дата — в query)
  Future<Done> crmOrderPay({required String orderId, required String amount, String? paidAt, String? note, String? payForm, required String requestKey, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/payments', 'file', files, query: {'amount': '${amount}', if (paidAt != null) 'paidAt': '${paidAt}', if (note != null) 'note': '${note}', if (payForm != null) 'payForm': '${payForm}', 'requestKey': '${requestKey}'});
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Вернуть деньги (чек возврата — по желанию, поле file); причина — note
  Future<Done> crmOrderRefund({required String orderId, required String amount, String? note, required String requestKey, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/refunds', 'file', files, query: {'amount': '${amount}', if (note != null) 'note': '${note}', 'requestKey': '${requestKey}'});
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Отменить ошибочный платёж (руководитель, с причиной)
  Future<Done> crmOrderPaymentVoid({required String paymentId, required ReasonBody body}) async {
    final json = await _send('POST', '/api/v1/crm/orders/payments/${Uri.encodeComponent('$paymentId')}/void', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Отметить оплату сверенной с выпиской (руководитель)
  Future<Done> crmOrderPaymentReview({required String paymentId}) async {
    final json = await _send('POST', '/api/v1/crm/orders/payments/${Uri.encodeComponent('$paymentId')}/review');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Неоплаченный заказ — в печать с постоплатой (о чём договорились)
  Future<Done> crmOrderPostpay({required String orderId, required ReasonBody body}) async {
    final json = await _send('POST', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/postpay', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Тариф и договорённая цена (оплаченный — с правом и причиной)
  Future<Done> crmOrderTerms({required String orderId, required OrderTermsBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/terms', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Попросить руководителя изменить цену оплаченного заказа
  Future<Done> crmOrderRepriceRequest({required String orderId, required RepriceRequestBody body}) async {
    final json = await _send('POST', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/reprice-request', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Статус и трек-номер заказа (клиент получит сообщение, как с сайта)
  Future<Done> crmOrderDelivery({required String orderId, required OrderDeliveryBody body}) async {
    final json = await _send('PATCH', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/delivery', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Справочники формы «Новый клиент»: каналы, тарифы, формы оплаты, этапы, ответственные
  Future<NewClientOptions> crmClientNewOptions() async {
    final json = await _send('GET', '/api/v1/crm/clients/new');
    return NewClientOptions.fromJson(json as Map<String, dynamic>);
  }

  /// Чек к оплате сделки (multipart, поле file; сумма и платёж — в query)
  Future<Done> crmDealReceipt({required String dealId, required String amount, String? paymentId, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/receipts', 'file', files, query: {'amount': '${amount}', if (paymentId != null) 'paymentId': '${paymentId}'});
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Файлы для типографии: параметры печати и ссылки на файлы
  Future<OrderFiles> crmOrderFiles({required String orderId}) async {
    final json = await _send('GET', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/files');
    return OrderFiles.fromJson(json as Map<String, dynamic>);
  }

  /// Получатель, контакты и доставка заказа для правки
  Future<OrderDetailsForm> crmOrderDetails({required String orderId}) async {
    final json = await _send('GET', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/details');
    return OrderDetailsForm.fromJson(json as Map<String, dynamic>);
  }

  /// Изменить получателя, контакты и доставку (как форма карточки заказа)
  Future<Done> crmOrderDetailsUpdate({required String orderId, required OrderDetailsBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/details', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Клиент, сделка, чат заказа и внутренняя заметка
  Future<OrderLinks> crmOrderLinks({required String orderId}) async {
    final json = await _send('GET', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/links');
    return OrderLinks.fromJson(json as Map<String, dynamic>);
  }

  /// Внутренняя заметка к заказу (клиент её не видит)
  Future<Done> crmOrderNote({required String orderId, required OrderNoteBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/note', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Открыть книгу заказа для правок клиентом или закрыть
  Future<Done> crmOrderBookLock({required String orderId, required BookLockBody body}) async {
    final json = await _send('POST', '/api/v1/crm/orders/${Uri.encodeComponent('$orderId')}/book-lock', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Обращения: открытые, по статусу, поиск (руководитель — все, остальные — свои)
  Future<SupportList> crmSupportList({String? status, String? q}) async {
    final json = await _send('GET', '/api/v1/crm/support', query: {if (status != null) 'status': '${status}', if (q != null) 'q': '${q}'});
    return SupportList.fromJson(json as Map<String, dynamic>);
  }

  /// Обращение: суть, описание, вложения с расшифровками, переписка, решение, история
  Future<SupportTicketView> crmSupportTicket({required int number}) async {
    final json = await _send('GET', '/api/v1/crm/support/${Uri.encodeComponent('$number')}');
    return SupportTicketView.fromJson(json as Map<String, dynamic>);
  }

  /// Статус, что сделали, заметка; notify — написать автору в WhatsApp
  Future<Done> crmSupportUpdate({required int number, required SupportUpdateBody body}) async {
    final json = await _send('PATCH', '/api/v1/crm/support/${Uri.encodeComponent('$number')}', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Написать автору обращения сейчас: номер, статус и что сделали
  Future<Done> crmSupportNotify({required int number}) async {
    final json = await _send('POST', '/api/v1/crm/support/${Uri.encodeComponent('$number')}/notify');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Финансы: проверить, вернуть или зачесть, пришло за период, кто должен
  Future<Finance> crmFinance({String? p, String? from, String? to}) async {
    final json = await _send('GET', '/api/v1/crm/finance', query: {if (p != null) 'p': '${p}', if (from != null) 'from': '${from}', if (to != null) 'to': '${to}'});
    return Finance.fromJson(json as Map<String, dynamic>);
  }

  /// «Проверено»: ручная оплата или возврат сверены с выпиской (руководитель)
  Future<Done> crmFinanceReview({required FinanceReviewBody body}) async {
    final json = await _send('POST', '/api/v1/crm/finance/review', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Отметить случай «вернуть или зачесть» решённым (с комментарием)
  Future<Done> crmFinanceResolve({required FinanceResolveBody body}) async {
    final json = await _send('POST', '/api/v1/crm/finance/issues', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Отменить решение — случай вернётся в очередь
  Future<Done> crmFinanceUndo({required String resolutionId}) async {
    final json = await _send('POST', '/api/v1/crm/finance/resolutions/${Uri.encodeComponent('$resolutionId')}/undo');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Расходы за период: итог, категории, записи
  Future<Expenses> crmExpenses({String? p, String? from, String? to}) async {
    final json = await _send('GET', '/api/v1/crm/expenses', query: {if (p != null) 'p': '${p}', if (from != null) 'from': '${from}', if (to != null) 'to': '${to}'});
    return Expenses.fromJson(json as Map<String, dynamic>);
  }

  /// Внести расход (реклама — в расходы канала)
  Future<Done> crmExpenseAdd({required ExpenseBody body}) async {
    final json = await _send('POST', '/api/v1/crm/expenses', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Изменить расход
  Future<Done> crmExpenseUpdate({required String expenseId, required ExpenseBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/expenses/${Uri.encodeComponent('$expenseId')}', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Удалить расход
  Future<Done> crmExpenseRemove({required String expenseId, required String source}) async {
    final json = await _send('DELETE', '/api/v1/crm/expenses/${Uri.encodeComponent('$expenseId')}', query: {'source': '${source}'});
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Прибыль за период: отчёт строками, по времени, экономика продаж
  Future<Profit> crmProfit({String? p, String? from, String? to}) async {
    final json = await _send('GET', '/api/v1/crm/profit', query: {if (p != null) 'p': '${p}', if (from != null) 'from': '${from}', if (to != null) 'to': '${to}'});
    return Profit.fromJson(json as Map<String, dynamic>);
  }

  /// Проценты комиссий по формам оплаты и налог с выручки
  Future<Done> crmProfitFees({required FeeRatesBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/profit/fees', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Реестр продаж: покупатели периода, цена, оплачено, остаток, форма оплаты
  Future<SalesRegister> crmSalesRegister({String? p, String? from, String? to}) async {
    final json = await _send('GET', '/api/v1/crm/sales', query: {if (p != null) 'p': '${p}', if (from != null) 'from': '${from}', if (to != null) 'to': '${to}'});
    return SalesRegister.fromJson(json as Map<String, dynamic>);
  }

  /// Форма оплаты сделки (Kaspi Gold, Рассрочка…); пусто — снять
  Future<Done> crmSalesPayForm({required String dealId, required PayFormBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/sales/${Uri.encodeComponent('$dealId')}/pay-form', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Аналитика продаж: деньги, воронка, каналы, команда, скорость ответа, телефония
  Future<SalesAnalytics> crmAnalytics({String? p, String? from, String? to, String? pl}) async {
    final json = await _send('GET', '/api/v1/crm/analytics', query: {if (p != null) 'p': '${p}', if (from != null) 'from': '${from}', if (to != null) 'to': '${to}', if (pl != null) 'pl': '${pl}'});
    return SalesAnalytics.fromJson(json as Map<String, dynamic>);
  }

  /// Статистика лидов: заявки периода, по дням, этапы, отказы и разрезы
  Future<LeadStats> crmLeadStats({String? p, String? from, String? to, String? m}) async {
    final json = await _send('GET', '/api/v1/crm/leads', query: {if (p != null) 'p': '${p}', if (from != null) 'from': '${from}', if (to != null) 'to': '${to}', if (m != null) 'm': '${m}'});
    return LeadStats.fromJson(json as Map<String, dynamic>);
  }

  /// Настройки отдела продаж и режим AI-продажника
  Future<CrmSalesSettings> crmSettingsSales() async {
    final json = await _send('GET', '/api/v1/crm/settings/sales');
    return CrmSalesSettings.fromJson(json as Map<String, dynamic>);
  }

  /// Сохранить настройки отдела продаж
  Future<Done> crmSettingsSalesSave({required CrmSalesSettingsBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/settings/sales', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Режим AI-продажника (остальные настройки бота — как есть)
  Future<Done> crmSettingsBotMode({required BotModeBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/settings/bot-mode', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Промокоды: использование, оплаченные заказы, выручка
  Future<Promos> crmPromos() async {
    final json = await _send('GET', '/api/v1/crm/promos');
    return Promos.fromJson(json as Map<String, dynamic>);
  }

  /// Новый промокод
  Future<Done> crmPromoCreate({required PromoBody body}) async {
    final json = await _send('POST', '/api/v1/crm/promos', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Включить или выключить промокод
  Future<Done> crmPromoToggle({required String id}) async {
    final json = await _send('POST', '/api/v1/crm/promos/${Uri.encodeComponent('$id')}/toggle');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Сертификаты: ждут оплаты и выпущенные
  Future<Gifts> crmGifts() async {
    final json = await _send('GET', '/api/v1/crm/gifts');
    return Gifts.fromJson(json as Map<String, dynamic>);
  }

  /// «Оплачен» с чеком перевода (multipart, поле file)
  Future<Done> crmGiftPaid({required String id, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/crm/gifts/${Uri.encodeComponent('$id')}/paid', 'file', files);
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Отправить сертификат получателю ещё раз
  Future<Done> crmGiftResend({required String id}) async {
    final json = await _send('POST', '/api/v1/crm/gifts/${Uri.encodeComponent('$id')}/resend');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Отменить сертификат
  Future<Done> crmGiftCancel({required String id}) async {
    final json = await _send('POST', '/api/v1/crm/gifts/${Uri.encodeComponent('$id')}/cancel');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Отзывы по статусу (new | published | hidden | all)
  Future<Reviews> crmReviews({String? s}) async {
    final json = await _send('GET', '/api/v1/crm/reviews', query: {if (s != null) 's': '${s}'});
    return Reviews.fromJson(json as Map<String, dynamic>);
  }

  /// Показать на сайте, скрыть, закрепить на главной или открепить
  Future<Done> crmReviewModerate({required String id, required String action}) async {
    final json = await _send('POST', '/api/v1/crm/reviews/${Uri.encodeComponent('$id')}/${Uri.encodeComponent('$action')}');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Ссылки и каналы: каналы за период и рекламные ссылки
  Future<MarketingReport> crmMarketing({String? period, String? archived}) async {
    final json = await _send('GET', '/api/v1/crm/marketing', query: {if (period != null) 'period': '${period}', if (archived != null) 'archived': '${archived}'});
    return MarketingReport.fromJson(json as Map<String, dynamic>);
  }

  /// Новая рекламная ссылка (короткая, с UTM)
  Future<Done> crmMarketingLinkCreate({required MarketingLinkBody body}) async {
    final json = await _send('POST', '/api/v1/crm/marketing/links', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Убрать ссылку в архив или вернуть
  Future<Done> crmMarketingLinkArchive({required String id, required ArchiveBody body}) async {
    final json = await _send('POST', '/api/v1/crm/marketing/links/${Uri.encodeComponent('$id')}/archive', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// ИИ-дизайнер: запросы, люди, покупки, режимы, кто пользуется
  Future<DesignAiReport> crmDesignAi({String? days}) async {
    final json = await _send('GET', '/api/v1/crm/design-ai', query: {if (days != null) 'days': '${days}'});
    return DesignAiReport.fromJson(json as Map<String, dynamic>);
  }

  /// Подарить клиенту запросы (на баланс, как купленные)
  Future<Done> crmDesignAiGrant({required DesignAiGrantBody body}) async {
    final json = await _send('POST', '/api/v1/crm/design-ai/grant', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Бесплатный лимит запросов на клиента
  Future<Done> crmDesignAiLimit({required DesignAiLimitBody body}) async {
    final json = await _send('PUT', '/api/v1/crm/design-ai/limit', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Книги клиентов: этап, поиск, тема, ход работы
  Future<BooksList> crmBooks({String? f, String? q, String? theme}) async {
    final json = await _send('GET', '/api/v1/crm/books', query: {if (f != null) 'f': '${f}', if (q != null) 'q': '${q}', if (theme != null) 'theme': '${theme}'});
    return BooksList.fromJson(json as Map<String, dynamic>);
  }

  /// Напомнить авторам (письмо или WhatsApp, как кнопка «Напомнить всем»)
  Future<RemindResult> crmBooksRemind({required RemindBody body}) async {
    final json = await _send('POST', '/api/v1/crm/books/remind', body: body.toJson());
    return RemindResult.fromJson(json as Map<String, dynamic>);
  }

  /// Каталог WhatsApp: товары и коллекции (копия старше 5 минут обновляется из WhatsApp)
  Future<Catalog> crmCatalog() async {
    final json = await _send('GET', '/api/v1/crm/catalog');
    return Catalog.fromJson(json as Map<String, dynamic>);
  }

  /// Забрать каталог из WhatsApp сейчас
  Future<Done> crmCatalogSync() async {
    final json = await _send('POST', '/api/v1/crm/catalog/sync');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Загрузить новые фото товара (JPEG, PNG, WebP до 8 МБ) — токены на 30 минут
  Future<CatalogUploads> crmCatalogUpload({required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/crm/catalog/uploads', 'image', files);
    return CatalogUploads.fromJson(json as Map<String, dynamic>);
  }

  /// Новый товар или правка (WhatsApp заменяет товар целиком)
  Future<Done> crmCatalogSave({required CatalogProductBody body}) async {
    final json = await _send('POST', '/api/v1/crm/catalog/products', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Скрыть товар или показать
  Future<Done> crmCatalogHidden({required String id, required HiddenBody body}) async {
    final json = await _send('POST', '/api/v1/crm/catalog/products/${Uri.encodeComponent('$id')}/hidden', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Удалить товар из каталога WhatsApp
  Future<Done> crmCatalogDelete({required String id}) async {
    final json = await _send('DELETE', '/api/v1/crm/catalog/products/${Uri.encodeComponent('$id')}');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Новая коллекция или правка: название и товары
  Future<Done> crmCatalogCollectionSave({required CatalogCollectionBody body}) async {
    final json = await _send('POST', '/api/v1/crm/catalog/collections', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Удалить коллекцию
  Future<Done> crmCatalogCollectionDelete({required String id}) async {
    final json = await _send('DELETE', '/api/v1/crm/catalog/collections/${Uri.encodeComponent('$id')}');
    return Done.fromJson(json as Map<String, dynamic>);
  }

  /// Доски, которые видит сотрудник (с числом открытых карточек)
  Future<BoardList> boardsList() async {
    final json = await _send('GET', '/api/v1/boards');
    return BoardList.fromJson(json as Map<String, dynamic>);
  }

  /// Доска: колонки, метки, видимые карточки, сотрудники (done=1 — выполненные за 90 дней)
  Future<BoardDetail> boardDetail({required String boardId, String? done}) async {
    final json = await _send('GET', '/api/v1/boards/${Uri.encodeComponent('$boardId')}', query: {if (done != null) 'done': '${done}'});
    return BoardDetail.fromJson(json as Map<String, dynamic>);
  }

  /// Новая карточка (задача CRM) на доске
  Future<CardCreated> cardCreate({required CardCreate body}) async {
    final json = await _send('POST', '/api/v1/cards', body: body.toJson());
    return CardCreated.fromJson(json as Map<String, dynamic>);
  }

  /// Карточка целиком: чек-листы, комментарии, вложения, журнал
  Future<CardDetail> cardDetail({required String cardId}) async {
    final json = await _send('GET', '/api/v1/cards/${Uri.encodeComponent('$cardId')}');
    return CardDetail.fromJson(json as Map<String, dynamic>);
  }

  /// Правка карточки (только переданные поля)
  Future<CardResult> cardUpdate({required String cardId, required CardPatch body}) async {
    final json = await _send('PATCH', '/api/v1/cards/${Uri.encodeComponent('$cardId')}', body: body.toJson());
    return CardResult.fromJson(json as Map<String, dynamic>);
  }

  /// Удалить насовсем (автор или админ доски; остальным — в архив)
  Future<Ok> cardDelete({required String cardId}) async {
    final json = await _send('DELETE', '/api/v1/cards/${Uri.encodeComponent('$cardId')}');
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Перенос в колонку между соседями (в «Готово» — выполнена)
  Future<CardResult> cardMove({required String cardId, required CardMove body}) async {
    final json = await _send('POST', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/move', body: body.toJson());
    return CardResult.fromJson(json as Map<String, dynamic>);
  }

  /// Выполнить или вернуть в работу (с итогом)
  Future<CardResult> cardDone({required String cardId, required CardDone body}) async {
    final json = await _send('POST', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/done', body: body.toJson());
    return CardResult.fromJson(json as Map<String, dynamic>);
  }

  /// В архив и обратно
  Future<Ok> cardArchive({required String cardId, required CardArchive body}) async {
    final json = await _send('POST', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/archive', body: body.toJson());
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Исполнители (первый — главный: напоминания, «Мой день»)
  Future<CardResult> cardAssignees({required String cardId, required CardAssignees body}) async {
    final json = await _send('PUT', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/assignees', body: body.toJson());
    return CardResult.fromJson(json as Map<String, dynamic>);
  }

  /// Следить за карточкой или нет
  Future<Ok> cardWatch({required String cardId, required CardWatch body}) async {
    final json = await _send('PUT', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/watch', body: body.toJson());
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Метка на карточке — поставить или снять
  Future<CardResult> cardLabel({required String cardId, required String labelId, required CardLabelToggle body}) async {
    final json = await _send('PUT', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/labels/${Uri.encodeComponent('$labelId')}', body: body.toJson());
    return CardResult.fromJson(json as Map<String, dynamic>);
  }

  /// Новый чек-лист с пунктами
  Future<CreatedId> cardChecklistCreate({required String cardId, required ChecklistCreate body}) async {
    final json = await _send('POST', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/checklists', body: body.toJson());
    return CreatedId.fromJson(json as Map<String, dynamic>);
  }

  /// Пункт чек-листа
  Future<CreatedId> checklistItemCreate({required String checklistId, required ChecklistItemCreate body}) async {
    final json = await _send('POST', '/api/v1/checklists/${Uri.encodeComponent('$checklistId')}/items', body: body.toJson());
    return CreatedId.fromJson(json as Map<String, dynamic>);
  }

  /// Пункт: текст, отметка, исполнитель, срок
  Future<Ok> checklistItemUpdate({required String itemId, required ChecklistItemPatch body}) async {
    final json = await _send('PATCH', '/api/v1/checklist-items/${Uri.encodeComponent('$itemId')}', body: body.toJson());
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Удалить пункт
  Future<Ok> checklistItemDelete({required String itemId}) async {
    final json = await _send('DELETE', '/api/v1/checklist-items/${Uri.encodeComponent('$itemId')}');
    return Ok.fromJson(json as Map<String, dynamic>);
  }

  /// Комментарий (@Имя — уведомить коллегу)
  Future<CreatedId> cardCommentCreate({required String cardId, required CommentCreate body}) async {
    final json = await _send('POST', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/comments', body: body.toJson());
    return CreatedId.fromJson(json as Map<String, dynamic>);
  }

  /// Вложение (multipart, поле file, до 25 МБ); первая картинка — обложка
  Future<CreatedId> cardFileUpload({required String cardId, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/cards/${Uri.encodeComponent('$cardId')}/files', 'file', files);
    return CreatedId.fromJson(json as Map<String, dynamic>);
  }

  /// Карточки со сроком или началом в периоде (до 120 дней): со всех видимых досок или одной; mine=1 — только мои
  Future<CardList> tasksCalendar({required String from, required String to, String? boardId, String? mine}) async {
    final json = await _send('GET', '/api/v1/tasks/calendar', query: {'from': '${from}', 'to': '${to}', if (boardId != null) 'boardId': '${boardId}', if (mine != null) 'mine': '${mine}'});
    return CardList.fromJson(json as Map<String, dynamic>);
  }
}

class ApiError {
  final String error;
  final String? code;

  const ApiError({required this.error, this.code});

  factory ApiError.fromJson(Map<String, dynamic> json) => ApiError(error: json['error'] as String, code: json['code'] == null ? null : json['code'] as String);

  Map<String, dynamic> toJson() => {'error': error, if (code != null) 'code': code!};
}

class Ok {
  final bool ok;

  const Ok({required this.ok});

  factory Ok.fromJson(Map<String, dynamic> json) => Ok(ok: json['ok'] as bool);

  Map<String, dynamic> toJson() => {'ok': ok};
}

class User {
  final String id;
  final String name;
  final String email;
  final String? phone;
  /// ru | kk
  final String locale;
  final bool isStaff;

  const User({required this.id, required this.name, required this.email, this.phone, required this.locale, required this.isStaff});

  factory User.fromJson(Map<String, dynamic> json) => User(id: json['id'] as String, name: json['name'] as String, email: json['email'] as String, phone: json['phone'] == null ? null : json['phone'] as String, locale: json['locale'] as String, isStaff: json['isStaff'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'email': email, 'phone': phone, 'locale': locale, 'isStaff': isStaff};
}

class Session {
  final String token;
  final String expiresAt;
  final User user;

  const Session({required this.token, required this.expiresAt, required this.user});

  factory Session.fromJson(Map<String, dynamic> json) => Session(token: json['token'] as String, expiresAt: json['expiresAt'] as String, user: User.fromJson(json['user'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'token': token, 'expiresAt': expiresAt, 'user': user.toJson()};
}

class LoginResult {
  final Session? session;
  final String? secondFactorTicket;

  const LoginResult({this.session, this.secondFactorTicket});

  factory LoginResult.fromJson(Map<String, dynamic> json) => LoginResult(session: json['session'] == null ? null : Session.fromJson(json['session'] as Map<String, dynamic>), secondFactorTicket: json['secondFactorTicket'] == null ? null : json['secondFactorTicket'] as String);

  Map<String, dynamic> toJson() => {'session': session == null ? null : session!.toJson(), 'secondFactorTicket': secondFactorTicket};
}

class LoginBody {
  final String login;
  final String password;

  const LoginBody({required this.login, required this.password});

  factory LoginBody.fromJson(Map<String, dynamic> json) => LoginBody(login: json['login'] as String, password: json['password'] as String);

  Map<String, dynamic> toJson() => {'login': login, 'password': password};
}

class SecondFactorBody {
  final String ticket;
  final String code;

  const SecondFactorBody({required this.ticket, required this.code});

  factory SecondFactorBody.fromJson(Map<String, dynamic> json) => SecondFactorBody(ticket: json['ticket'] as String, code: json['code'] as String);

  Map<String, dynamic> toJson() => {'ticket': ticket, 'code': code};
}

class WebSession {
  final String cookie;
  final String token;
  final String expiresAt;
  final String baseUrl;

  const WebSession({required this.cookie, required this.token, required this.expiresAt, required this.baseUrl});

  factory WebSession.fromJson(Map<String, dynamic> json) => WebSession(cookie: json['cookie'] as String, token: json['token'] as String, expiresAt: json['expiresAt'] as String, baseUrl: json['baseUrl'] as String);

  Map<String, dynamic> toJson() => {'cookie': cookie, 'token': token, 'expiresAt': expiresAt, 'baseUrl': baseUrl};
}

class StaffRef {
  final String id;
  final String label;

  const StaffRef({required this.id, required this.label});

  factory StaffRef.fromJson(Map<String, dynamic> json) => StaffRef(id: json['id'] as String, label: json['label'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'label': label};
}

class BoardInfo {
  final String id;
  final String name;
  final String? description;
  /// team | personal | project
  final String kind;
  final String color;
  /// all | members
  final String visibility;
  final bool isDefault;
  final bool canManage;
  final int? openCards;

  const BoardInfo({required this.id, required this.name, this.description, required this.kind, required this.color, required this.visibility, required this.isDefault, required this.canManage, this.openCards});

  factory BoardInfo.fromJson(Map<String, dynamic> json) => BoardInfo(id: json['id'] as String, name: json['name'] as String, description: json['description'] == null ? null : json['description'] as String, kind: json['kind'] as String, color: json['color'] as String, visibility: json['visibility'] as String, isDefault: json['isDefault'] as bool, canManage: json['canManage'] as bool, openCards: json['openCards'] == null ? null : (json['openCards'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'description': description, 'kind': kind, 'color': color, 'visibility': visibility, 'isDefault': isDefault, 'canManage': canManage, if (openCards != null) 'openCards': openCards!};
}

class BoardList {
  final List<BoardInfo> boards;

  const BoardList({required this.boards});

  factory BoardList.fromJson(Map<String, dynamic> json) => BoardList(boards: (json['boards'] as List).map((e) => BoardInfo.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'boards': boards.map((e) => e.toJson()).toList()};
}

class BoardColumn {
  final String id;
  final String name;
  final bool done;
  final int? wipLimit;

  const BoardColumn({required this.id, required this.name, required this.done, this.wipLimit});

  factory BoardColumn.fromJson(Map<String, dynamic> json) => BoardColumn(id: json['id'] as String, name: json['name'] as String, done: json['done'] as bool, wipLimit: json['wipLimit'] == null ? null : (json['wipLimit'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'done': done, 'wipLimit': wipLimit};
}

class BoardLabel {
  final String id;
  final String name;
  final String color;

  const BoardLabel({required this.id, required this.name, required this.color});

  factory BoardLabel.fromJson(Map<String, dynamic> json) => BoardLabel(id: json['id'] as String, name: json['name'] as String, color: json['color'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'color': color};
}

class CardLink {
  /// deal | order | client | book | chat
  final String type;
  final String id;
  final String label;
  final String href;

  const CardLink({required this.type, required this.id, required this.label, required this.href});

  factory CardLink.fromJson(Map<String, dynamic> json) => CardLink(type: json['type'] as String, id: json['id'] as String, label: json['label'] as String, href: json['href'] as String);

  Map<String, dynamic> toJson() => {'type': type, 'id': id, 'label': label, 'href': href};
}

class CardSummary {
  final String id;
  final String title;
  /// task | call | message | meeting
  final String kind;
  final String? boardId;
  final String? columnId;
  final double? position;
  final String? priority;
  final String? startAt;
  final String? dueAt;
  final String? doneAt;
  final bool archived;
  final String? coverColor;
  final String? coverImage;
  final List<String> assigneeIds;
  final List<String> watcherIds;
  final List<String> labelIds;
  final int checklistDone;
  final int checklistTotal;
  final int comments;
  final int attachments;
  final bool hasDescription;
  final bool recurring;
  final List<CardLink> links;
  final bool editable;

  const CardSummary({required this.id, required this.title, required this.kind, this.boardId, this.columnId, this.position, this.priority, this.startAt, this.dueAt, this.doneAt, required this.archived, this.coverColor, this.coverImage, required this.assigneeIds, required this.watcherIds, required this.labelIds, required this.checklistDone, required this.checklistTotal, required this.comments, required this.attachments, required this.hasDescription, required this.recurring, required this.links, required this.editable});

  factory CardSummary.fromJson(Map<String, dynamic> json) => CardSummary(id: json['id'] as String, title: json['title'] as String, kind: json['kind'] as String, boardId: json['boardId'] == null ? null : json['boardId'] as String, columnId: json['columnId'] == null ? null : json['columnId'] as String, position: json['position'] == null ? null : (json['position'] as num).toDouble(), priority: json['priority'] == null ? null : json['priority'] as String, startAt: json['startAt'] == null ? null : json['startAt'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String, doneAt: json['doneAt'] == null ? null : json['doneAt'] as String, archived: json['archived'] as bool, coverColor: json['coverColor'] == null ? null : json['coverColor'] as String, coverImage: json['coverImage'] == null ? null : json['coverImage'] as String, assigneeIds: (json['assigneeIds'] as List).map((e) => e as String).toList(), watcherIds: (json['watcherIds'] as List).map((e) => e as String).toList(), labelIds: (json['labelIds'] as List).map((e) => e as String).toList(), checklistDone: (json['checklistDone'] as num).toInt(), checklistTotal: (json['checklistTotal'] as num).toInt(), comments: (json['comments'] as num).toInt(), attachments: (json['attachments'] as num).toInt(), hasDescription: json['hasDescription'] as bool, recurring: json['recurring'] as bool, links: (json['links'] as List).map((e) => CardLink.fromJson(e as Map<String, dynamic>)).toList(), editable: json['editable'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'kind': kind, 'boardId': boardId, 'columnId': columnId, 'position': position, 'priority': priority, 'startAt': startAt, 'dueAt': dueAt, 'doneAt': doneAt, 'archived': archived, 'coverColor': coverColor, 'coverImage': coverImage, 'assigneeIds': assigneeIds.map((e) => e).toList(), 'watcherIds': watcherIds.map((e) => e).toList(), 'labelIds': labelIds.map((e) => e).toList(), 'checklistDone': checklistDone, 'checklistTotal': checklistTotal, 'comments': comments, 'attachments': attachments, 'hasDescription': hasDescription, 'recurring': recurring, 'links': links.map((e) => e.toJson()).toList(), 'editable': editable};
}

class BoardDetail {
  final BoardInfo board;
  final List<BoardColumn> columns;
  final List<BoardLabel> labels;
  final List<CardSummary> cards;
  final List<StaffRef> staff;
  final int doneDays;

  const BoardDetail({required this.board, required this.columns, required this.labels, required this.cards, required this.staff, required this.doneDays});

  factory BoardDetail.fromJson(Map<String, dynamic> json) => BoardDetail(board: BoardInfo.fromJson(json['board'] as Map<String, dynamic>), columns: (json['columns'] as List).map((e) => BoardColumn.fromJson(e as Map<String, dynamic>)).toList(), labels: (json['labels'] as List).map((e) => BoardLabel.fromJson(e as Map<String, dynamic>)).toList(), cards: (json['cards'] as List).map((e) => CardSummary.fromJson(e as Map<String, dynamic>)).toList(), staff: (json['staff'] as List).map((e) => StaffRef.fromJson(e as Map<String, dynamic>)).toList(), doneDays: (json['doneDays'] as num).toInt());

  Map<String, dynamic> toJson() => {'board': board.toJson(), 'columns': columns.map((e) => e.toJson()).toList(), 'labels': labels.map((e) => e.toJson()).toList(), 'cards': cards.map((e) => e.toJson()).toList(), 'staff': staff.map((e) => e.toJson()).toList(), 'doneDays': doneDays};
}

class ChecklistItem {
  final String id;
  final String text;
  final bool done;
  final String? assigneeId;
  final String? dueAt;

  const ChecklistItem({required this.id, required this.text, required this.done, this.assigneeId, this.dueAt});

  factory ChecklistItem.fromJson(Map<String, dynamic> json) => ChecklistItem(id: json['id'] as String, text: json['text'] as String, done: json['done'] as bool, assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'text': text, 'done': done, 'assigneeId': assigneeId, 'dueAt': dueAt};
}

class Checklist {
  final String id;
  final String title;
  final List<ChecklistItem> items;

  const Checklist({required this.id, required this.title, required this.items});

  factory Checklist.fromJson(Map<String, dynamic> json) => Checklist(id: json['id'] as String, title: json['title'] as String, items: (json['items'] as List).map((e) => ChecklistItem.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'items': items.map((e) => e.toJson()).toList()};
}

class CardComment {
  final String id;
  final String? authorId;
  final String text;
  final String createdAt;
  final String? editedAt;
  final bool mine;

  const CardComment({required this.id, this.authorId, required this.text, required this.createdAt, this.editedAt, required this.mine});

  factory CardComment.fromJson(Map<String, dynamic> json) => CardComment(id: json['id'] as String, authorId: json['authorId'] == null ? null : json['authorId'] as String, text: json['text'] as String, createdAt: json['createdAt'] as String, editedAt: json['editedAt'] == null ? null : json['editedAt'] as String, mine: json['mine'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'authorId': authorId, 'text': text, 'createdAt': createdAt, 'editedAt': editedAt, 'mine': mine};
}

class CardFile {
  final String id;
  final String name;
  final String mime;
  final int size;
  final String url;
  final bool isImage;
  final String createdAt;

  const CardFile({required this.id, required this.name, required this.mime, required this.size, required this.url, required this.isImage, required this.createdAt});

  factory CardFile.fromJson(Map<String, dynamic> json) => CardFile(id: json['id'] as String, name: json['name'] as String, mime: json['mime'] as String, size: (json['size'] as num).toInt(), url: json['url'] as String, isImage: json['isImage'] as bool, createdAt: json['createdAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'mime': mime, 'size': size, 'url': url, 'isImage': isImage, 'createdAt': createdAt};
}

class CardActivity {
  final String id;
  final String? actorId;
  final String kind;
  final String text;
  final String createdAt;

  const CardActivity({required this.id, this.actorId, required this.kind, required this.text, required this.createdAt});

  factory CardActivity.fromJson(Map<String, dynamic> json) => CardActivity(id: json['id'] as String, actorId: json['actorId'] == null ? null : json['actorId'] as String, kind: json['kind'] as String, text: json['text'] as String, createdAt: json['createdAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'actorId': actorId, 'kind': kind, 'text': text, 'createdAt': createdAt};
}

class CardDetail {
  final CardSummary card;
  final String description;
  final String? createdById;
  final String createdAt;
  final int? remindBeforeMin;
  final String result;
  final int? estimateMin;
  final int? spentMin;
  final CardDetailBoard? board;
  final List<BoardColumn> columns;
  final List<BoardLabel> labels;
  final List<Checklist> checklists;
  final List<CardComment> comments;
  final List<CardFile> files;
  final List<CardActivity> activity;

  const CardDetail({required this.card, required this.description, this.createdById, required this.createdAt, this.remindBeforeMin, required this.result, this.estimateMin, this.spentMin, this.board, required this.columns, required this.labels, required this.checklists, required this.comments, required this.files, required this.activity});

  factory CardDetail.fromJson(Map<String, dynamic> json) => CardDetail(card: CardSummary.fromJson(json['card'] as Map<String, dynamic>), description: json['description'] as String, createdById: json['createdById'] == null ? null : json['createdById'] as String, createdAt: json['createdAt'] as String, remindBeforeMin: json['remindBeforeMin'] == null ? null : (json['remindBeforeMin'] as num).toInt(), result: json['result'] as String, estimateMin: json['estimateMin'] == null ? null : (json['estimateMin'] as num).toInt(), spentMin: json['spentMin'] == null ? null : (json['spentMin'] as num).toInt(), board: json['board'] == null ? null : CardDetailBoard.fromJson(json['board'] as Map<String, dynamic>), columns: (json['columns'] as List).map((e) => BoardColumn.fromJson(e as Map<String, dynamic>)).toList(), labels: (json['labels'] as List).map((e) => BoardLabel.fromJson(e as Map<String, dynamic>)).toList(), checklists: (json['checklists'] as List).map((e) => Checklist.fromJson(e as Map<String, dynamic>)).toList(), comments: (json['comments'] as List).map((e) => CardComment.fromJson(e as Map<String, dynamic>)).toList(), files: (json['files'] as List).map((e) => CardFile.fromJson(e as Map<String, dynamic>)).toList(), activity: (json['activity'] as List).map((e) => CardActivity.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'card': card.toJson(), 'description': description, 'createdById': createdById, 'createdAt': createdAt, 'remindBeforeMin': remindBeforeMin, 'result': result, 'estimateMin': estimateMin, 'spentMin': spentMin, 'board': board == null ? null : board!.toJson(), 'columns': columns.map((e) => e.toJson()).toList(), 'labels': labels.map((e) => e.toJson()).toList(), 'checklists': checklists.map((e) => e.toJson()).toList(), 'comments': comments.map((e) => e.toJson()).toList(), 'files': files.map((e) => e.toJson()).toList(), 'activity': activity.map((e) => e.toJson()).toList()};
}

class CardDetailBoard {
  final String id;
  final String name;

  const CardDetailBoard({required this.id, required this.name});

  factory CardDetailBoard.fromJson(Map<String, dynamic> json) => CardDetailBoard(id: json['id'] as String, name: json['name'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

class CardCreate {
  final String? boardId;
  final String? columnId;
  final String title;
  /// task | call | message | meeting
  final String? kind;
  final String? description;
  final String? dueAt;
  final String? startAt;
  final String? priority;
  final List<String>? assigneeIds;
  final List<String>? labelIds;
  final String? dealId;
  final String? clientId;
  final String? orderId;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CardCreate({this.boardId, this.columnId, required this.title, this.kind, this.description, this.dueAt, this.startAt, this.priority, this.assigneeIds, this.labelIds, this.dealId, this.clientId, this.orderId, this.nulls = const {}});

  factory CardCreate.fromJson(Map<String, dynamic> json) => CardCreate(boardId: json['boardId'] == null ? null : json['boardId'] as String, columnId: json['columnId'] == null ? null : json['columnId'] as String, title: json['title'] as String, kind: json['kind'] == null ? null : json['kind'] as String, description: json['description'] == null ? null : json['description'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String, startAt: json['startAt'] == null ? null : json['startAt'] as String, priority: json['priority'] == null ? null : json['priority'] as String, assigneeIds: json['assigneeIds'] == null ? null : (json['assigneeIds'] as List).map((e) => e as String).toList(), labelIds: json['labelIds'] == null ? null : (json['labelIds'] as List).map((e) => e as String).toList(), dealId: json['dealId'] == null ? null : json['dealId'] as String, clientId: json['clientId'] == null ? null : json['clientId'] as String, orderId: json['orderId'] == null ? null : json['orderId'] as String);

  Map<String, dynamic> toJson() => {if (boardId != null || nulls.contains('boardId')) 'boardId': boardId, if (columnId != null || nulls.contains('columnId')) 'columnId': columnId, 'title': title, if (kind != null) 'kind': kind!, if (description != null || nulls.contains('description')) 'description': description, if (dueAt != null || nulls.contains('dueAt')) 'dueAt': dueAt, if (startAt != null || nulls.contains('startAt')) 'startAt': startAt, if (priority != null || nulls.contains('priority')) 'priority': priority, if (assigneeIds != null) 'assigneeIds': assigneeIds!.map((e) => e).toList(), if (labelIds != null) 'labelIds': labelIds!.map((e) => e).toList(), if (dealId != null || nulls.contains('dealId')) 'dealId': dealId, if (clientId != null || nulls.contains('clientId')) 'clientId': clientId, if (orderId != null || nulls.contains('orderId')) 'orderId': orderId};
}

class CardPatch {
  final String? title;
  /// task | call | message | meeting
  final String? kind;
  final String? description;
  final String? priority;
  final String? startAt;
  final String? dueAt;
  final int? remindBeforeMin;
  final String? result;
  final int? estimateMin;
  final int? spentMin;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CardPatch({this.title, this.kind, this.description, this.priority, this.startAt, this.dueAt, this.remindBeforeMin, this.result, this.estimateMin, this.spentMin, this.nulls = const {}});

  factory CardPatch.fromJson(Map<String, dynamic> json) => CardPatch(title: json['title'] == null ? null : json['title'] as String, kind: json['kind'] == null ? null : json['kind'] as String, description: json['description'] == null ? null : json['description'] as String, priority: json['priority'] == null ? null : json['priority'] as String, startAt: json['startAt'] == null ? null : json['startAt'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String, remindBeforeMin: json['remindBeforeMin'] == null ? null : (json['remindBeforeMin'] as num).toInt(), result: json['result'] == null ? null : json['result'] as String, estimateMin: json['estimateMin'] == null ? null : (json['estimateMin'] as num).toInt(), spentMin: json['spentMin'] == null ? null : (json['spentMin'] as num).toInt());

  Map<String, dynamic> toJson() => {if (title != null) 'title': title!, if (kind != null) 'kind': kind!, if (description != null || nulls.contains('description')) 'description': description, if (priority != null || nulls.contains('priority')) 'priority': priority, if (startAt != null || nulls.contains('startAt')) 'startAt': startAt, if (dueAt != null || nulls.contains('dueAt')) 'dueAt': dueAt, if (remindBeforeMin != null || nulls.contains('remindBeforeMin')) 'remindBeforeMin': remindBeforeMin, if (result != null || nulls.contains('result')) 'result': result, if (estimateMin != null || nulls.contains('estimateMin')) 'estimateMin': estimateMin, if (spentMin != null || nulls.contains('spentMin')) 'spentMin': spentMin};
}

class CardResult {
  final CardSummary card;

  const CardResult({required this.card});

  factory CardResult.fromJson(Map<String, dynamic> json) => CardResult(card: CardSummary.fromJson(json['card'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'card': card.toJson()};
}

class CardCreated {
  final String id;
  final CardSummary card;

  const CardCreated({required this.id, required this.card});

  factory CardCreated.fromJson(Map<String, dynamic> json) => CardCreated(id: json['id'] as String, card: CardSummary.fromJson(json['card'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'id': id, 'card': card.toJson()};
}

class CreatedId {
  final String id;

  const CreatedId({required this.id});

  factory CreatedId.fromJson(Map<String, dynamic> json) => CreatedId(id: json['id'] as String);

  Map<String, dynamic> toJson() => {'id': id};
}

class CardMove {
  final String? boardId;
  final String columnId;
  final String? beforeId;
  final String? afterId;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CardMove({this.boardId, required this.columnId, this.beforeId, this.afterId, this.nulls = const {}});

  factory CardMove.fromJson(Map<String, dynamic> json) => CardMove(boardId: json['boardId'] == null ? null : json['boardId'] as String, columnId: json['columnId'] as String, beforeId: json['beforeId'] == null ? null : json['beforeId'] as String, afterId: json['afterId'] == null ? null : json['afterId'] as String);

  Map<String, dynamic> toJson() => {if (boardId != null || nulls.contains('boardId')) 'boardId': boardId, 'columnId': columnId, if (beforeId != null || nulls.contains('beforeId')) 'beforeId': beforeId, if (afterId != null || nulls.contains('afterId')) 'afterId': afterId};
}

class CardDone {
  final bool done;
  final String? result;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CardDone({required this.done, this.result, this.nulls = const {}});

  factory CardDone.fromJson(Map<String, dynamic> json) => CardDone(done: json['done'] as bool, result: json['result'] == null ? null : json['result'] as String);

  Map<String, dynamic> toJson() => {'done': done, if (result != null || nulls.contains('result')) 'result': result};
}

class CardArchive {
  final bool archived;

  const CardArchive({required this.archived});

  factory CardArchive.fromJson(Map<String, dynamic> json) => CardArchive(archived: json['archived'] as bool);

  Map<String, dynamic> toJson() => {'archived': archived};
}

class CardAssignees {
  final List<String> userIds;

  const CardAssignees({required this.userIds});

  factory CardAssignees.fromJson(Map<String, dynamic> json) => CardAssignees(userIds: (json['userIds'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'userIds': userIds.map((e) => e).toList()};
}

class CardWatch {
  final bool on;

  const CardWatch({required this.on});

  factory CardWatch.fromJson(Map<String, dynamic> json) => CardWatch(on: json['on'] as bool);

  Map<String, dynamic> toJson() => {'on': on};
}

class CardLabelToggle {
  final bool on;

  const CardLabelToggle({required this.on});

  factory CardLabelToggle.fromJson(Map<String, dynamic> json) => CardLabelToggle(on: json['on'] as bool);

  Map<String, dynamic> toJson() => {'on': on};
}

class ChecklistCreate {
  final String title;
  final List<String>? items;

  const ChecklistCreate({required this.title, this.items});

  factory ChecklistCreate.fromJson(Map<String, dynamic> json) => ChecklistCreate(title: json['title'] as String, items: json['items'] == null ? null : (json['items'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'title': title, if (items != null) 'items': items!.map((e) => e).toList()};
}

class ChecklistItemCreate {
  final String text;

  const ChecklistItemCreate({required this.text});

  factory ChecklistItemCreate.fromJson(Map<String, dynamic> json) => ChecklistItemCreate(text: json['text'] as String);

  Map<String, dynamic> toJson() => {'text': text};
}

class ChecklistItemPatch {
  final String? text;
  final bool? done;
  final String? assigneeId;
  final String? dueAt;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const ChecklistItemPatch({this.text, this.done, this.assigneeId, this.dueAt, this.nulls = const {}});

  factory ChecklistItemPatch.fromJson(Map<String, dynamic> json) => ChecklistItemPatch(text: json['text'] == null ? null : json['text'] as String, done: json['done'] == null ? null : json['done'] as bool, assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String);

  Map<String, dynamic> toJson() => {if (text != null) 'text': text!, if (done != null) 'done': done!, if (assigneeId != null || nulls.contains('assigneeId')) 'assigneeId': assigneeId, if (dueAt != null || nulls.contains('dueAt')) 'dueAt': dueAt};
}

class CommentCreate {
  final String text;

  const CommentCreate({required this.text});

  factory CommentCreate.fromJson(Map<String, dynamic> json) => CommentCreate(text: json['text'] as String);

  Map<String, dynamic> toJson() => {'text': text};
}

class CardList {
  final List<CardSummary> cards;

  const CardList({required this.cards});

  factory CardList.fromJson(Map<String, dynamic> json) => CardList(cards: (json['cards'] as List).map((e) => CardSummary.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'cards': cards.map((e) => e.toJson()).toList()};
}

class Theme {
  final String id;
  /// gift | autobiography | blank
  final String kind;
  /// required | optional | none
  final String recipient;
  final String name;
  final String short;
  final String description;
  final String emoji;
  final String? recipientLabel;
  final String? recipientPlaceholder;
  final String? recipientGender;
  final bool recipientGenderChoice;
  /// m | f
  final String defaultRecipientGender;
  final List<String> titleSuggestions;

  const Theme({required this.id, required this.kind, required this.recipient, required this.name, required this.short, required this.description, required this.emoji, this.recipientLabel, this.recipientPlaceholder, this.recipientGender, required this.recipientGenderChoice, required this.defaultRecipientGender, required this.titleSuggestions});

  factory Theme.fromJson(Map<String, dynamic> json) => Theme(id: json['id'] as String, kind: json['kind'] as String, recipient: json['recipient'] as String, name: json['name'] as String, short: json['short'] as String, description: json['description'] as String, emoji: json['emoji'] as String, recipientLabel: json['recipientLabel'] == null ? null : json['recipientLabel'] as String, recipientPlaceholder: json['recipientPlaceholder'] == null ? null : json['recipientPlaceholder'] as String, recipientGender: json['recipientGender'] == null ? null : json['recipientGender'] as String, recipientGenderChoice: json['recipientGenderChoice'] as bool, defaultRecipientGender: json['defaultRecipientGender'] as String, titleSuggestions: (json['titleSuggestions'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'id': id, 'kind': kind, 'recipient': recipient, 'name': name, 'short': short, 'description': description, 'emoji': emoji, 'recipientLabel': recipientLabel, 'recipientPlaceholder': recipientPlaceholder, 'recipientGender': recipientGender, 'recipientGenderChoice': recipientGenderChoice, 'defaultRecipientGender': defaultRecipientGender, 'titleSuggestions': titleSuggestions.map((e) => e).toList()};
}

class ThemeList {
  final List<Theme> themes;

  const ThemeList({required this.themes});

  factory ThemeList.fromJson(Map<String, dynamic> json) => ThemeList(themes: (json['themes'] as List).map((e) => Theme.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'themes': themes.map((e) => e.toJson()).toList()};
}

class CreateBookBody {
  final String theme;
  /// ru | kk
  final String language;
  final String authorName;
  /// m | f
  final String authorGender;
  final String? recipientName;
  /// m | f
  final String? recipientGender;
  final String? recordedBy;
  final String? firstChapterTitle;
  final String? dedication;
  final String? title;
  final String? occasion;
  final String? occasionDate;

  const CreateBookBody({required this.theme, required this.language, required this.authorName, required this.authorGender, this.recipientName, this.recipientGender, this.recordedBy, this.firstChapterTitle, this.dedication, this.title, this.occasion, this.occasionDate});

  factory CreateBookBody.fromJson(Map<String, dynamic> json) => CreateBookBody(theme: json['theme'] as String, language: json['language'] as String, authorName: json['authorName'] as String, authorGender: json['authorGender'] as String, recipientName: json['recipientName'] == null ? null : json['recipientName'] as String, recipientGender: json['recipientGender'] == null ? null : json['recipientGender'] as String, recordedBy: json['recordedBy'] == null ? null : json['recordedBy'] as String, firstChapterTitle: json['firstChapterTitle'] == null ? null : json['firstChapterTitle'] as String, dedication: json['dedication'] == null ? null : json['dedication'] as String, title: json['title'] == null ? null : json['title'] as String, occasion: json['occasion'] == null ? null : json['occasion'] as String, occasionDate: json['occasionDate'] == null ? null : json['occasionDate'] as String);

  Map<String, dynamic> toJson() => {'theme': theme, 'language': language, 'authorName': authorName, 'authorGender': authorGender, if (recipientName != null) 'recipientName': recipientName!, if (recipientGender != null) 'recipientGender': recipientGender!, if (recordedBy != null) 'recordedBy': recordedBy!, if (firstChapterTitle != null) 'firstChapterTitle': firstChapterTitle!, if (dedication != null) 'dedication': dedication!, if (title != null) 'title': title!, if (occasion != null) 'occasion': occasion!, if (occasionDate != null) 'occasionDate': occasionDate!};
}

class CreatedBook {
  final String id;

  const CreatedBook({required this.id});

  factory CreatedBook.fromJson(Map<String, dynamic> json) => CreatedBook(id: json['id'] as String);

  Map<String, dynamic> toJson() => {'id': id};
}

class OrderBrief {
  final String id;
  final int number;
  final String status;
  final bool printed;

  const OrderBrief({required this.id, required this.number, required this.status, required this.printed});

  factory OrderBrief.fromJson(Map<String, dynamic> json) => OrderBrief(id: json['id'] as String, number: (json['number'] as num).toInt(), status: json['status'] as String, printed: json['printed'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'status': status, 'printed': printed};
}

class BookSummary {
  final String id;
  final String title;
  final String theme;
  /// draft | ordered
  final String status;
  final String authorName;
  final String recipientName;
  final String updatedAt;
  final int answered;
  final int total;
  final int words;
  final int photos;
  final String coverTemplate;
  final String? coverPhotoUrl;
  final OrderBrief? order;

  const BookSummary({required this.id, required this.title, required this.theme, required this.status, required this.authorName, required this.recipientName, required this.updatedAt, required this.answered, required this.total, required this.words, required this.photos, required this.coverTemplate, this.coverPhotoUrl, this.order});

  factory BookSummary.fromJson(Map<String, dynamic> json) => BookSummary(id: json['id'] as String, title: json['title'] as String, theme: json['theme'] as String, status: json['status'] as String, authorName: json['authorName'] as String, recipientName: json['recipientName'] as String, updatedAt: json['updatedAt'] as String, answered: (json['answered'] as num).toInt(), total: (json['total'] as num).toInt(), words: (json['words'] as num).toInt(), photos: (json['photos'] as num).toInt(), coverTemplate: json['coverTemplate'] as String, coverPhotoUrl: json['coverPhotoUrl'] == null ? null : json['coverPhotoUrl'] as String, order: json['order'] == null ? null : OrderBrief.fromJson(json['order'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'theme': theme, 'status': status, 'authorName': authorName, 'recipientName': recipientName, 'updatedAt': updatedAt, 'answered': answered, 'total': total, 'words': words, 'photos': photos, 'coverTemplate': coverTemplate, 'coverPhotoUrl': coverPhotoUrl, 'order': order == null ? null : order!.toJson()};
}

class BookList {
  final List<BookSummary> books;

  const BookList({required this.books});

  factory BookList.fromJson(Map<String, dynamic> json) => BookList(books: (json['books'] as List).map((e) => BookSummary.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'books': books.map((e) => e.toJson()).toList()};
}

class AnswerMedia {
  final String id;
  /// video | music | audio
  final String kind;
  final String url;
  final String? fileId;
  final String title;
  final int? anchor;

  const AnswerMedia({required this.id, required this.kind, required this.url, this.fileId, required this.title, this.anchor});

  factory AnswerMedia.fromJson(Map<String, dynamic> json) => AnswerMedia(id: json['id'] as String, kind: json['kind'] as String, url: json['url'] as String, fileId: json['fileId'] == null ? null : json['fileId'] as String, title: json['title'] as String, anchor: json['anchor'] == null ? null : (json['anchor'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'kind': kind, 'url': url, if (fileId != null) 'fileId': fileId!, 'title': title, 'anchor': anchor};
}

class Question {
  final String id;
  final String chapter;
  final String chapterTitle;
  final String prompt;
  final String? hint;
  final String defaultTitle;
  final String? displayText;
  final bool hideHeading;
  final String answer;
  final List<AnswerMedia> media;
  final bool isCustom;
  final bool pageBreak;

  const Question({required this.id, required this.chapter, required this.chapterTitle, required this.prompt, this.hint, required this.defaultTitle, this.displayText, required this.hideHeading, required this.answer, required this.media, required this.isCustom, required this.pageBreak});

  factory Question.fromJson(Map<String, dynamic> json) => Question(id: json['id'] as String, chapter: json['chapter'] as String, chapterTitle: json['chapterTitle'] as String, prompt: json['prompt'] as String, hint: json['hint'] == null ? null : json['hint'] as String, defaultTitle: json['defaultTitle'] as String, displayText: json['displayText'] == null ? null : json['displayText'] as String, hideHeading: json['hideHeading'] as bool, answer: json['answer'] as String, media: (json['media'] as List).map((e) => AnswerMedia.fromJson(e as Map<String, dynamic>)).toList(), isCustom: json['isCustom'] as bool, pageBreak: json['pageBreak'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'chapter': chapter, 'chapterTitle': chapterTitle, 'prompt': prompt, 'hint': hint, 'defaultTitle': defaultTitle, 'displayText': displayText, 'hideHeading': hideHeading, 'answer': answer, 'media': media.map((e) => e.toJson()).toList(), 'isCustom': isCustom, 'pageBreak': pageBreak};
}

class Chapter {
  final String key;
  final String title;
  final String epigraph;
  final bool own;

  const Chapter({required this.key, required this.title, required this.epigraph, required this.own});

  factory Chapter.fromJson(Map<String, dynamic> json) => Chapter(key: json['key'] as String, title: json['title'] as String, epigraph: json['epigraph'] as String, own: json['own'] as bool);

  Map<String, dynamic> toJson() => {'key': key, 'title': title, 'epigraph': epigraph, 'own': own};
}

class Photo {
  final String id;
  final int width;
  final int height;
  final String caption;
  /// full | bleed | half | grid
  final String layout;
  final String? questionId;
  final String thumbUrl;
  final String url;

  const Photo({required this.id, required this.width, required this.height, required this.caption, required this.layout, this.questionId, required this.thumbUrl, required this.url});

  factory Photo.fromJson(Map<String, dynamic> json) => Photo(id: json['id'] as String, width: (json['width'] as num).toInt(), height: (json['height'] as num).toInt(), caption: json['caption'] as String, layout: json['layout'] as String, questionId: json['questionId'] == null ? null : json['questionId'] as String, thumbUrl: json['thumbUrl'] as String, url: json['url'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'width': width, 'height': height, 'caption': caption, 'layout': layout, 'questionId': questionId, 'thumbUrl': thumbUrl, 'url': url};
}

class BookEditor {
  final BookEditorBook book;
  final bool editable;
  final List<Chapter> chapters;
  final List<Question> questions;
  final List<Photo> photos;
  final int maxPhotos;

  const BookEditor({required this.book, required this.editable, required this.chapters, required this.questions, required this.photos, required this.maxPhotos});

  factory BookEditor.fromJson(Map<String, dynamic> json) => BookEditor(book: BookEditorBook.fromJson(json['book'] as Map<String, dynamic>), editable: json['editable'] as bool, chapters: (json['chapters'] as List).map((e) => Chapter.fromJson(e as Map<String, dynamic>)).toList(), questions: (json['questions'] as List).map((e) => Question.fromJson(e as Map<String, dynamic>)).toList(), photos: (json['photos'] as List).map((e) => Photo.fromJson(e as Map<String, dynamic>)).toList(), maxPhotos: (json['maxPhotos'] as num).toInt());

  Map<String, dynamic> toJson() => {'book': book.toJson(), 'editable': editable, 'chapters': chapters.map((e) => e.toJson()).toList(), 'questions': questions.map((e) => e.toJson()).toList(), 'photos': photos.map((e) => e.toJson()).toList(), 'maxPhotos': maxPhotos};
}

class BookEditorBook {
  final String id;
  final String title;
  final String theme;
  /// draft | ordered
  final String status;
  /// ru | kk
  final String language;
  final String kind;

  const BookEditorBook({required this.id, required this.title, required this.theme, required this.status, required this.language, required this.kind});

  factory BookEditorBook.fromJson(Map<String, dynamic> json) => BookEditorBook(id: json['id'] as String, title: json['title'] as String, theme: json['theme'] as String, status: json['status'] as String, language: json['language'] as String, kind: json['kind'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'theme': theme, 'status': status, 'language': language, 'kind': kind};
}

class QuestionPatch {
  final String? answer;
  final String? displayText;
  final bool? hideHeading;
  final bool? pageBreak;
  final List<AnswerMedia>? media;
  final String? title;
  final String? prompt;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const QuestionPatch({this.answer, this.displayText, this.hideHeading, this.pageBreak, this.media, this.title, this.prompt, this.nulls = const {}});

  factory QuestionPatch.fromJson(Map<String, dynamic> json) => QuestionPatch(answer: json['answer'] == null ? null : json['answer'] as String, displayText: json['displayText'] == null ? null : json['displayText'] as String, hideHeading: json['hideHeading'] == null ? null : json['hideHeading'] as bool, pageBreak: json['pageBreak'] == null ? null : json['pageBreak'] as bool, media: json['media'] == null ? null : (json['media'] as List).map((e) => AnswerMedia.fromJson(e as Map<String, dynamic>)).toList(), title: json['title'] == null ? null : json['title'] as String, prompt: json['prompt'] == null ? null : json['prompt'] as String);

  Map<String, dynamic> toJson() => {if (answer != null) 'answer': answer!, if (displayText != null || nulls.contains('displayText')) 'displayText': displayText, if (hideHeading != null) 'hideHeading': hideHeading!, if (pageBreak != null) 'pageBreak': pageBreak!, if (media != null) 'media': media!.map((e) => e.toJson()).toList(), if (title != null) 'title': title!, if (prompt != null) 'prompt': prompt!};
}

class PhotoPatch {
  final String? caption;
  /// full | bleed | half | grid
  final String? layout;
  final String? questionId;
  final PhotoPatchInline? inline;
  final String? chapter;
  final bool? opener;
  final PhotoPatchCrop? crop;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const PhotoPatch({this.caption, this.layout, this.questionId, this.inline, this.chapter, this.opener, this.crop, this.nulls = const {}});

  factory PhotoPatch.fromJson(Map<String, dynamic> json) => PhotoPatch(caption: json['caption'] == null ? null : json['caption'] as String, layout: json['layout'] == null ? null : json['layout'] as String, questionId: json['questionId'] == null ? null : json['questionId'] as String, inline: json['inline'] == null ? null : PhotoPatchInline.fromJson(json['inline'] as Map<String, dynamic>), chapter: json['chapter'] == null ? null : json['chapter'] as String, opener: json['opener'] == null ? null : json['opener'] as bool, crop: json['crop'] == null ? null : PhotoPatchCrop.fromJson(json['crop'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {if (caption != null) 'caption': caption!, if (layout != null) 'layout': layout!, if (questionId != null || nulls.contains('questionId')) 'questionId': questionId, if (inline != null || nulls.contains('inline')) 'inline': inline == null ? null : inline!.toJson(), if (chapter != null || nulls.contains('chapter')) 'chapter': chapter, if (opener != null) 'opener': opener!, if (crop != null || nulls.contains('crop')) 'crop': crop == null ? null : crop!.toJson()};
}

class PhotoPatchInline {
  final double width;
  /// left | center | right
  final String align;
  final int? anchor;
  /// original | 1:1 | 4:3 | 3:4 | 16:9
  final String aspect;
  final double focusX;
  final double focusY;
  /// none | line | polaroid | round
  final String frame;
  final bool? page;
  final String? pageFit;
  final bool? keepSize;
  final double? spaceAbove;
  final bool? breakBefore;

  const PhotoPatchInline({required this.width, required this.align, this.anchor, required this.aspect, required this.focusX, required this.focusY, required this.frame, this.page, this.pageFit, this.keepSize, this.spaceAbove, this.breakBefore});

  factory PhotoPatchInline.fromJson(Map<String, dynamic> json) => PhotoPatchInline(width: (json['width'] as num).toDouble(), align: json['align'] as String, anchor: json['anchor'] == null ? null : (json['anchor'] as num).toInt(), aspect: json['aspect'] as String, focusX: (json['focusX'] as num).toDouble(), focusY: (json['focusY'] as num).toDouble(), frame: json['frame'] as String, page: json['page'] == null ? null : json['page'] as bool, pageFit: json['pageFit'] == null ? null : json['pageFit'] as String, keepSize: json['keepSize'] == null ? null : json['keepSize'] as bool, spaceAbove: json['spaceAbove'] == null ? null : (json['spaceAbove'] as num).toDouble(), breakBefore: json['breakBefore'] == null ? null : json['breakBefore'] as bool);

  Map<String, dynamic> toJson() => {'width': width, 'align': align, 'anchor': anchor, 'aspect': aspect, 'focusX': focusX, 'focusY': focusY, 'frame': frame, if (page != null) 'page': page!, if (pageFit != null) 'pageFit': pageFit!, if (keepSize != null) 'keepSize': keepSize!, if (spaceAbove != null) 'spaceAbove': spaceAbove!, if (breakBefore != null) 'breakBefore': breakBefore!};
}

class PhotoPatchCrop {
  final double x;
  final double y;
  final double zoom;

  const PhotoPatchCrop({required this.x, required this.y, required this.zoom});

  factory PhotoPatchCrop.fromJson(Map<String, dynamic> json) => PhotoPatchCrop(x: (json['x'] as num).toDouble(), y: (json['y'] as num).toDouble(), zoom: (json['zoom'] as num).toDouble());

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 'zoom': zoom};
}

class PhotoUploadResult {
  final List<Photo> photos;
  final List<String> errors;

  const PhotoUploadResult({required this.photos, required this.errors});

  factory PhotoUploadResult.fromJson(Map<String, dynamic> json) => PhotoUploadResult(photos: (json['photos'] as List).map((e) => Photo.fromJson(e as Map<String, dynamic>)).toList(), errors: (json['errors'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'photos': photos.map((e) => e.toJson()).toList(), 'errors': errors.map((e) => e).toList()};
}

class PhotoSaved {
  final Photo photo;
  final int layoutRev;

  const PhotoSaved({required this.photo, required this.layoutRev});

  factory PhotoSaved.fromJson(Map<String, dynamic> json) => PhotoSaved(photo: Photo.fromJson(json['photo'] as Map<String, dynamic>), layoutRev: (json['layoutRev'] as num).toInt());

  Map<String, dynamic> toJson() => {'photo': photo.toJson(), 'layoutRev': layoutRev};
}

class DictationResult {
  final String text;

  const DictationResult({required this.text});

  factory DictationResult.fromJson(Map<String, dynamic> json) => DictationResult(text: json['text'] as String);

  Map<String, dynamic> toJson() => {'text': text};
}

class Saved {
  final bool ok;
  final String updatedAt;

  const Saved({required this.ok, required this.updatedAt});

  factory Saved.fromJson(Map<String, dynamic> json) => Saved(ok: json['ok'] as bool, updatedAt: json['updatedAt'] as String);

  Map<String, dynamic> toJson() => {'ok': ok, 'updatedAt': updatedAt};
}

class Letter {
  final String id;
  final String authorName;
  final String relation;
  final String text;
  /// pending | approved | hidden
  final String status;
  final String createdAt;

  const Letter({required this.id, required this.authorName, required this.relation, required this.text, required this.status, required this.createdAt});

  factory Letter.fromJson(Map<String, dynamic> json) => Letter(id: json['id'] as String, authorName: json['authorName'] as String, relation: json['relation'] as String, text: json['text'] as String, status: json['status'] as String, createdAt: json['createdAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'authorName': authorName, 'relation': relation, 'text': text, 'status': status, 'createdAt': createdAt};
}

class LetterInvite {
  final bool enabled;
  final String? url;
  final String text;
  final String? shareText;

  const LetterInvite({required this.enabled, this.url, required this.text, this.shareText});

  factory LetterInvite.fromJson(Map<String, dynamic> json) => LetterInvite(enabled: json['enabled'] as bool, url: json['url'] == null ? null : json['url'] as String, text: json['text'] as String, shareText: json['shareText'] == null ? null : json['shareText'] as String);

  Map<String, dynamic> toJson() => {'enabled': enabled, 'url': url, 'text': text, 'shareText': shareText};
}

class LettersLabels {
  final String title;
  final String lead;
  final LettersLabelsTabs tabs;
  final LettersLabelsEmpty empty;
  final LettersLabelsEmptyText emptyText;
  final String linkTitle;
  final String linkText;
  final String copy;
  final String copied;
  final String whatsapp;
  final String inviteText;
  final String inviteTextHint;
  final String invitePlaceholder;
  final String privacy;
  final String regen;
  final String regenTitle;
  final String regenText;
  final String regenConfirm;
  final String close;
  final String create;
  final String approve;
  final String unapprove;
  final String edit;
  final String hide;
  final String delete;
  final String deleteTitle;
  final String deleteText;
  final String relation;
  final String moveUp;
  final String moveDown;
  final String orderHint;
  final String readMore;
  final String save;
  final String cancel;

  const LettersLabels({required this.title, required this.lead, required this.tabs, required this.empty, required this.emptyText, required this.linkTitle, required this.linkText, required this.copy, required this.copied, required this.whatsapp, required this.inviteText, required this.inviteTextHint, required this.invitePlaceholder, required this.privacy, required this.regen, required this.regenTitle, required this.regenText, required this.regenConfirm, required this.close, required this.create, required this.approve, required this.unapprove, required this.edit, required this.hide, required this.delete, required this.deleteTitle, required this.deleteText, required this.relation, required this.moveUp, required this.moveDown, required this.orderHint, required this.readMore, required this.save, required this.cancel});

  factory LettersLabels.fromJson(Map<String, dynamic> json) => LettersLabels(title: json['title'] as String, lead: json['lead'] as String, tabs: LettersLabelsTabs.fromJson(json['tabs'] as Map<String, dynamic>), empty: LettersLabelsEmpty.fromJson(json['empty'] as Map<String, dynamic>), emptyText: LettersLabelsEmptyText.fromJson(json['emptyText'] as Map<String, dynamic>), linkTitle: json['linkTitle'] as String, linkText: json['linkText'] as String, copy: json['copy'] as String, copied: json['copied'] as String, whatsapp: json['whatsapp'] as String, inviteText: json['inviteText'] as String, inviteTextHint: json['inviteTextHint'] as String, invitePlaceholder: json['invitePlaceholder'] as String, privacy: json['privacy'] as String, regen: json['regen'] as String, regenTitle: json['regenTitle'] as String, regenText: json['regenText'] as String, regenConfirm: json['regenConfirm'] as String, close: json['close'] as String, create: json['create'] as String, approve: json['approve'] as String, unapprove: json['unapprove'] as String, edit: json['edit'] as String, hide: json['hide'] as String, delete: json['delete'] as String, deleteTitle: json['deleteTitle'] as String, deleteText: json['deleteText'] as String, relation: json['relation'] as String, moveUp: json['moveUp'] as String, moveDown: json['moveDown'] as String, orderHint: json['orderHint'] as String, readMore: json['readMore'] as String, save: json['save'] as String, cancel: json['cancel'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'lead': lead, 'tabs': tabs.toJson(), 'empty': empty.toJson(), 'emptyText': emptyText.toJson(), 'linkTitle': linkTitle, 'linkText': linkText, 'copy': copy, 'copied': copied, 'whatsapp': whatsapp, 'inviteText': inviteText, 'inviteTextHint': inviteTextHint, 'invitePlaceholder': invitePlaceholder, 'privacy': privacy, 'regen': regen, 'regenTitle': regenTitle, 'regenText': regenText, 'regenConfirm': regenConfirm, 'close': close, 'create': create, 'approve': approve, 'unapprove': unapprove, 'edit': edit, 'hide': hide, 'delete': delete, 'deleteTitle': deleteTitle, 'deleteText': deleteText, 'relation': relation, 'moveUp': moveUp, 'moveDown': moveDown, 'orderHint': orderHint, 'readMore': readMore, 'save': save, 'cancel': cancel};
}

class LettersLabelsTabs {
  final String pending;
  final String approved;
  final String hidden;

  const LettersLabelsTabs({required this.pending, required this.approved, required this.hidden});

  factory LettersLabelsTabs.fromJson(Map<String, dynamic> json) => LettersLabelsTabs(pending: json['pending'] as String, approved: json['approved'] as String, hidden: json['hidden'] as String);

  Map<String, dynamic> toJson() => {'pending': pending, 'approved': approved, 'hidden': hidden};
}

class LettersLabelsEmpty {
  final String pending;
  final String approved;
  final String hidden;

  const LettersLabelsEmpty({required this.pending, required this.approved, required this.hidden});

  factory LettersLabelsEmpty.fromJson(Map<String, dynamic> json) => LettersLabelsEmpty(pending: json['pending'] as String, approved: json['approved'] as String, hidden: json['hidden'] as String);

  Map<String, dynamic> toJson() => {'pending': pending, 'approved': approved, 'hidden': hidden};
}

class LettersLabelsEmptyText {
  final String pending;
  final String pendingInvited;
  final String approved;
  final String hidden;

  const LettersLabelsEmptyText({required this.pending, required this.pendingInvited, required this.approved, required this.hidden});

  factory LettersLabelsEmptyText.fromJson(Map<String, dynamic> json) => LettersLabelsEmptyText(pending: json['pending'] as String, pendingInvited: json['pendingInvited'] as String, approved: json['approved'] as String, hidden: json['hidden'] as String);

  Map<String, dynamic> toJson() => {'pending': pending, 'pendingInvited': pendingInvited, 'approved': approved, 'hidden': hidden};
}

class LettersView {
  final List<Letter> letters;
  final LetterInvite invite;
  final int max;
  final bool editable;
  final LettersLabels labels;
  final LettersViewLimits limits;

  const LettersView({required this.letters, required this.invite, required this.max, required this.editable, required this.labels, required this.limits});

  factory LettersView.fromJson(Map<String, dynamic> json) => LettersView(letters: (json['letters'] as List).map((e) => Letter.fromJson(e as Map<String, dynamic>)).toList(), invite: LetterInvite.fromJson(json['invite'] as Map<String, dynamic>), max: (json['max'] as num).toInt(), editable: json['editable'] as bool, labels: LettersLabels.fromJson(json['labels'] as Map<String, dynamic>), limits: LettersViewLimits.fromJson(json['limits'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'letters': letters.map((e) => e.toJson()).toList(), 'invite': invite.toJson(), 'max': max, 'editable': editable, 'labels': labels.toJson(), 'limits': limits.toJson()};
}

class LettersViewLimits {
  final int inviteText;
  final int authorName;
  final int relation;
  final int text;

  const LettersViewLimits({required this.inviteText, required this.authorName, required this.relation, required this.text});

  factory LettersViewLimits.fromJson(Map<String, dynamic> json) => LettersViewLimits(inviteText: (json['inviteText'] as num).toInt(), authorName: (json['authorName'] as num).toInt(), relation: (json['relation'] as num).toInt(), text: (json['text'] as num).toInt());

  Map<String, dynamic> toJson() => {'inviteText': inviteText, 'authorName': authorName, 'relation': relation, 'text': text};
}

class LetterInviteBody {
  final bool enabled;
  final bool? regenerate;

  const LetterInviteBody({required this.enabled, this.regenerate});

  factory LetterInviteBody.fromJson(Map<String, dynamic> json) => LetterInviteBody(enabled: json['enabled'] as bool, regenerate: json['regenerate'] == null ? null : json['regenerate'] as bool);

  Map<String, dynamic> toJson() => {'enabled': enabled, if (regenerate != null) 'regenerate': regenerate!};
}

class LetterInviteText {
  final String text;

  const LetterInviteText({required this.text});

  factory LetterInviteText.fromJson(Map<String, dynamic> json) => LetterInviteText(text: json['text'] as String);

  Map<String, dynamic> toJson() => {'text': text};
}

class LetterPatch {
  /// pending | approved | hidden
  final String? status;
  final String? authorName;
  final String? relation;
  final String? text;

  const LetterPatch({this.status, this.authorName, this.relation, this.text});

  factory LetterPatch.fromJson(Map<String, dynamic> json) => LetterPatch(status: json['status'] == null ? null : json['status'] as String, authorName: json['authorName'] == null ? null : json['authorName'] as String, relation: json['relation'] == null ? null : json['relation'] as String, text: json['text'] == null ? null : json['text'] as String);

  Map<String, dynamic> toJson() => {if (status != null) 'status': status!, if (authorName != null) 'authorName': authorName!, if (relation != null) 'relation': relation!, if (text != null) 'text': text!};
}

class LetterSaved {
  final Letter letter;

  const LetterSaved({required this.letter});

  factory LetterSaved.fromJson(Map<String, dynamic> json) => LetterSaved(letter: Letter.fromJson(json['letter'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'letter': letter.toJson()};
}

class LettersOrder {
  final List<String> ids;

  const LettersOrder({required this.ids});

  factory LettersOrder.fromJson(Map<String, dynamic> json) => LettersOrder(ids: (json['ids'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'ids': ids.map((e) => e).toList()};
}

class BookPage {
  final int n;
  /// front | toc | opener | text | photo | gallery | end | blank | pad
  final String kind;
  final String? chapterKey;

  const BookPage({required this.n, required this.kind, this.chapterKey});

  factory BookPage.fromJson(Map<String, dynamic> json) => BookPage(n: (json['n'] as num).toInt(), kind: json['kind'] as String, chapterKey: json['chapterKey'] == null ? null : json['chapterKey'] as String);

  Map<String, dynamic> toJson() => {'n': n, 'kind': kind, 'chapterKey': chapterKey};
}

class BookBuild {
  final String fp;
  final int pageCount;
  final int contentPages;
  final BookBuildTrimMm trimMm;
  final List<BookPage> pages;
  final Map<String, dynamic> chapterPages;
  final String imageBase;
  final List<int> imageWidths;

  const BookBuild({required this.fp, required this.pageCount, required this.contentPages, required this.trimMm, required this.pages, required this.chapterPages, required this.imageBase, required this.imageWidths});

  factory BookBuild.fromJson(Map<String, dynamic> json) => BookBuild(fp: json['fp'] as String, pageCount: (json['pageCount'] as num).toInt(), contentPages: (json['contentPages'] as num).toInt(), trimMm: BookBuildTrimMm.fromJson(json['trimMm'] as Map<String, dynamic>), pages: (json['pages'] as List).map((e) => BookPage.fromJson(e as Map<String, dynamic>)).toList(), chapterPages: json['chapterPages'] as Map<String, dynamic>, imageBase: json['imageBase'] as String, imageWidths: (json['imageWidths'] as List).map((e) => (e as num).toInt()).toList());

  Map<String, dynamic> toJson() => {'fp': fp, 'pageCount': pageCount, 'contentPages': contentPages, 'trimMm': trimMm.toJson(), 'pages': pages.map((e) => e.toJson()).toList(), 'chapterPages': chapterPages, 'imageBase': imageBase, 'imageWidths': imageWidths.map((e) => e).toList()};
}

class BookBuildTrimMm {
  final double w;
  final double h;

  const BookBuildTrimMm({required this.w, required this.h});

  factory BookBuildTrimMm.fromJson(Map<String, dynamic> json) => BookBuildTrimMm(w: (json['w'] as num).toDouble(), h: (json['h'] as num).toDouble());

  Map<String, dynamic> toJson() => {'w': w, 'h': h};
}

class BuildState {
  /// ready | building | failed
  final String status;
  final BookBuild? build;
  final String? error;
  final int? retryInMs;
  final String pdfUrl;

  const BuildState({required this.status, this.build, this.error, this.retryInMs, required this.pdfUrl});

  factory BuildState.fromJson(Map<String, dynamic> json) => BuildState(status: json['status'] as String, build: json['build'] == null ? null : BookBuild.fromJson(json['build'] as Map<String, dynamic>), error: json['error'] == null ? null : json['error'] as String, retryInMs: json['retryInMs'] == null ? null : (json['retryInMs'] as num).toInt(), pdfUrl: json['pdfUrl'] as String);

  Map<String, dynamic> toJson() => {'status': status, 'build': build == null ? null : build!.toJson(), 'error': error, 'retryInMs': retryInMs, 'pdfUrl': pdfUrl};
}

class BuildProgress {
  final BuildProgressProgress? progress;

  const BuildProgress({this.progress});

  factory BuildProgress.fromJson(Map<String, dynamic> json) => BuildProgress(progress: json['progress'] == null ? null : BuildProgressProgress.fromJson(json['progress'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'progress': progress == null ? null : progress!.toJson()};
}

class BuildProgressProgress {
  /// queued | running
  final String state;
  final String? stage;
  final int percent;
  final int? etaMs;
  final bool overrun;
  final int ahead;

  const BuildProgressProgress({required this.state, this.stage, required this.percent, this.etaMs, required this.overrun, required this.ahead});

  factory BuildProgressProgress.fromJson(Map<String, dynamic> json) => BuildProgressProgress(state: json['state'] as String, stage: json['stage'] == null ? null : json['stage'] as String, percent: (json['percent'] as num).toInt(), etaMs: json['etaMs'] == null ? null : (json['etaMs'] as num).toInt(), overrun: json['overrun'] as bool, ahead: (json['ahead'] as num).toInt());

  Map<String, dynamic> toJson() => {'state': state, 'stage': stage, 'percent': percent, 'etaMs': etaMs, 'overrun': overrun, 'ahead': ahead};
}

class Review {
  final int rating;
  final String text;
  final String authorName;
  final String city;
  final bool consent;
  final String status;
  final String? photoUrl;
  final String? thankYouCode;

  const Review({required this.rating, required this.text, required this.authorName, required this.city, required this.consent, required this.status, this.photoUrl, this.thankYouCode});

  factory Review.fromJson(Map<String, dynamic> json) => Review(rating: (json['rating'] as num).toInt(), text: json['text'] as String, authorName: json['authorName'] as String, city: json['city'] as String, consent: json['consent'] as bool, status: json['status'] as String, photoUrl: json['photoUrl'] == null ? null : json['photoUrl'] as String, thankYouCode: json['thankYouCode'] == null ? null : json['thankYouCode'] as String);

  Map<String, dynamic> toJson() => {'rating': rating, 'text': text, 'authorName': authorName, 'city': city, 'consent': consent, 'status': status, 'photoUrl': photoUrl, 'thankYouCode': thankYouCode};
}

class ReviewLabels {
  final String order;
  final String title;
  final String subtitle;
  final String ratingAria;
  final List<String> ratings;
  final String textLabel;
  final String textHigh;
  final String textLow;
  final String photo;
  final String photoHint;
  final String photoChoose;
  final String photoRemove;
  final String photoAttached;
  final String name;
  final String city;
  final String cityPlaceholder;
  final String consent;
  final String submit;
  final String update;
  final String editable;
  final String chooseRating;
  final String thanksTitle;
  final String thanksHigh;
  final String thanksLow;
  final String promoTitle;
  final String promoText;
  final String copy;
  final String copied;
  final String locked;
  final String notYet;
  final ReviewLabelsCard card;

  const ReviewLabels({required this.order, required this.title, required this.subtitle, required this.ratingAria, required this.ratings, required this.textLabel, required this.textHigh, required this.textLow, required this.photo, required this.photoHint, required this.photoChoose, required this.photoRemove, required this.photoAttached, required this.name, required this.city, required this.cityPlaceholder, required this.consent, required this.submit, required this.update, required this.editable, required this.chooseRating, required this.thanksTitle, required this.thanksHigh, required this.thanksLow, required this.promoTitle, required this.promoText, required this.copy, required this.copied, required this.locked, required this.notYet, required this.card});

  factory ReviewLabels.fromJson(Map<String, dynamic> json) => ReviewLabels(order: json['order'] as String, title: json['title'] as String, subtitle: json['subtitle'] as String, ratingAria: json['ratingAria'] as String, ratings: (json['ratings'] as List).map((e) => e as String).toList(), textLabel: json['textLabel'] as String, textHigh: json['textHigh'] as String, textLow: json['textLow'] as String, photo: json['photo'] as String, photoHint: json['photoHint'] as String, photoChoose: json['photoChoose'] as String, photoRemove: json['photoRemove'] as String, photoAttached: json['photoAttached'] as String, name: json['name'] as String, city: json['city'] as String, cityPlaceholder: json['cityPlaceholder'] as String, consent: json['consent'] as String, submit: json['submit'] as String, update: json['update'] as String, editable: json['editable'] as String, chooseRating: json['chooseRating'] as String, thanksTitle: json['thanksTitle'] as String, thanksHigh: json['thanksHigh'] as String, thanksLow: json['thanksLow'] as String, promoTitle: json['promoTitle'] as String, promoText: json['promoText'] as String, copy: json['copy'] as String, copied: json['copied'] as String, locked: json['locked'] as String, notYet: json['notYet'] as String, card: ReviewLabelsCard.fromJson(json['card'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'order': order, 'title': title, 'subtitle': subtitle, 'ratingAria': ratingAria, 'ratings': ratings.map((e) => e).toList(), 'textLabel': textLabel, 'textHigh': textHigh, 'textLow': textLow, 'photo': photo, 'photoHint': photoHint, 'photoChoose': photoChoose, 'photoRemove': photoRemove, 'photoAttached': photoAttached, 'name': name, 'city': city, 'cityPlaceholder': cityPlaceholder, 'consent': consent, 'submit': submit, 'update': update, 'editable': editable, 'chooseRating': chooseRating, 'thanksTitle': thanksTitle, 'thanksHigh': thanksHigh, 'thanksLow': thanksLow, 'promoTitle': promoTitle, 'promoText': promoText, 'copy': copy, 'copied': copied, 'locked': locked, 'notYet': notYet, 'card': card.toJson()};
}

class ReviewLabelsCard {
  final String title;
  final String text;
  final String button;
  final String done;
  final String code;
  final String edit;

  const ReviewLabelsCard({required this.title, required this.text, required this.button, required this.done, required this.code, required this.edit});

  factory ReviewLabelsCard.fromJson(Map<String, dynamic> json) => ReviewLabelsCard(title: json['title'] as String, text: json['text'] as String, button: json['button'] as String, done: json['done'] as String, code: json['code'] as String, edit: json['edit'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'text': text, 'button': button, 'done': done, 'code': code, 'edit': edit};
}

class ReviewView {
  final bool canReview;
  final String defaultName;
  final Review? review;
  final String coverUrl;
  final ReviewLabels labels;
  final ReviewViewLimits limits;

  const ReviewView({required this.canReview, required this.defaultName, this.review, required this.coverUrl, required this.labels, required this.limits});

  factory ReviewView.fromJson(Map<String, dynamic> json) => ReviewView(canReview: json['canReview'] as bool, defaultName: json['defaultName'] as String, review: json['review'] == null ? null : Review.fromJson(json['review'] as Map<String, dynamic>), coverUrl: json['coverUrl'] as String, labels: ReviewLabels.fromJson(json['labels'] as Map<String, dynamic>), limits: ReviewViewLimits.fromJson(json['limits'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'canReview': canReview, 'defaultName': defaultName, 'review': review == null ? null : review!.toJson(), 'coverUrl': coverUrl, 'labels': labels.toJson(), 'limits': limits.toJson()};
}

class ReviewViewLimits {
  final int text;
  final int authorName;
  final int city;

  const ReviewViewLimits({required this.text, required this.authorName, required this.city});

  factory ReviewViewLimits.fromJson(Map<String, dynamic> json) => ReviewViewLimits(text: (json['text'] as num).toInt(), authorName: (json['authorName'] as num).toInt(), city: (json['city'] as num).toInt());

  Map<String, dynamic> toJson() => {'text': text, 'authorName': authorName, 'city': city};
}

class ReviewBody {
  final int rating;
  final String text;
  final String authorName;
  final String city;
  final bool consent;

  const ReviewBody({required this.rating, required this.text, required this.authorName, required this.city, required this.consent});

  factory ReviewBody.fromJson(Map<String, dynamic> json) => ReviewBody(rating: (json['rating'] as num).toInt(), text: json['text'] as String, authorName: json['authorName'] as String, city: json['city'] as String, consent: json['consent'] as bool);

  Map<String, dynamic> toJson() => {'rating': rating, 'text': text, 'authorName': authorName, 'city': city, 'consent': consent};
}

class CoverPatch {
  final String? title;
  final String? authorName;
  final String? recordedBy;
  final String? recipientName;
  final String? subtitle;
  final bool? hideRecipientOnCover;
  final String? namesOnCover;
  final String? coverTemplate;
  final bool? coverLines;
  final String? coverPhotoId;
  final List<String>? coverPhotoExtra;
  final String? backText;
  final String? backLayout;
  final String? backPhotoId;
  final List<String>? backPhotoExtra;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CoverPatch({this.title, this.authorName, this.recordedBy, this.recipientName, this.subtitle, this.hideRecipientOnCover, this.namesOnCover, this.coverTemplate, this.coverLines, this.coverPhotoId, this.coverPhotoExtra, this.backText, this.backLayout, this.backPhotoId, this.backPhotoExtra, this.nulls = const {}});

  factory CoverPatch.fromJson(Map<String, dynamic> json) => CoverPatch(title: json['title'] == null ? null : json['title'] as String, authorName: json['authorName'] == null ? null : json['authorName'] as String, recordedBy: json['recordedBy'] == null ? null : json['recordedBy'] as String, recipientName: json['recipientName'] == null ? null : json['recipientName'] as String, subtitle: json['subtitle'] == null ? null : json['subtitle'] as String, hideRecipientOnCover: json['hideRecipientOnCover'] == null ? null : json['hideRecipientOnCover'] as bool, namesOnCover: json['namesOnCover'] == null ? null : json['namesOnCover'] as String, coverTemplate: json['coverTemplate'] == null ? null : json['coverTemplate'] as String, coverLines: json['coverLines'] == null ? null : json['coverLines'] as bool, coverPhotoId: json['coverPhotoId'] == null ? null : json['coverPhotoId'] as String, coverPhotoExtra: json['coverPhotoExtra'] == null ? null : (json['coverPhotoExtra'] as List).map((e) => e as String).toList(), backText: json['backText'] == null ? null : json['backText'] as String, backLayout: json['backLayout'] == null ? null : json['backLayout'] as String, backPhotoId: json['backPhotoId'] == null ? null : json['backPhotoId'] as String, backPhotoExtra: json['backPhotoExtra'] == null ? null : (json['backPhotoExtra'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {if (title != null) 'title': title!, if (authorName != null) 'authorName': authorName!, if (recordedBy != null) 'recordedBy': recordedBy!, if (recipientName != null) 'recipientName': recipientName!, if (subtitle != null) 'subtitle': subtitle!, if (hideRecipientOnCover != null) 'hideRecipientOnCover': hideRecipientOnCover!, if (namesOnCover != null) 'namesOnCover': namesOnCover!, if (coverTemplate != null) 'coverTemplate': coverTemplate!, if (coverLines != null) 'coverLines': coverLines!, if (coverPhotoId != null || nulls.contains('coverPhotoId')) 'coverPhotoId': coverPhotoId, if (coverPhotoExtra != null) 'coverPhotoExtra': coverPhotoExtra!.map((e) => e).toList(), if (backText != null) 'backText': backText!, if (backLayout != null) 'backLayout': backLayout!, if (backPhotoId != null || nulls.contains('backPhotoId')) 'backPhotoId': backPhotoId, if (backPhotoExtra != null) 'backPhotoExtra': backPhotoExtra!.map((e) => e).toList()};
}

class CoverTemplate {
  final String id;
  final String name;
  final String mood;
  final bool requiresPhoto;
  final int photoSlots;
  final String previewUrl;

  const CoverTemplate({required this.id, required this.name, required this.mood, required this.requiresPhoto, required this.photoSlots, required this.previewUrl});

  factory CoverTemplate.fromJson(Map<String, dynamic> json) => CoverTemplate(id: json['id'] as String, name: json['name'] as String, mood: json['mood'] as String, requiresPhoto: json['requiresPhoto'] as bool, photoSlots: (json['photoSlots'] as num).toInt(), previewUrl: json['previewUrl'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'mood': mood, 'requiresPhoto': requiresPhoto, 'photoSlots': photoSlots, 'previewUrl': previewUrl};
}

class Cover {
  final String template;
  final bool lines;
  final String title;
  final String subtitle;
  final String namesOnCover;
  final bool hideRecipientOnCover;
  final String authorName;
  final String recordedBy;
  final String recipientName;
  /// gift | autobiography | blank
  final String kind;
  final String? recipientLabel;
  final String autoNames;
  final int year;
  final List<String?> photoIds;
  final String backText;
  final String backLayout;
  final String? backPhotoId;
  final bool hasDesign;
  final String imageUrl;
  final String backImageUrl;
  final bool editable;

  const Cover({required this.template, required this.lines, required this.title, required this.subtitle, required this.namesOnCover, required this.hideRecipientOnCover, required this.authorName, required this.recordedBy, required this.recipientName, required this.kind, this.recipientLabel, required this.autoNames, required this.year, required this.photoIds, required this.backText, required this.backLayout, this.backPhotoId, required this.hasDesign, required this.imageUrl, required this.backImageUrl, required this.editable});

  factory Cover.fromJson(Map<String, dynamic> json) => Cover(template: json['template'] as String, lines: json['lines'] as bool, title: json['title'] as String, subtitle: json['subtitle'] as String, namesOnCover: json['namesOnCover'] as String, hideRecipientOnCover: json['hideRecipientOnCover'] as bool, authorName: json['authorName'] as String, recordedBy: json['recordedBy'] as String, recipientName: json['recipientName'] as String, kind: json['kind'] as String, recipientLabel: json['recipientLabel'] == null ? null : json['recipientLabel'] as String, autoNames: json['autoNames'] as String, year: (json['year'] as num).toInt(), photoIds: (json['photoIds'] as List).map((e) => e == null ? null : e as String).toList(), backText: json['backText'] as String, backLayout: json['backLayout'] as String, backPhotoId: json['backPhotoId'] == null ? null : json['backPhotoId'] as String, hasDesign: json['hasDesign'] as bool, imageUrl: json['imageUrl'] as String, backImageUrl: json['backImageUrl'] as String, editable: json['editable'] as bool);

  Map<String, dynamic> toJson() => {'template': template, 'lines': lines, 'title': title, 'subtitle': subtitle, 'namesOnCover': namesOnCover, 'hideRecipientOnCover': hideRecipientOnCover, 'authorName': authorName, 'recordedBy': recordedBy, 'recipientName': recipientName, 'kind': kind, 'recipientLabel': recipientLabel, 'autoNames': autoNames, 'year': year, 'photoIds': photoIds.map((e) => e).toList(), 'backText': backText, 'backLayout': backLayout, 'backPhotoId': backPhotoId, 'hasDesign': hasDesign, 'imageUrl': imageUrl, 'backImageUrl': backImageUrl, 'editable': editable};
}

class CoverMood {
  final String id;
  final String label;

  const CoverMood({required this.id, required this.label});

  factory CoverMood.fromJson(Map<String, dynamic> json) => CoverMood(id: json['id'] as String, label: json['label'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'label': label};
}

class CoverBackLayout {
  final String id;
  final String name;
  final String hint;
  final String? label;
  final String? placeholder;
  final String? note;
  final int photos;
  final String? photosLabel;

  const CoverBackLayout({required this.id, required this.name, required this.hint, this.label, this.placeholder, this.note, required this.photos, this.photosLabel});

  factory CoverBackLayout.fromJson(Map<String, dynamic> json) => CoverBackLayout(id: json['id'] as String, name: json['name'] as String, hint: json['hint'] as String, label: json['label'] == null ? null : json['label'] as String, placeholder: json['placeholder'] == null ? null : json['placeholder'] as String, note: json['note'] == null ? null : json['note'] as String, photos: (json['photos'] as num).toInt(), photosLabel: json['photosLabel'] == null ? null : json['photosLabel'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'hint': hint, 'label': label, 'placeholder': placeholder, 'note': note, 'photos': photos, 'photosLabel': photosLabel};
}

class CoverLabels {
  final String title;
  final String saving;
  final CoverLabelsSides sides;
  final CoverLabelsTabs tabs;
  final String variants;
  final int shown;
  final String showAll;
  final String onCover;
  final String designActive;
  final String readonly;
  final CoverLabelsPhoto photo;
  final CoverLabelsText text;
  final CoverLabelsBack back;

  const CoverLabels({required this.title, required this.saving, required this.sides, required this.tabs, required this.variants, required this.shown, required this.showAll, required this.onCover, required this.designActive, required this.readonly, required this.photo, required this.text, required this.back});

  factory CoverLabels.fromJson(Map<String, dynamic> json) => CoverLabels(title: json['title'] as String, saving: json['saving'] as String, sides: CoverLabelsSides.fromJson(json['sides'] as Map<String, dynamic>), tabs: CoverLabelsTabs.fromJson(json['tabs'] as Map<String, dynamic>), variants: json['variants'] as String, shown: (json['shown'] as num).toInt(), showAll: json['showAll'] as String, onCover: json['onCover'] as String, designActive: json['designActive'] as String, readonly: json['readonly'] as String, photo: CoverLabelsPhoto.fromJson(json['photo'] as Map<String, dynamic>), text: CoverLabelsText.fromJson(json['text'] as Map<String, dynamic>), back: CoverLabelsBack.fromJson(json['back'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'title': title, 'saving': saving, 'sides': sides.toJson(), 'tabs': tabs.toJson(), 'variants': variants, 'shown': shown, 'showAll': showAll, 'onCover': onCover, 'designActive': designActive, 'readonly': readonly, 'photo': photo.toJson(), 'text': text.toJson(), 'back': back.toJson()};
}

class CoverLabelsSides {
  final String front;
  final String back;

  const CoverLabelsSides({required this.front, required this.back});

  factory CoverLabelsSides.fromJson(Map<String, dynamic> json) => CoverLabelsSides(front: json['front'] as String, back: json['back'] as String);

  Map<String, dynamic> toJson() => {'front': front, 'back': back};
}

class CoverLabelsTabs {
  final String designs;
  final String photo;
  final String text;
  final String variant;

  const CoverLabelsTabs({required this.designs, required this.photo, required this.text, required this.variant});

  factory CoverLabelsTabs.fromJson(Map<String, dynamic> json) => CoverLabelsTabs(designs: json['designs'] as String, photo: json['photo'] as String, text: json['text'] as String, variant: json['variant'] as String);

  Map<String, dynamic> toJson() => {'designs': designs, 'photo': photo, 'text': text, 'variant': variant};
}

class CoverLabelsPhoto {
  final String title;
  final List<String> slots;
  final String slotsHint;
  final String uploadFirst;
  final String note;

  const CoverLabelsPhoto({required this.title, required this.slots, required this.slotsHint, required this.uploadFirst, required this.note});

  factory CoverLabelsPhoto.fromJson(Map<String, dynamic> json) => CoverLabelsPhoto(title: json['title'] as String, slots: (json['slots'] as List).map((e) => e as String).toList(), slotsHint: json['slotsHint'] as String, uploadFirst: json['uploadFirst'] as String, note: json['note'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'slots': slots.map((e) => e).toList(), 'slotsHint': slotsHint, 'uploadFirst': uploadFirst, 'note': note};
}

class CoverLabelsText {
  final String bookTitle;
  final String subtitle;
  final String subtitlePlaceholder;
  final String author;
  final String recordedBy;
  final String recordedByPlaceholder;
  final String recipientNone;
  final String hideRecipient;
  final String namesOnCover;
  final String namesOnCoverText;
  final String coverLines;
  final String coverLinesHint;

  const CoverLabelsText({required this.bookTitle, required this.subtitle, required this.subtitlePlaceholder, required this.author, required this.recordedBy, required this.recordedByPlaceholder, required this.recipientNone, required this.hideRecipient, required this.namesOnCover, required this.namesOnCoverText, required this.coverLines, required this.coverLinesHint});

  factory CoverLabelsText.fromJson(Map<String, dynamic> json) => CoverLabelsText(bookTitle: json['bookTitle'] as String, subtitle: json['subtitle'] as String, subtitlePlaceholder: json['subtitlePlaceholder'] as String, author: json['author'] as String, recordedBy: json['recordedBy'] as String, recordedByPlaceholder: json['recordedByPlaceholder'] as String, recipientNone: json['recipientNone'] as String, hideRecipient: json['hideRecipient'] as String, namesOnCover: json['namesOnCover'] as String, namesOnCoverText: json['namesOnCoverText'] as String, coverLines: json['coverLines'] as String, coverLinesHint: json['coverLinesHint'] as String);

  Map<String, dynamic> toJson() => {'bookTitle': bookTitle, 'subtitle': subtitle, 'subtitlePlaceholder': subtitlePlaceholder, 'author': author, 'recordedBy': recordedBy, 'recordedByPlaceholder': recordedByPlaceholder, 'recipientNone': recipientNone, 'hideRecipient': hideRecipient, 'namesOnCover': namesOnCover, 'namesOnCoverText': namesOnCoverText, 'coverLines': coverLines, 'coverLinesHint': coverLinesHint};
}

class CoverLabelsBack {
  final String title;
  final String text;
  final String noPhotos;
  final String? signed;

  const CoverLabelsBack({required this.title, required this.text, required this.noPhotos, this.signed});

  factory CoverLabelsBack.fromJson(Map<String, dynamic> json) => CoverLabelsBack(title: json['title'] as String, text: json['text'] as String, noPhotos: json['noPhotos'] as String, signed: json['signed'] == null ? null : json['signed'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'text': text, 'noPhotos': noPhotos, 'signed': signed};
}

class CoverView {
  final Cover cover;
  final List<CoverTemplate> templates;
  final List<CoverMood> moods;
  final List<CoverBackLayout> backLayouts;
  final CoverLabels labels;
  final CoverViewLimits limits;

  const CoverView({required this.cover, required this.templates, required this.moods, required this.backLayouts, required this.labels, required this.limits});

  factory CoverView.fromJson(Map<String, dynamic> json) => CoverView(cover: Cover.fromJson(json['cover'] as Map<String, dynamic>), templates: (json['templates'] as List).map((e) => CoverTemplate.fromJson(e as Map<String, dynamic>)).toList(), moods: (json['moods'] as List).map((e) => CoverMood.fromJson(e as Map<String, dynamic>)).toList(), backLayouts: (json['backLayouts'] as List).map((e) => CoverBackLayout.fromJson(e as Map<String, dynamic>)).toList(), labels: CoverLabels.fromJson(json['labels'] as Map<String, dynamic>), limits: CoverViewLimits.fromJson(json['limits'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'cover': cover.toJson(), 'templates': templates.map((e) => e.toJson()).toList(), 'moods': moods.map((e) => e.toJson()).toList(), 'backLayouts': backLayouts.map((e) => e.toJson()).toList(), 'labels': labels.toJson(), 'limits': limits.toJson()};
}

class CoverViewLimits {
  final int title;
  final int authorName;
  final int recordedBy;
  final int recipientName;
  final int subtitle;
  final int namesOnCover;
  final int backText;

  const CoverViewLimits({required this.title, required this.authorName, required this.recordedBy, required this.recipientName, required this.subtitle, required this.namesOnCover, required this.backText});

  factory CoverViewLimits.fromJson(Map<String, dynamic> json) => CoverViewLimits(title: (json['title'] as num).toInt(), authorName: (json['authorName'] as num).toInt(), recordedBy: (json['recordedBy'] as num).toInt(), recipientName: (json['recipientName'] as num).toInt(), subtitle: (json['subtitle'] as num).toInt(), namesOnCover: (json['namesOnCover'] as num).toInt(), backText: (json['backText'] as num).toInt());

  Map<String, dynamic> toJson() => {'title': title, 'authorName': authorName, 'recordedBy': recordedBy, 'recipientName': recipientName, 'subtitle': subtitle, 'namesOnCover': namesOnCover, 'backText': backText};
}

class CrmTaskContext {
  /// deal | order | client
  final String type;
  final String id;
  final String label;

  const CrmTaskContext({required this.type, required this.id, required this.label});

  factory CrmTaskContext.fromJson(Map<String, dynamic> json) => CrmTaskContext(type: json['type'] as String, id: json['id'] as String, label: json['label'] as String);

  Map<String, dynamic> toJson() => {'type': type, 'id': id, 'label': label};
}

class CrmTaskTarget {
  final String? dealId;
  final String? orderId;
  final String? clientId;

  const CrmTaskTarget({this.dealId, this.orderId, this.clientId});

  factory CrmTaskTarget.fromJson(Map<String, dynamic> json) => CrmTaskTarget(dealId: json['dealId'] == null ? null : json['dealId'] as String, orderId: json['orderId'] == null ? null : json['orderId'] as String, clientId: json['clientId'] == null ? null : json['clientId'] as String);

  Map<String, dynamic> toJson() => {'dealId': dealId, 'orderId': orderId, 'clientId': clientId};
}

class CrmTask {
  final String id;
  final String title;
  final String kind;
  final String? dueAt;
  final bool overdue;
  final bool done;
  final int? remindBeforeMin;
  final bool fromBot;
  final String? assigneeId;
  final bool editable;
  final CrmTaskContext? context;
  final CrmTaskTarget target;

  const CrmTask({required this.id, required this.title, required this.kind, this.dueAt, required this.overdue, required this.done, this.remindBeforeMin, required this.fromBot, this.assigneeId, required this.editable, this.context, required this.target});

  factory CrmTask.fromJson(Map<String, dynamic> json) => CrmTask(id: json['id'] as String, title: json['title'] as String, kind: json['kind'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String, overdue: json['overdue'] as bool, done: json['done'] as bool, remindBeforeMin: json['remindBeforeMin'] == null ? null : (json['remindBeforeMin'] as num).toInt(), fromBot: json['fromBot'] as bool, assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, editable: json['editable'] as bool, context: json['context'] == null ? null : CrmTaskContext.fromJson(json['context'] as Map<String, dynamic>), target: CrmTaskTarget.fromJson(json['target'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'kind': kind, 'dueAt': dueAt, 'overdue': overdue, 'done': done, 'remindBeforeMin': remindBeforeMin, 'fromBot': fromBot, 'assigneeId': assigneeId, 'editable': editable, 'context': context == null ? null : context!.toJson(), 'target': target.toJson()};
}

class CrmTaskList {
  final List<CrmTask> tasks;

  const CrmTaskList({required this.tasks});

  factory CrmTaskList.fromJson(Map<String, dynamic> json) => CrmTaskList(tasks: (json['tasks'] as List).map((e) => CrmTask.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'tasks': tasks.map((e) => e.toJson()).toList()};
}

class CrmTaskContact {
  final String? phone;
  final CrmTaskContactTarget target;
  final bool pbx;
  final bool chat;

  const CrmTaskContact({this.phone, required this.target, required this.pbx, required this.chat});

  factory CrmTaskContact.fromJson(Map<String, dynamic> json) => CrmTaskContact(phone: json['phone'] == null ? null : json['phone'] as String, target: CrmTaskContactTarget.fromJson(json['target'] as Map<String, dynamic>), pbx: json['pbx'] as bool, chat: json['chat'] as bool);

  Map<String, dynamic> toJson() => {'phone': phone, 'target': target.toJson(), 'pbx': pbx, 'chat': chat};
}

class CrmTaskContactTarget {
  final String? dealId;
  final String? orderId;
  final String? clientId;

  const CrmTaskContactTarget({this.dealId, this.orderId, this.clientId});

  factory CrmTaskContactTarget.fromJson(Map<String, dynamic> json) => CrmTaskContactTarget(dealId: json['dealId'] == null ? null : json['dealId'] as String, orderId: json['orderId'] == null ? null : json['orderId'] as String, clientId: json['clientId'] == null ? null : json['clientId'] as String);

  Map<String, dynamic> toJson() => {if (dealId != null) 'dealId': dealId!, if (orderId != null) 'orderId': orderId!, if (clientId != null) 'clientId': clientId!};
}

class CrmDayTask {
  final String id;
  final String title;
  final String kind;
  final String? dueAt;
  final bool overdue;
  final bool done;
  final int? remindBeforeMin;
  final bool fromBot;
  final String? assigneeId;
  final bool editable;
  final CrmTaskContext? context;
  final CrmTaskTarget target;
  final CrmTaskContact? contact;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CrmDayTask({required this.id, required this.title, required this.kind, this.dueAt, required this.overdue, required this.done, this.remindBeforeMin, required this.fromBot, this.assigneeId, required this.editable, this.context, required this.target, this.contact, this.nulls = const {}});

  factory CrmDayTask.fromJson(Map<String, dynamic> json) => CrmDayTask(id: json['id'] as String, title: json['title'] as String, kind: json['kind'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String, overdue: json['overdue'] as bool, done: json['done'] as bool, remindBeforeMin: json['remindBeforeMin'] == null ? null : (json['remindBeforeMin'] as num).toInt(), fromBot: json['fromBot'] as bool, assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, editable: json['editable'] as bool, context: json['context'] == null ? null : CrmTaskContext.fromJson(json['context'] as Map<String, dynamic>), target: CrmTaskTarget.fromJson(json['target'] as Map<String, dynamic>), contact: json['contact'] == null ? null : CrmTaskContact.fromJson(json['contact'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'kind': kind, 'dueAt': dueAt, 'overdue': overdue, 'done': done, 'remindBeforeMin': remindBeforeMin, 'fromBot': fromBot, 'assigneeId': assigneeId, 'editable': editable, 'context': context == null ? null : context!.toJson(), 'target': target.toJson(), if (contact != null || nulls.contains('contact')) 'contact': contact == null ? null : contact!.toJson()};
}

class CrmToday {
  final CrmTodayCounts counts;
  final CrmTodayPlan? plan;
  final List<CrmDayTask> tasks;
  final List<CrmTodayWaiting> waiting;
  final List<CrmTodayMissed> missed;

  const CrmToday({required this.counts, this.plan, required this.tasks, required this.waiting, required this.missed});

  factory CrmToday.fromJson(Map<String, dynamic> json) => CrmToday(counts: CrmTodayCounts.fromJson(json['counts'] as Map<String, dynamic>), plan: json['plan'] == null ? null : CrmTodayPlan.fromJson(json['plan'] as Map<String, dynamic>), tasks: (json['tasks'] as List).map((e) => CrmDayTask.fromJson(e as Map<String, dynamic>)).toList(), waiting: (json['waiting'] as List).map((e) => CrmTodayWaiting.fromJson(e as Map<String, dynamic>)).toList(), missed: (json['missed'] as List).map((e) => CrmTodayMissed.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'counts': counts.toJson(), 'plan': plan == null ? null : plan!.toJson(), 'tasks': tasks.map((e) => e.toJson()).toList(), 'waiting': waiting.map((e) => e.toJson()).toList(), 'missed': missed.map((e) => e.toJson()).toList()};
}

class CrmTodayCounts {
  final int tasks;
  final int overdueTasks;
  final int waiting;
  final int missed;
  final int unsorted;
  final int openDeals;
  final double openDealsSum;
  final int noNextStep;

  const CrmTodayCounts({required this.tasks, required this.overdueTasks, required this.waiting, required this.missed, required this.unsorted, required this.openDeals, required this.openDealsSum, required this.noNextStep});

  factory CrmTodayCounts.fromJson(Map<String, dynamic> json) => CrmTodayCounts(tasks: (json['tasks'] as num).toInt(), overdueTasks: (json['overdueTasks'] as num).toInt(), waiting: (json['waiting'] as num).toInt(), missed: (json['missed'] as num).toInt(), unsorted: (json['unsorted'] as num).toInt(), openDeals: (json['openDeals'] as num).toInt(), openDealsSum: (json['openDealsSum'] as num).toDouble(), noNextStep: (json['noNextStep'] as num).toInt());

  Map<String, dynamic> toJson() => {'tasks': tasks, 'overdueTasks': overdueTasks, 'waiting': waiting, 'missed': missed, 'unsorted': unsorted, 'openDeals': openDeals, 'openDealsSum': openDealsSum, 'noNextStep': noNextStep};
}

class CrmTodayPlan {
  final double planAmount;
  final double factAmount;
  final int planDeals;
  final int factDeals;

  const CrmTodayPlan({required this.planAmount, required this.factAmount, required this.planDeals, required this.factDeals});

  factory CrmTodayPlan.fromJson(Map<String, dynamic> json) => CrmTodayPlan(planAmount: (json['planAmount'] as num).toDouble(), factAmount: (json['factAmount'] as num).toDouble(), planDeals: (json['planDeals'] as num).toInt(), factDeals: (json['factDeals'] as num).toInt());

  Map<String, dynamic> toJson() => {'planAmount': planAmount, 'factAmount': factAmount, 'planDeals': planDeals, 'factDeals': factDeals};
}

class CrmTodayWaiting {
  final String id;
  final String title;
  final String channel;
  final String channelLabel;
  final String? preview;
  final String? waitLabel;
  final bool overdue;

  const CrmTodayWaiting({required this.id, required this.title, required this.channel, required this.channelLabel, this.preview, this.waitLabel, required this.overdue});

  factory CrmTodayWaiting.fromJson(Map<String, dynamic> json) => CrmTodayWaiting(id: json['id'] as String, title: json['title'] as String, channel: json['channel'] as String, channelLabel: json['channelLabel'] as String, preview: json['preview'] == null ? null : json['preview'] as String, waitLabel: json['waitLabel'] == null ? null : json['waitLabel'] as String, overdue: json['overdue'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'channel': channel, 'channelLabel': channelLabel, 'preview': preview, 'waitLabel': waitLabel, 'overdue': overdue};
}

class CrmTodayMissed {
  final String id;
  final String? phone;
  final String at;
  final String? dealId;
  final String? clientId;

  const CrmTodayMissed({required this.id, this.phone, required this.at, this.dealId, this.clientId});

  factory CrmTodayMissed.fromJson(Map<String, dynamic> json) => CrmTodayMissed(id: json['id'] as String, phone: json['phone'] == null ? null : json['phone'] as String, at: json['at'] as String, dealId: json['dealId'] == null ? null : json['dealId'] as String, clientId: json['clientId'] == null ? null : json['clientId'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'phone': phone, 'at': at, 'dealId': dealId, 'clientId': clientId};
}

class CrmCalls {
  final CrmCallsStats stats;
  final List<CrmCallsCalls> calls;

  const CrmCalls({required this.stats, required this.calls});

  factory CrmCalls.fromJson(Map<String, dynamic> json) => CrmCalls(stats: CrmCallsStats.fromJson(json['stats'] as Map<String, dynamic>), calls: (json['calls'] as List).map((e) => CrmCallsCalls.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'stats': stats.toJson(), 'calls': calls.map((e) => e.toJson()).toList()};
}

class CrmCallsStats {
  final int total;
  final int answered;
  final int missed;
  final int talk;

  const CrmCallsStats({required this.total, required this.answered, required this.missed, required this.talk});

  factory CrmCallsStats.fromJson(Map<String, dynamic> json) => CrmCallsStats(total: (json['total'] as num).toInt(), answered: (json['answered'] as num).toInt(), missed: (json['missed'] as num).toInt(), talk: (json['talk'] as num).toInt());

  Map<String, dynamic> toJson() => {'total': total, 'answered': answered, 'missed': missed, 'talk': talk};
}

class CrmCallsCalls {
  final String id;
  final String direction;
  final String status;
  final String at;
  final int? durationSec;
  final String? phone;
  final String? name;
  final bool handled;
  final String? dealId;
  final String? clientId;

  const CrmCallsCalls({required this.id, required this.direction, required this.status, required this.at, this.durationSec, this.phone, this.name, required this.handled, this.dealId, this.clientId});

  factory CrmCallsCalls.fromJson(Map<String, dynamic> json) => CrmCallsCalls(id: json['id'] as String, direction: json['direction'] as String, status: json['status'] as String, at: json['at'] as String, durationSec: json['durationSec'] == null ? null : (json['durationSec'] as num).toInt(), phone: json['phone'] == null ? null : json['phone'] as String, name: json['name'] == null ? null : json['name'] as String, handled: json['handled'] as bool, dealId: json['dealId'] == null ? null : json['dealId'] as String, clientId: json['clientId'] == null ? null : json['clientId'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'direction': direction, 'status': status, 'at': at, 'durationSec': durationSec, 'phone': phone, 'name': name, 'handled': handled, 'dealId': dealId, 'clientId': clientId};
}

class CrmClientRow {
  final String id;
  final String name;
  final String? phone;
  final double ltv;
  final int orders;
  final int books;
  final String? lastSeenAt;
  final String createdAt;
  final List<String> tags;

  const CrmClientRow({required this.id, required this.name, this.phone, required this.ltv, required this.orders, required this.books, this.lastSeenAt, required this.createdAt, required this.tags});

  factory CrmClientRow.fromJson(Map<String, dynamic> json) => CrmClientRow(id: json['id'] as String, name: json['name'] as String, phone: json['phone'] == null ? null : json['phone'] as String, ltv: (json['ltv'] as num).toDouble(), orders: (json['orders'] as num).toInt(), books: (json['books'] as num).toInt(), lastSeenAt: json['lastSeenAt'] == null ? null : json['lastSeenAt'] as String, createdAt: json['createdAt'] as String, tags: (json['tags'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'phone': phone, 'ltv': ltv, 'orders': orders, 'books': books, 'lastSeenAt': lastSeenAt, 'createdAt': createdAt, 'tags': tags.map((e) => e).toList()};
}

class CrmClients {
  final int total;
  final int page;
  final int pageSize;
  final List<CrmClientRow> clients;

  const CrmClients({required this.total, required this.page, required this.pageSize, required this.clients});

  factory CrmClients.fromJson(Map<String, dynamic> json) => CrmClients(total: (json['total'] as num).toInt(), page: (json['page'] as num).toInt(), pageSize: (json['pageSize'] as num).toInt(), clients: (json['clients'] as List).map((e) => CrmClientRow.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'total': total, 'page': page, 'pageSize': pageSize, 'clients': clients.map((e) => e.toJson()).toList()};
}

class CrmClientCard {
  final String id;
  final String name;
  final String? phone;
  final String? email;
  final List<String> tags;
  final String? manager;
  final String? lastSeenAt;
  final String createdAt;
  final CrmClientCardMoney money;
  final bool canWrite;
  final List<CrmClientCardBooks> books;
  final List<CrmClientCardOrders> orders;
  final List<CrmClientCardDeals> deals;
  final List<CrmClientCardTasks> tasks;
  final List<CrmClientCardNotes> notes;

  const CrmClientCard({required this.id, required this.name, this.phone, this.email, required this.tags, this.manager, this.lastSeenAt, required this.createdAt, required this.money, required this.canWrite, required this.books, required this.orders, required this.deals, required this.tasks, required this.notes});

  factory CrmClientCard.fromJson(Map<String, dynamic> json) => CrmClientCard(id: json['id'] as String, name: json['name'] as String, phone: json['phone'] == null ? null : json['phone'] as String, email: json['email'] == null ? null : json['email'] as String, tags: (json['tags'] as List).map((e) => e as String).toList(), manager: json['manager'] == null ? null : json['manager'] as String, lastSeenAt: json['lastSeenAt'] == null ? null : json['lastSeenAt'] as String, createdAt: json['createdAt'] as String, money: CrmClientCardMoney.fromJson(json['money'] as Map<String, dynamic>), canWrite: json['canWrite'] as bool, books: (json['books'] as List).map((e) => CrmClientCardBooks.fromJson(e as Map<String, dynamic>)).toList(), orders: (json['orders'] as List).map((e) => CrmClientCardOrders.fromJson(e as Map<String, dynamic>)).toList(), deals: (json['deals'] as List).map((e) => CrmClientCardDeals.fromJson(e as Map<String, dynamic>)).toList(), tasks: (json['tasks'] as List).map((e) => CrmClientCardTasks.fromJson(e as Map<String, dynamic>)).toList(), notes: (json['notes'] as List).map((e) => CrmClientCardNotes.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'phone': phone, 'email': email, 'tags': tags.map((e) => e).toList(), 'manager': manager, 'lastSeenAt': lastSeenAt, 'createdAt': createdAt, 'money': money.toJson(), 'canWrite': canWrite, 'books': books.map((e) => e.toJson()).toList(), 'orders': orders.map((e) => e.toJson()).toList(), 'deals': deals.map((e) => e.toJson()).toList(), 'tasks': tasks.map((e) => e.toJson()).toList(), 'notes': notes.map((e) => e.toJson()).toList()};
}

class CrmClientCardMoney {
  final double total;
  final double sales;

  const CrmClientCardMoney({required this.total, required this.sales});

  factory CrmClientCardMoney.fromJson(Map<String, dynamic> json) => CrmClientCardMoney(total: (json['total'] as num).toDouble(), sales: (json['sales'] as num).toDouble());

  Map<String, dynamic> toJson() => {'total': total, 'sales': sales};
}

class CrmClientCardBooks {
  final String id;
  final String title;
  final String theme;
  final String status;
  final int answered;
  final int total;
  final int words;
  final int photos;

  const CrmClientCardBooks({required this.id, required this.title, required this.theme, required this.status, required this.answered, required this.total, required this.words, required this.photos});

  factory CrmClientCardBooks.fromJson(Map<String, dynamic> json) => CrmClientCardBooks(id: json['id'] as String, title: json['title'] as String, theme: json['theme'] as String, status: json['status'] as String, answered: (json['answered'] as num).toInt(), total: (json['total'] as num).toInt(), words: (json['words'] as num).toInt(), photos: (json['photos'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'theme': theme, 'status': status, 'answered': answered, 'total': total, 'words': words, 'photos': photos};
}

class CrmClientCardOrders {
  final String id;
  final int number;
  final String status;
  final double amount;
  final String plan;
  final String createdAt;

  const CrmClientCardOrders({required this.id, required this.number, required this.status, required this.amount, required this.plan, required this.createdAt});

  factory CrmClientCardOrders.fromJson(Map<String, dynamic> json) => CrmClientCardOrders(id: json['id'] as String, number: (json['number'] as num).toInt(), status: json['status'] as String, amount: (json['amount'] as num).toDouble(), plan: json['plan'] as String, createdAt: json['createdAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'status': status, 'amount': amount, 'plan': plan, 'createdAt': createdAt};
}

class CrmClientCardDeals {
  final String id;
  final int number;
  final String title;
  final double amount;
  final CrmClientCardDealsStage stage;

  const CrmClientCardDeals({required this.id, required this.number, required this.title, required this.amount, required this.stage});

  factory CrmClientCardDeals.fromJson(Map<String, dynamic> json) => CrmClientCardDeals(id: json['id'] as String, number: (json['number'] as num).toInt(), title: json['title'] as String, amount: (json['amount'] as num).toDouble(), stage: CrmClientCardDealsStage.fromJson(json['stage'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'title': title, 'amount': amount, 'stage': stage.toJson()};
}

class CrmClientCardDealsStage {
  final String name;
  final String color;
  final String kind;

  const CrmClientCardDealsStage({required this.name, required this.color, required this.kind});

  factory CrmClientCardDealsStage.fromJson(Map<String, dynamic> json) => CrmClientCardDealsStage(name: json['name'] as String, color: json['color'] as String, kind: json['kind'] as String);

  Map<String, dynamic> toJson() => {'name': name, 'color': color, 'kind': kind};
}

class CrmClientCardTasks {
  final String id;
  final String title;
  final String? dueAt;

  const CrmClientCardTasks({required this.id, required this.title, this.dueAt});

  factory CrmClientCardTasks.fromJson(Map<String, dynamic> json) => CrmClientCardTasks(id: json['id'] as String, title: json['title'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'dueAt': dueAt};
}

class CrmClientCardNotes {
  final String id;
  final String text;
  final String at;
  final String? author;

  const CrmClientCardNotes({required this.id, required this.text, required this.at, this.author});

  factory CrmClientCardNotes.fromJson(Map<String, dynamic> json) => CrmClientCardNotes(id: json['id'] as String, text: json['text'] as String, at: json['at'] as String, author: json['author'] == null ? null : json['author'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'text': text, 'at': at, 'author': author};
}

class CrmStaffList {
  final bool canAssignOthers;
  final List<CrmStaffListStaff> staff;

  const CrmStaffList({required this.canAssignOthers, required this.staff});

  factory CrmStaffList.fromJson(Map<String, dynamic> json) => CrmStaffList(canAssignOthers: json['canAssignOthers'] as bool, staff: (json['staff'] as List).map((e) => CrmStaffListStaff.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'canAssignOthers': canAssignOthers, 'staff': staff.map((e) => e.toJson()).toList()};
}

class CrmStaffListStaff {
  final String id;
  final String name;

  const CrmStaffListStaff({required this.id, required this.name});

  factory CrmStaffListStaff.fromJson(Map<String, dynamic> json) => CrmStaffListStaff(id: json['id'] as String, name: json['name'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

class CrmNotification {
  final String id;
  final String kind;
  final String title;
  final String? body;
  final String? link;
  final bool read;
  final String at;

  const CrmNotification({required this.id, required this.kind, required this.title, this.body, this.link, required this.read, required this.at});

  factory CrmNotification.fromJson(Map<String, dynamic> json) => CrmNotification(id: json['id'] as String, kind: json['kind'] as String, title: json['title'] as String, body: json['body'] == null ? null : json['body'] as String, link: json['link'] == null ? null : json['link'] as String, read: json['read'] as bool, at: json['at'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'kind': kind, 'title': title, 'body': body, 'link': link, 'read': read, 'at': at};
}

class CrmNotifications {
  final List<CrmNotification> notifications;

  const CrmNotifications({required this.notifications});

  factory CrmNotifications.fromJson(Map<String, dynamic> json) => CrmNotifications(notifications: (json['notifications'] as List).map((e) => CrmNotification.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'notifications': notifications.map((e) => e.toJson()).toList()};
}

class CrmNotificationsRead {
  final String? id;

  const CrmNotificationsRead({this.id});

  factory CrmNotificationsRead.fromJson(Map<String, dynamic> json) => CrmNotificationsRead(id: json['id'] == null ? null : json['id'] as String);

  Map<String, dynamic> toJson() => {if (id != null) 'id': id!};
}

class CrmChatRow {
  final String id;
  final String title;
  final String channel;
  final String channelLabel;
  final String? avatarUrl;
  final String? lastMessageAt;
  final String? preview;
  final int unread;
  final String status;
  final String? assignee;
  final String? assigneeId;
  final String? waitLabel;
  final bool overdue;
  final bool bot;
  final bool pinned;

  const CrmChatRow({required this.id, required this.title, required this.channel, required this.channelLabel, this.avatarUrl, this.lastMessageAt, this.preview, required this.unread, required this.status, this.assignee, this.assigneeId, this.waitLabel, required this.overdue, required this.bot, required this.pinned});

  factory CrmChatRow.fromJson(Map<String, dynamic> json) => CrmChatRow(id: json['id'] as String, title: json['title'] as String, channel: json['channel'] as String, channelLabel: json['channelLabel'] as String, avatarUrl: json['avatarUrl'] == null ? null : json['avatarUrl'] as String, lastMessageAt: json['lastMessageAt'] == null ? null : json['lastMessageAt'] as String, preview: json['preview'] == null ? null : json['preview'] as String, unread: (json['unread'] as num).toInt(), status: json['status'] as String, assignee: json['assignee'] == null ? null : json['assignee'] as String, assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, waitLabel: json['waitLabel'] == null ? null : json['waitLabel'] as String, overdue: json['overdue'] as bool, bot: json['bot'] as bool, pinned: json['pinned'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'channel': channel, 'channelLabel': channelLabel, 'avatarUrl': avatarUrl, 'lastMessageAt': lastMessageAt, 'preview': preview, 'unread': unread, 'status': status, 'assignee': assignee, 'assigneeId': assigneeId, 'waitLabel': waitLabel, 'overdue': overdue, 'bot': bot, 'pinned': pinned};
}

class CrmChatList {
  final List<CrmChatRow> chats;

  const CrmChatList({required this.chats});

  factory CrmChatList.fromJson(Map<String, dynamic> json) => CrmChatList(chats: (json['chats'] as List).map((e) => CrmChatRow.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'chats': chats.map((e) => e.toJson()).toList()};
}

class CrmMessageCard {
  /// product | order | catalog
  final String kind;
  final String? productId;
  final String? name;
  final String? description;
  final double? price;
  final String? currency;
  final String? retailerId;
  final String? url;
  final String? body;
  final String? orderId;
  final String? token;
  final String? title;
  final int? itemCount;
  final double? total;
  final String? note;
  final List<CrmMessageCardItems>? items;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CrmMessageCard({required this.kind, this.productId, this.name, this.description, this.price, this.currency, this.retailerId, this.url, this.body, this.orderId, this.token, this.title, this.itemCount, this.total, this.note, this.items, this.nulls = const {}});

  factory CrmMessageCard.fromJson(Map<String, dynamic> json) => CrmMessageCard(kind: json['kind'] as String, productId: json['productId'] == null ? null : json['productId'] as String, name: json['name'] == null ? null : json['name'] as String, description: json['description'] == null ? null : json['description'] as String, price: json['price'] == null ? null : (json['price'] as num).toDouble(), currency: json['currency'] == null ? null : json['currency'] as String, retailerId: json['retailerId'] == null ? null : json['retailerId'] as String, url: json['url'] == null ? null : json['url'] as String, body: json['body'] == null ? null : json['body'] as String, orderId: json['orderId'] == null ? null : json['orderId'] as String, token: json['token'] == null ? null : json['token'] as String, title: json['title'] == null ? null : json['title'] as String, itemCount: json['itemCount'] == null ? null : (json['itemCount'] as num).toInt(), total: json['total'] == null ? null : (json['total'] as num).toDouble(), note: json['note'] == null ? null : json['note'] as String, items: json['items'] == null ? null : (json['items'] as List).map((e) => CrmMessageCardItems.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'kind': kind, if (productId != null) 'productId': productId!, if (name != null) 'name': name!, if (description != null) 'description': description!, if (price != null || nulls.contains('price')) 'price': price, if (currency != null) 'currency': currency!, if (retailerId != null) 'retailerId': retailerId!, if (url != null) 'url': url!, if (body != null) 'body': body!, if (orderId != null) 'orderId': orderId!, if (token != null) 'token': token!, if (title != null) 'title': title!, if (itemCount != null) 'itemCount': itemCount!, if (total != null || nulls.contains('total')) 'total': total, if (note != null) 'note': note!, if (items != null) 'items': items!.map((e) => e.toJson()).toList()};
}

class CrmMessageCardItems {
  final String name;
  final int quantity;
  final double? price;

  const CrmMessageCardItems({required this.name, required this.quantity, this.price});

  factory CrmMessageCardItems.fromJson(Map<String, dynamic> json) => CrmMessageCardItems(name: json['name'] as String, quantity: (json['quantity'] as num).toInt(), price: json['price'] == null ? null : (json['price'] as num).toDouble());

  Map<String, dynamic> toJson() => {'name': name, 'quantity': quantity, 'price': price};
}

class CrmMessage {
  final String id;
  /// in | out
  final String direction;
  final String type;
  final String text;
  final String? mediaUrl;
  final String? media;
  final String status;
  final String? error;
  final String? author;
  final String at;
  final bool? internal;
  final bool? gateway;
  final bool? mediaGone;
  final String? authorId;
  final CrmMessageReplyTo? replyTo;
  final bool? forwarded;
  final bool? edited;
  final bool? deleted;
  final String? transcript;
  final bool? trace;
  final CrmMessageCard? card;
  final List<CrmMessageEditHistory>? editHistory;
  /// client | shop
  final String? revoked;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CrmMessage({required this.id, required this.direction, required this.type, required this.text, this.mediaUrl, this.media, required this.status, this.error, this.author, required this.at, this.internal, this.gateway, this.mediaGone, this.authorId, this.replyTo, this.forwarded, this.edited, this.deleted, this.transcript, this.trace, this.card, this.editHistory, this.revoked, this.nulls = const {}});

  factory CrmMessage.fromJson(Map<String, dynamic> json) => CrmMessage(id: json['id'] as String, direction: json['direction'] as String, type: json['type'] as String, text: json['text'] as String, mediaUrl: json['mediaUrl'] == null ? null : json['mediaUrl'] as String, media: json['media'] == null ? null : json['media'] as String, status: json['status'] as String, error: json['error'] == null ? null : json['error'] as String, author: json['author'] == null ? null : json['author'] as String, at: json['at'] as String, internal: json['internal'] == null ? null : json['internal'] as bool, gateway: json['gateway'] == null ? null : json['gateway'] as bool, mediaGone: json['mediaGone'] == null ? null : json['mediaGone'] as bool, authorId: json['authorId'] == null ? null : json['authorId'] as String, replyTo: json['replyTo'] == null ? null : CrmMessageReplyTo.fromJson(json['replyTo'] as Map<String, dynamic>), forwarded: json['forwarded'] == null ? null : json['forwarded'] as bool, edited: json['edited'] == null ? null : json['edited'] as bool, deleted: json['deleted'] == null ? null : json['deleted'] as bool, transcript: json['transcript'] == null ? null : json['transcript'] as String, trace: json['trace'] == null ? null : json['trace'] as bool, card: json['card'] == null ? null : CrmMessageCard.fromJson(json['card'] as Map<String, dynamic>), editHistory: json['editHistory'] == null ? null : (json['editHistory'] as List).map((e) => CrmMessageEditHistory.fromJson(e as Map<String, dynamic>)).toList(), revoked: json['revoked'] == null ? null : json['revoked'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'direction': direction, 'type': type, 'text': text, 'mediaUrl': mediaUrl, 'media': media, 'status': status, 'error': error, 'author': author, 'at': at, if (internal != null) 'internal': internal!, if (gateway != null) 'gateway': gateway!, if (mediaGone != null) 'mediaGone': mediaGone!, if (authorId != null || nulls.contains('authorId')) 'authorId': authorId, if (replyTo != null || nulls.contains('replyTo')) 'replyTo': replyTo == null ? null : replyTo!.toJson(), if (forwarded != null) 'forwarded': forwarded!, if (edited != null) 'edited': edited!, if (deleted != null) 'deleted': deleted!, if (transcript != null || nulls.contains('transcript')) 'transcript': transcript, if (trace != null) 'trace': trace!, if (card != null || nulls.contains('card')) 'card': card == null ? null : card!.toJson(), if (editHistory != null) 'editHistory': editHistory!.map((e) => e.toJson()).toList(), if (revoked != null) 'revoked': revoked!};
}

class CrmMessageReplyTo {
  final String id;
  final String text;
  final String type;
  /// in | out
  final String direction;
  final String? author;

  const CrmMessageReplyTo({required this.id, required this.text, required this.type, required this.direction, this.author});

  factory CrmMessageReplyTo.fromJson(Map<String, dynamic> json) => CrmMessageReplyTo(id: json['id'] as String, text: json['text'] as String, type: json['type'] as String, direction: json['direction'] as String, author: json['author'] == null ? null : json['author'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'text': text, 'type': type, 'direction': direction, 'author': author};
}

class CrmMessageEditHistory {
  final String text;
  final String at;

  const CrmMessageEditHistory({required this.text, required this.at});

  factory CrmMessageEditHistory.fromJson(Map<String, dynamic> json) => CrmMessageEditHistory(text: json['text'] as String, at: json['at'] as String);

  Map<String, dynamic> toJson() => {'text': text, 'at': at};
}

class CrmMessages {
  final List<CrmMessage> messages;
  final bool more;
  final int unread;
  final String status;

  const CrmMessages({required this.messages, required this.more, required this.unread, required this.status});

  factory CrmMessages.fromJson(Map<String, dynamic> json) => CrmMessages(messages: (json['messages'] as List).map((e) => CrmMessage.fromJson(e as Map<String, dynamic>)).toList(), more: json['more'] as bool, unread: (json['unread'] as num).toInt(), status: json['status'] as String);

  Map<String, dynamic> toJson() => {'messages': messages.map((e) => e.toJson()).toList(), 'more': more, 'unread': unread, 'status': status};
}

class CrmInvoice {
  final String id;
  final String label;
  final double amount;
  /// prepayment | remainder | full | custom
  final String purpose;
  /// pending_payment | paid | cancelled | expired
  final String status;
  final bool overdue;
  final String expiresLabel;
  final String? paidLabel;
  final String? paidMethod;
  final String? paidRef;
  final String? closedReason;
  final String? claimedLabel;
  final String? viewedLabel;
  /// none | due | sent | delivered | failed | needs_manager | skipped
  final String access;
  final bool hasChat;
  final String? link;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CrmInvoice({required this.id, required this.label, required this.amount, required this.purpose, required this.status, required this.overdue, required this.expiresLabel, this.paidLabel, this.paidMethod, this.paidRef, this.closedReason, this.claimedLabel, this.viewedLabel, required this.access, required this.hasChat, this.link, this.nulls = const {}});

  factory CrmInvoice.fromJson(Map<String, dynamic> json) => CrmInvoice(id: json['id'] as String, label: json['label'] as String, amount: (json['amount'] as num).toDouble(), purpose: json['purpose'] as String, status: json['status'] as String, overdue: json['overdue'] as bool, expiresLabel: json['expiresLabel'] as String, paidLabel: json['paidLabel'] == null ? null : json['paidLabel'] as String, paidMethod: json['paidMethod'] == null ? null : json['paidMethod'] as String, paidRef: json['paidRef'] == null ? null : json['paidRef'] as String, closedReason: json['closedReason'] == null ? null : json['closedReason'] as String, claimedLabel: json['claimedLabel'] == null ? null : json['claimedLabel'] as String, viewedLabel: json['viewedLabel'] == null ? null : json['viewedLabel'] as String, access: json['access'] as String, hasChat: json['hasChat'] as bool, link: json['link'] == null ? null : json['link'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'label': label, 'amount': amount, 'purpose': purpose, 'status': status, 'overdue': overdue, 'expiresLabel': expiresLabel, 'paidLabel': paidLabel, 'paidMethod': paidMethod, 'paidRef': paidRef, 'closedReason': closedReason, 'claimedLabel': claimedLabel, if (viewedLabel != null || nulls.contains('viewedLabel')) 'viewedLabel': viewedLabel, 'access': access, 'hasChat': hasChat, 'link': link};
}

class CrmChat {
  final CrmChatConversation conversation;
  final List<CrmMessage> messages;
  final bool more;
  final CrmChatDeal? deal;
  final CrmChatPerms perms;
  final String? sendBlocker;
  final CrmChatBot bot;
  final List<CrmChatTemplates> templates;
  final List<CrmInvoice> invoices;

  const CrmChat({required this.conversation, required this.messages, required this.more, this.deal, required this.perms, this.sendBlocker, required this.bot, required this.templates, required this.invoices});

  factory CrmChat.fromJson(Map<String, dynamic> json) => CrmChat(conversation: CrmChatConversation.fromJson(json['conversation'] as Map<String, dynamic>), messages: (json['messages'] as List).map((e) => CrmMessage.fromJson(e as Map<String, dynamic>)).toList(), more: json['more'] as bool, deal: json['deal'] == null ? null : CrmChatDeal.fromJson(json['deal'] as Map<String, dynamic>), perms: CrmChatPerms.fromJson(json['perms'] as Map<String, dynamic>), sendBlocker: json['sendBlocker'] == null ? null : json['sendBlocker'] as String, bot: CrmChatBot.fromJson(json['bot'] as Map<String, dynamic>), templates: (json['templates'] as List).map((e) => CrmChatTemplates.fromJson(e as Map<String, dynamic>)).toList(), invoices: (json['invoices'] as List).map((e) => CrmInvoice.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'conversation': conversation.toJson(), 'messages': messages.map((e) => e.toJson()).toList(), 'more': more, 'deal': deal == null ? null : deal!.toJson(), 'perms': perms.toJson(), 'sendBlocker': sendBlocker, 'bot': bot.toJson(), 'templates': templates.map((e) => e.toJson()).toList(), 'invoices': invoices.map((e) => e.toJson()).toList()};
}

class CrmChatConversation {
  final bool pinned;
  final String id;
  final String title;
  final String channel;
  final String channelLabel;
  final String? avatarUrl;
  final String status;
  final int unread;
  final String? assigneeId;
  final String? assignee;
  final String? dealId;
  final String? clientId;
  final String? clientName;

  const CrmChatConversation({required this.pinned, required this.id, required this.title, required this.channel, required this.channelLabel, this.avatarUrl, required this.status, required this.unread, this.assigneeId, this.assignee, this.dealId, this.clientId, this.clientName});

  factory CrmChatConversation.fromJson(Map<String, dynamic> json) => CrmChatConversation(pinned: json['pinned'] as bool, id: json['id'] as String, title: json['title'] as String, channel: json['channel'] as String, channelLabel: json['channelLabel'] as String, avatarUrl: json['avatarUrl'] == null ? null : json['avatarUrl'] as String, status: json['status'] as String, unread: (json['unread'] as num).toInt(), assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, assignee: json['assignee'] == null ? null : json['assignee'] as String, dealId: json['dealId'] == null ? null : json['dealId'] as String, clientId: json['clientId'] == null ? null : json['clientId'] as String, clientName: json['clientName'] == null ? null : json['clientName'] as String);

  Map<String, dynamic> toJson() => {'pinned': pinned, 'id': id, 'title': title, 'channel': channel, 'channelLabel': channelLabel, 'avatarUrl': avatarUrl, 'status': status, 'unread': unread, 'assigneeId': assigneeId, 'assignee': assignee, 'dealId': dealId, 'clientId': clientId, 'clientName': clientName};
}

class CrmChatDeal {
  final String id;
  final int number;
  final String title;
  final double amount;
  final CrmChatDealStage stage;
  final String source;

  const CrmChatDeal({required this.id, required this.number, required this.title, required this.amount, required this.stage, required this.source});

  factory CrmChatDeal.fromJson(Map<String, dynamic> json) => CrmChatDeal(id: json['id'] as String, number: (json['number'] as num).toInt(), title: json['title'] as String, amount: (json['amount'] as num).toDouble(), stage: CrmChatDealStage.fromJson(json['stage'] as Map<String, dynamic>), source: json['source'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'title': title, 'amount': amount, 'stage': stage.toJson(), 'source': source};
}

class CrmChatDealStage {
  final String id;
  final String name;
  final String color;

  const CrmChatDealStage({required this.id, required this.name, required this.color});

  factory CrmChatDealStage.fromJson(Map<String, dynamic> json) => CrmChatDealStage(id: json['id'] as String, name: json['name'] as String, color: json['color'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'color': color};
}

class CrmChatPerms {
  final bool canReply;
  final bool canNote;
  final bool canInvoice;
  final bool canEditInvoices;
  final bool canCreateDeal;
  final bool mine;

  const CrmChatPerms({required this.canReply, required this.canNote, required this.canInvoice, required this.canEditInvoices, required this.canCreateDeal, required this.mine});

  factory CrmChatPerms.fromJson(Map<String, dynamic> json) => CrmChatPerms(canReply: json['canReply'] as bool, canNote: json['canNote'] as bool, canInvoice: json['canInvoice'] as bool, canEditInvoices: json['canEditInvoices'] as bool, canCreateDeal: json['canCreateDeal'] as bool, mine: json['mine'] as bool);

  Map<String, dynamic> toJson() => {'canReply': canReply, 'canNote': canNote, 'canInvoice': canInvoice, 'canEditInvoices': canEditInvoices, 'canCreateDeal': canCreateDeal, 'mine': mine};
}

class CrmChatBot {
  final String? label;
  final bool canStart;
  final bool canStop;

  const CrmChatBot({this.label, required this.canStart, required this.canStop});

  factory CrmChatBot.fromJson(Map<String, dynamic> json) => CrmChatBot(label: json['label'] == null ? null : json['label'] as String, canStart: json['canStart'] as bool, canStop: json['canStop'] as bool);

  Map<String, dynamic> toJson() => {'label': label, 'canStart': canStart, 'canStop': canStop};
}

class CrmChatTemplates {
  final String id;
  final String title;
  final bool own;
  final String text;

  const CrmChatTemplates({required this.id, required this.title, required this.own, required this.text});

  factory CrmChatTemplates.fromJson(Map<String, dynamic> json) => CrmChatTemplates(id: json['id'] as String, title: json['title'] as String, own: json['own'] as bool, text: json['text'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'own': own, 'text': text};
}

class CrmStage {
  final String id;
  final String name;
  final String color;
  final String kind;
  final int position;

  const CrmStage({required this.id, required this.name, required this.color, required this.kind, required this.position});

  factory CrmStage.fromJson(Map<String, dynamic> json) => CrmStage(id: json['id'] as String, name: json['name'] as String, color: json['color'] as String, kind: json['kind'] as String, position: (json['position'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'color': color, 'kind': kind, 'position': position};
}

class CrmDealRow {
  final String id;
  final int number;
  final String title;
  final String? contactName;
  final String stageId;
  final String stageKind;
  final double amount;
  final double paid;
  final String source;
  final String? assigneeId;
  final String? assignee;
  final bool unsorted;
  final int unread;
  final int daysInStage;
  final CrmDealRowNextTask? nextTask;
  final String createdAt;

  const CrmDealRow({required this.id, required this.number, required this.title, this.contactName, required this.stageId, required this.stageKind, required this.amount, required this.paid, required this.source, this.assigneeId, this.assignee, required this.unsorted, required this.unread, required this.daysInStage, this.nextTask, required this.createdAt});

  factory CrmDealRow.fromJson(Map<String, dynamic> json) => CrmDealRow(id: json['id'] as String, number: (json['number'] as num).toInt(), title: json['title'] as String, contactName: json['contactName'] == null ? null : json['contactName'] as String, stageId: json['stageId'] as String, stageKind: json['stageKind'] as String, amount: (json['amount'] as num).toDouble(), paid: (json['paid'] as num).toDouble(), source: json['source'] as String, assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, assignee: json['assignee'] == null ? null : json['assignee'] as String, unsorted: json['unsorted'] as bool, unread: (json['unread'] as num).toInt(), daysInStage: (json['daysInStage'] as num).toInt(), nextTask: json['nextTask'] == null ? null : CrmDealRowNextTask.fromJson(json['nextTask'] as Map<String, dynamic>), createdAt: json['createdAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'title': title, 'contactName': contactName, 'stageId': stageId, 'stageKind': stageKind, 'amount': amount, 'paid': paid, 'source': source, 'assigneeId': assigneeId, 'assignee': assignee, 'unsorted': unsorted, 'unread': unread, 'daysInStage': daysInStage, 'nextTask': nextTask == null ? null : nextTask!.toJson(), 'createdAt': createdAt};
}

class CrmDealRowNextTask {
  final String at;
  final bool overdue;

  const CrmDealRowNextTask({required this.at, required this.overdue});

  factory CrmDealRowNextTask.fromJson(Map<String, dynamic> json) => CrmDealRowNextTask(at: json['at'] as String, overdue: json['overdue'] as bool);

  Map<String, dynamic> toJson() => {'at': at, 'overdue': overdue};
}

class CrmDeals {
  final List<CrmDealsPipelines> pipelines;
  final CrmDealsPipeline? pipeline;
  final List<CrmStage> stages;
  final List<CrmDealRow> deals;

  const CrmDeals({required this.pipelines, this.pipeline, required this.stages, required this.deals});

  factory CrmDeals.fromJson(Map<String, dynamic> json) => CrmDeals(pipelines: (json['pipelines'] as List).map((e) => CrmDealsPipelines.fromJson(e as Map<String, dynamic>)).toList(), pipeline: json['pipeline'] == null ? null : CrmDealsPipeline.fromJson(json['pipeline'] as Map<String, dynamic>), stages: (json['stages'] as List).map((e) => CrmStage.fromJson(e as Map<String, dynamic>)).toList(), deals: (json['deals'] as List).map((e) => CrmDealRow.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'pipelines': pipelines.map((e) => e.toJson()).toList(), 'pipeline': pipeline == null ? null : pipeline!.toJson(), 'stages': stages.map((e) => e.toJson()).toList(), 'deals': deals.map((e) => e.toJson()).toList()};
}

class CrmDealsPipelines {
  final String id;
  final String name;

  const CrmDealsPipelines({required this.id, required this.name});

  factory CrmDealsPipelines.fromJson(Map<String, dynamic> json) => CrmDealsPipelines(id: json['id'] as String, name: json['name'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

class CrmDealsPipeline {
  final String id;
  final String name;

  const CrmDealsPipeline({required this.id, required this.name});

  factory CrmDealsPipeline.fromJson(Map<String, dynamic> json) => CrmDealsPipeline(id: json['id'] as String, name: json['name'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

class CrmDeal {
  final String id;
  final int number;
  final String title;
  final String? contactName;
  final String? phone;
  final double amount;
  final double paid;
  final String source;
  final CrmDealStage? stage;
  final List<CrmDealStages> stages;
  final String? assigneeId;
  final String? assignee;
  final bool unsorted;
  final List<String> tags;
  final Map<String, dynamic> customFields;
  final String createdAt;
  final CrmDealPerms perms;
  final double? maxDiscountPercent;
  final String? chatId;
  final CrmDealClient? client;
  final CrmDealOrder? order;
  final List<CrmDealTasks> tasks;
  final List<CrmDealNotes> notes;
  final List<CrmDealPayments> payments;
  final List<String> payForms;
  final bool hasOrder;
  final List<CrmInvoice> invoices;

  const CrmDeal({required this.id, required this.number, required this.title, this.contactName, this.phone, required this.amount, required this.paid, required this.source, this.stage, required this.stages, this.assigneeId, this.assignee, required this.unsorted, required this.tags, required this.customFields, required this.createdAt, required this.perms, this.maxDiscountPercent, this.chatId, this.client, this.order, required this.tasks, required this.notes, required this.payments, required this.payForms, required this.hasOrder, required this.invoices});

  factory CrmDeal.fromJson(Map<String, dynamic> json) => CrmDeal(id: json['id'] as String, number: (json['number'] as num).toInt(), title: json['title'] as String, contactName: json['contactName'] == null ? null : json['contactName'] as String, phone: json['phone'] == null ? null : json['phone'] as String, amount: (json['amount'] as num).toDouble(), paid: (json['paid'] as num).toDouble(), source: json['source'] as String, stage: json['stage'] == null ? null : CrmDealStage.fromJson(json['stage'] as Map<String, dynamic>), stages: (json['stages'] as List).map((e) => CrmDealStages.fromJson(e as Map<String, dynamic>)).toList(), assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, assignee: json['assignee'] == null ? null : json['assignee'] as String, unsorted: json['unsorted'] as bool, tags: (json['tags'] as List).map((e) => e as String).toList(), customFields: json['customFields'] as Map<String, dynamic>, createdAt: json['createdAt'] as String, perms: CrmDealPerms.fromJson(json['perms'] as Map<String, dynamic>), maxDiscountPercent: json['maxDiscountPercent'] == null ? null : (json['maxDiscountPercent'] as num).toDouble(), chatId: json['chatId'] == null ? null : json['chatId'] as String, client: json['client'] == null ? null : CrmDealClient.fromJson(json['client'] as Map<String, dynamic>), order: json['order'] == null ? null : CrmDealOrder.fromJson(json['order'] as Map<String, dynamic>), tasks: (json['tasks'] as List).map((e) => CrmDealTasks.fromJson(e as Map<String, dynamic>)).toList(), notes: (json['notes'] as List).map((e) => CrmDealNotes.fromJson(e as Map<String, dynamic>)).toList(), payments: (json['payments'] as List).map((e) => CrmDealPayments.fromJson(e as Map<String, dynamic>)).toList(), payForms: (json['payForms'] as List).map((e) => e as String).toList(), hasOrder: json['hasOrder'] as bool, invoices: (json['invoices'] as List).map((e) => CrmInvoice.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'title': title, 'contactName': contactName, 'phone': phone, 'amount': amount, 'paid': paid, 'source': source, 'stage': stage == null ? null : stage!.toJson(), 'stages': stages.map((e) => e.toJson()).toList(), 'assigneeId': assigneeId, 'assignee': assignee, 'unsorted': unsorted, 'tags': tags.map((e) => e).toList(), 'customFields': customFields, 'createdAt': createdAt, 'perms': perms.toJson(), 'maxDiscountPercent': maxDiscountPercent, 'chatId': chatId, 'client': client == null ? null : client!.toJson(), 'order': order == null ? null : order!.toJson(), 'tasks': tasks.map((e) => e.toJson()).toList(), 'notes': notes.map((e) => e.toJson()).toList(), 'payments': payments.map((e) => e.toJson()).toList(), 'payForms': payForms.map((e) => e).toList(), 'hasOrder': hasOrder, 'invoices': invoices.map((e) => e.toJson()).toList()};
}

class CrmDealStage {
  final String id;
  final String name;
  final String color;
  final String kind;

  const CrmDealStage({required this.id, required this.name, required this.color, required this.kind});

  factory CrmDealStage.fromJson(Map<String, dynamic> json) => CrmDealStage(id: json['id'] as String, name: json['name'] as String, color: json['color'] as String, kind: json['kind'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'color': color, 'kind': kind};
}

class CrmDealStages {
  final String id;
  final String name;
  final String color;
  final String kind;

  const CrmDealStages({required this.id, required this.name, required this.color, required this.kind});

  factory CrmDealStages.fromJson(Map<String, dynamic> json) => CrmDealStages(id: json['id'] as String, name: json['name'] as String, color: json['color'] as String, kind: json['kind'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'color': color, 'kind': kind};
}

class CrmDealPerms {
  final bool canEdit;
  final bool canMove;
  final bool canInvoice;
  final bool mine;

  const CrmDealPerms({required this.canEdit, required this.canMove, required this.canInvoice, required this.mine});

  factory CrmDealPerms.fromJson(Map<String, dynamic> json) => CrmDealPerms(canEdit: json['canEdit'] as bool, canMove: json['canMove'] as bool, canInvoice: json['canInvoice'] as bool, mine: json['mine'] as bool);

  Map<String, dynamic> toJson() => {'canEdit': canEdit, 'canMove': canMove, 'canInvoice': canInvoice, 'mine': mine};
}

class CrmDealClient {
  final String id;
  final String name;

  const CrmDealClient({required this.id, required this.name});

  factory CrmDealClient.fromJson(Map<String, dynamic> json) => CrmDealClient(id: json['id'] as String, name: json['name'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

class CrmDealOrder {
  final String id;
  final int number;
  final String status;
  final double amount;
  final String plan;

  const CrmDealOrder({required this.id, required this.number, required this.status, required this.amount, required this.plan});

  factory CrmDealOrder.fromJson(Map<String, dynamic> json) => CrmDealOrder(id: json['id'] as String, number: (json['number'] as num).toInt(), status: json['status'] as String, amount: (json['amount'] as num).toDouble(), plan: json['plan'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'status': status, 'amount': amount, 'plan': plan};
}

class CrmDealTasks {
  final String id;
  final String title;
  final String? dueAt;
  final bool done;

  const CrmDealTasks({required this.id, required this.title, this.dueAt, required this.done});

  factory CrmDealTasks.fromJson(Map<String, dynamic> json) => CrmDealTasks(id: json['id'] as String, title: json['title'] as String, dueAt: json['dueAt'] == null ? null : json['dueAt'] as String, done: json['done'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'dueAt': dueAt, 'done': done};
}

class CrmDealNotes {
  final String id;
  final String text;
  final String at;
  final String? author;

  const CrmDealNotes({required this.id, required this.text, required this.at, this.author});

  factory CrmDealNotes.fromJson(Map<String, dynamic> json) => CrmDealNotes(id: json['id'] as String, text: json['text'] as String, at: json['at'] as String, author: json['author'] == null ? null : json['author'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'text': text, 'at': at, 'author': author};
}

class CrmDealPayments {
  final String id;
  final double amount;
  final String kind;
  final String method;
  final String? payForm;
  final String at;

  const CrmDealPayments({required this.id, required this.amount, required this.kind, required this.method, this.payForm, required this.at});

  factory CrmDealPayments.fromJson(Map<String, dynamic> json) => CrmDealPayments(id: json['id'] as String, amount: (json['amount'] as num).toDouble(), kind: json['kind'] as String, method: json['method'] as String, payForm: json['payForm'] == null ? null : json['payForm'] as String, at: json['at'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'amount': amount, 'kind': kind, 'method': method, 'payForm': payForm, 'at': at};
}

class DeviceBody {
  /// ios | android
  final String platform;
  final String token;
  /// production | sandbox
  final String environment;

  const DeviceBody({required this.platform, required this.token, required this.environment});

  factory DeviceBody.fromJson(Map<String, dynamic> json) => DeviceBody(platform: json['platform'] as String, token: json['token'] as String, environment: json['environment'] as String);

  Map<String, dynamic> toJson() => {'platform': platform, 'token': token, 'environment': environment};
}

class DeviceForgetBody {
  final String token;

  const DeviceForgetBody({required this.token});

  factory DeviceForgetBody.fromJson(Map<String, dynamic> json) => DeviceForgetBody(token: json['token'] as String);

  Map<String, dynamic> toJson() => {'token': token};
}

class DeviceRegistered {
  final bool ok;
  final bool serverReady;

  const DeviceRegistered({required this.ok, required this.serverReady});

  factory DeviceRegistered.fromJson(Map<String, dynamic> json) => DeviceRegistered(ok: json['ok'] as bool, serverReady: json['serverReady'] as bool);

  Map<String, dynamic> toJson() => {'ok': ok, 'serverReady': serverReady};
}

class AppConfig {
  final String privacyUrl;
  final String termsUrl;

  const AppConfig({required this.privacyUrl, required this.termsUrl});

  factory AppConfig.fromJson(Map<String, dynamic> json) => AppConfig(privacyUrl: json['privacyUrl'] as String, termsUrl: json['termsUrl'] as String);

  Map<String, dynamic> toJson() => {'privacyUrl': privacyUrl, 'termsUrl': termsUrl};
}

class BookModel {
  final int pageCount;
  final BookModelDims dims;
  final String spreadUrl;
  final List<int> spreadWidths;
  final int sheets;
  final int leaves;
  final int window;
  final List<String> spreads;
  final BookModelViews views;
  final BookModelLight light;
  final BookModelPaper paper;
  final BookModelLabels labels;

  const BookModel({required this.pageCount, required this.dims, required this.spreadUrl, required this.spreadWidths, required this.sheets, required this.leaves, required this.window, required this.spreads, required this.views, required this.light, required this.paper, required this.labels});

  factory BookModel.fromJson(Map<String, dynamic> json) => BookModel(pageCount: (json['pageCount'] as num).toInt(), dims: BookModelDims.fromJson(json['dims'] as Map<String, dynamic>), spreadUrl: json['spreadUrl'] as String, spreadWidths: (json['spreadWidths'] as List).map((e) => (e as num).toInt()).toList(), sheets: (json['sheets'] as num).toInt(), leaves: (json['leaves'] as num).toInt(), window: (json['window'] as num).toInt(), spreads: (json['spreads'] as List).map((e) => e as String).toList(), views: BookModelViews.fromJson(json['views'] as Map<String, dynamic>), light: BookModelLight.fromJson(json['light'] as Map<String, dynamic>), paper: BookModelPaper.fromJson(json['paper'] as Map<String, dynamic>), labels: BookModelLabels.fromJson(json['labels'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'pageCount': pageCount, 'dims': dims.toJson(), 'spreadUrl': spreadUrl, 'spreadWidths': spreadWidths.map((e) => e).toList(), 'sheets': sheets, 'leaves': leaves, 'window': window, 'spreads': spreads.map((e) => e).toList(), 'views': views.toJson(), 'light': light.toJson(), 'paper': paper.toJson(), 'labels': labels.toJson()};
}

class BookModelDims {
  final double w;
  final double h;
  final double d;
  final double boardMm;
  final BookModelDimsBlock block;
  final BookModelDimsSpread spread;
  final BookModelDimsRects rects;

  const BookModelDims({required this.w, required this.h, required this.d, required this.boardMm, required this.block, required this.spread, required this.rects});

  factory BookModelDims.fromJson(Map<String, dynamic> json) => BookModelDims(w: (json['w'] as num).toDouble(), h: (json['h'] as num).toDouble(), d: (json['d'] as num).toDouble(), boardMm: (json['boardMm'] as num).toDouble(), block: BookModelDimsBlock.fromJson(json['block'] as Map<String, dynamic>), spread: BookModelDimsSpread.fromJson(json['spread'] as Map<String, dynamic>), rects: BookModelDimsRects.fromJson(json['rects'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'w': w, 'h': h, 'd': d, 'boardMm': boardMm, 'block': block.toJson(), 'spread': spread.toJson(), 'rects': rects.toJson()};
}

class BookModelDimsBlock {
  final double w;
  final double h;
  final double d;

  const BookModelDimsBlock({required this.w, required this.h, required this.d});

  factory BookModelDimsBlock.fromJson(Map<String, dynamic> json) => BookModelDimsBlock(w: (json['w'] as num).toDouble(), h: (json['h'] as num).toDouble(), d: (json['d'] as num).toDouble());

  Map<String, dynamic> toJson() => {'w': w, 'h': h, 'd': d};
}

class BookModelDimsSpread {
  final double w;
  final double h;

  const BookModelDimsSpread({required this.w, required this.h});

  factory BookModelDimsSpread.fromJson(Map<String, dynamic> json) => BookModelDimsSpread(w: (json['w'] as num).toDouble(), h: (json['h'] as num).toDouble());

  Map<String, dynamic> toJson() => {'w': w, 'h': h};
}

class BookModelDimsRects {
  final BookModelDimsRectsFront front;
  final BookModelDimsRectsBack back;
  final BookModelDimsRectsSpine spine;

  const BookModelDimsRects({required this.front, required this.back, required this.spine});

  factory BookModelDimsRects.fromJson(Map<String, dynamic> json) => BookModelDimsRects(front: BookModelDimsRectsFront.fromJson(json['front'] as Map<String, dynamic>), back: BookModelDimsRectsBack.fromJson(json['back'] as Map<String, dynamic>), spine: BookModelDimsRectsSpine.fromJson(json['spine'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'front': front.toJson(), 'back': back.toJson(), 'spine': spine.toJson()};
}

class BookModelDimsRectsFront {
  final double x;
  final double y;
  final double w;
  final double h;

  const BookModelDimsRectsFront({required this.x, required this.y, required this.w, required this.h});

  factory BookModelDimsRectsFront.fromJson(Map<String, dynamic> json) => BookModelDimsRectsFront(x: (json['x'] as num).toDouble(), y: (json['y'] as num).toDouble(), w: (json['w'] as num).toDouble(), h: (json['h'] as num).toDouble());

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 'w': w, 'h': h};
}

class BookModelDimsRectsBack {
  final double x;
  final double y;
  final double w;
  final double h;

  const BookModelDimsRectsBack({required this.x, required this.y, required this.w, required this.h});

  factory BookModelDimsRectsBack.fromJson(Map<String, dynamic> json) => BookModelDimsRectsBack(x: (json['x'] as num).toDouble(), y: (json['y'] as num).toDouble(), w: (json['w'] as num).toDouble(), h: (json['h'] as num).toDouble());

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 'w': w, 'h': h};
}

class BookModelDimsRectsSpine {
  final double x;
  final double y;
  final double w;
  final double h;

  const BookModelDimsRectsSpine({required this.x, required this.y, required this.w, required this.h});

  factory BookModelDimsRectsSpine.fromJson(Map<String, dynamic> json) => BookModelDimsRectsSpine(x: (json['x'] as num).toDouble(), y: (json['y'] as num).toDouble(), w: (json['w'] as num).toDouble(), h: (json['h'] as num).toDouble());

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 'w': w, 'h': h};
}

class BookModelViews {
  final BookModelViewsInitial initial;
  final BookModelViewsRead read;
  final double readZoom;
  final BookModelViewsZoom zoom;
  final double tiltLimit;
  final List<BookModelViewsList> list;

  const BookModelViews({required this.initial, required this.read, required this.readZoom, required this.zoom, required this.tiltLimit, required this.list});

  factory BookModelViews.fromJson(Map<String, dynamic> json) => BookModelViews(initial: BookModelViewsInitial.fromJson(json['initial'] as Map<String, dynamic>), read: BookModelViewsRead.fromJson(json['read'] as Map<String, dynamic>), readZoom: (json['readZoom'] as num).toDouble(), zoom: BookModelViewsZoom.fromJson(json['zoom'] as Map<String, dynamic>), tiltLimit: (json['tiltLimit'] as num).toDouble(), list: (json['list'] as List).map((e) => BookModelViewsList.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'initial': initial.toJson(), 'read': read.toJson(), 'readZoom': readZoom, 'zoom': zoom.toJson(), 'tiltLimit': tiltLimit, 'list': list.map((e) => e.toJson()).toList()};
}

class BookModelViewsInitial {
  final double rx;
  final double ry;

  const BookModelViewsInitial({required this.rx, required this.ry});

  factory BookModelViewsInitial.fromJson(Map<String, dynamic> json) => BookModelViewsInitial(rx: (json['rx'] as num).toDouble(), ry: (json['ry'] as num).toDouble());

  Map<String, dynamic> toJson() => {'rx': rx, 'ry': ry};
}

class BookModelViewsRead {
  final double rx;
  final double ry;

  const BookModelViewsRead({required this.rx, required this.ry});

  factory BookModelViewsRead.fromJson(Map<String, dynamic> json) => BookModelViewsRead(rx: (json['rx'] as num).toDouble(), ry: (json['ry'] as num).toDouble());

  Map<String, dynamic> toJson() => {'rx': rx, 'ry': ry};
}

class BookModelViewsZoom {
  final double min;
  final double max;
  final double step;

  const BookModelViewsZoom({required this.min, required this.max, required this.step});

  factory BookModelViewsZoom.fromJson(Map<String, dynamic> json) => BookModelViewsZoom(min: (json['min'] as num).toDouble(), max: (json['max'] as num).toDouble(), step: (json['step'] as num).toDouble());

  Map<String, dynamic> toJson() => {'min': min, 'max': max, 'step': step};
}

class BookModelViewsList {
  final String id;
  final String label;
  final double rx;
  final double ry;

  const BookModelViewsList({required this.id, required this.label, required this.rx, required this.ry});

  factory BookModelViewsList.fromJson(Map<String, dynamic> json) => BookModelViewsList(id: json['id'] as String, label: json['label'] as String, rx: (json['rx'] as num).toDouble(), ry: (json['ry'] as num).toDouble());

  Map<String, dynamic> toJson() => {'id': id, 'label': label, 'rx': rx, 'ry': ry};
}

class BookModelLight {
  final double x;
  final double y;
  final double z;
  final double ambient;
  final double shadeMax;

  const BookModelLight({required this.x, required this.y, required this.z, required this.ambient, required this.shadeMax});

  factory BookModelLight.fromJson(Map<String, dynamic> json) => BookModelLight(x: (json['x'] as num).toDouble(), y: (json['y'] as num).toDouble(), z: (json['z'] as num).toDouble(), ambient: (json['ambient'] as num).toDouble(), shadeMax: (json['shadeMax'] as num).toDouble());

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 'z': z, 'ambient': ambient, 'shadeMax': shadeMax};
}

class BookModelPaper {
  final List<String> endpaper;
  final List<String> edge;
  final String edgeLine;
  final List<String> stage;

  const BookModelPaper({required this.endpaper, required this.edge, required this.edgeLine, required this.stage});

  factory BookModelPaper.fromJson(Map<String, dynamic> json) => BookModelPaper(endpaper: (json['endpaper'] as List).map((e) => e as String).toList(), edge: (json['edge'] as List).map((e) => e as String).toList(), edgeLine: json['edgeLine'] as String, stage: (json['stage'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'endpaper': endpaper.map((e) => e).toList(), 'edge': edge.map((e) => e).toList(), 'edgeLine': edgeLine, 'stage': stage.map((e) => e).toList()};
}

class BookModelLabels {
  final String read;
  final String prev;
  final String next;
  final String zoomIn;
  final String zoomOut;
  final String autoOn;
  final String autoOff;
  final String reset;
  final String dims;
  final String hint;
  final String note;

  const BookModelLabels({required this.read, required this.prev, required this.next, required this.zoomIn, required this.zoomOut, required this.autoOn, required this.autoOff, required this.reset, required this.dims, required this.hint, required this.note});

  factory BookModelLabels.fromJson(Map<String, dynamic> json) => BookModelLabels(read: json['read'] as String, prev: json['prev'] as String, next: json['next'] as String, zoomIn: json['zoomIn'] as String, zoomOut: json['zoomOut'] as String, autoOn: json['autoOn'] as String, autoOff: json['autoOff'] as String, reset: json['reset'] as String, dims: json['dims'] as String, hint: json['hint'] as String, note: json['note'] as String);

  Map<String, dynamic> toJson() => {'read': read, 'prev': prev, 'next': next, 'zoomIn': zoomIn, 'zoomOut': zoomOut, 'autoOn': autoOn, 'autoOff': autoOff, 'reset': reset, 'dims': dims, 'hint': hint, 'note': note};
}

class WizardTheme {
  final String id;
  /// gift | autobiography | blank
  final String kind;
  /// gift | own
  final String group;
  /// required | optional | none
  final String recipient;
  final String name;
  final String description;
  final String questionsLabel;
  final String coverUrl;
  final String? recipientLabel;
  final String? recipientPlaceholder;
  final String? recipientGender;
  final bool recipientGenderChoice;
  /// m | f
  final String defaultRecipientGender;
  final List<WizardThemePerLanguage> perLanguage;
  final List<WizardThemeOccasions> occasions;

  const WizardTheme({required this.id, required this.kind, required this.group, required this.recipient, required this.name, required this.description, required this.questionsLabel, required this.coverUrl, this.recipientLabel, this.recipientPlaceholder, this.recipientGender, required this.recipientGenderChoice, required this.defaultRecipientGender, required this.perLanguage, required this.occasions});

  factory WizardTheme.fromJson(Map<String, dynamic> json) => WizardTheme(id: json['id'] as String, kind: json['kind'] as String, group: json['group'] as String, recipient: json['recipient'] as String, name: json['name'] as String, description: json['description'] as String, questionsLabel: json['questionsLabel'] as String, coverUrl: json['coverUrl'] as String, recipientLabel: json['recipientLabel'] == null ? null : json['recipientLabel'] as String, recipientPlaceholder: json['recipientPlaceholder'] == null ? null : json['recipientPlaceholder'] as String, recipientGender: json['recipientGender'] == null ? null : json['recipientGender'] as String, recipientGenderChoice: json['recipientGenderChoice'] as bool, defaultRecipientGender: json['defaultRecipientGender'] as String, perLanguage: (json['perLanguage'] as List).map((e) => WizardThemePerLanguage.fromJson(e as Map<String, dynamic>)).toList(), occasions: (json['occasions'] as List).map((e) => WizardThemeOccasions.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'id': id, 'kind': kind, 'group': group, 'recipient': recipient, 'name': name, 'description': description, 'questionsLabel': questionsLabel, 'coverUrl': coverUrl, 'recipientLabel': recipientLabel, 'recipientPlaceholder': recipientPlaceholder, 'recipientGender': recipientGender, 'recipientGenderChoice': recipientGenderChoice, 'defaultRecipientGender': defaultRecipientGender, 'perLanguage': perLanguage.map((e) => e.toJson()).toList(), 'occasions': occasions.map((e) => e.toJson()).toList()};
}

class WizardThemePerLanguage {
  final String language;
  final List<String> titles;
  final String firstChapter;

  const WizardThemePerLanguage({required this.language, required this.titles, required this.firstChapter});

  factory WizardThemePerLanguage.fromJson(Map<String, dynamic> json) => WizardThemePerLanguage(language: json['language'] as String, titles: (json['titles'] as List).map((e) => e as String).toList(), firstChapter: json['firstChapter'] as String);

  Map<String, dynamic> toJson() => {'language': language, 'titles': titles.map((e) => e).toList(), 'firstChapter': firstChapter};
}

class WizardThemeOccasions {
  final String id;
  final String label;
  final String? date;

  const WizardThemeOccasions({required this.id, required this.label, this.date});

  factory WizardThemeOccasions.fromJson(Map<String, dynamic> json) => WizardThemeOccasions(id: json['id'] as String, label: json['label'] as String, date: json['date'] == null ? null : json['date'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'label': label, 'date': date};
}

class BookWizard {
  final List<WizardTheme> themes;
  final List<BookWizardLanguages> languages;
  final String defaultLanguage;
  final String defaultAuthor;
  final BookWizardLimits limits;
  final BookWizardLabels labels;

  const BookWizard({required this.themes, required this.languages, required this.defaultLanguage, required this.defaultAuthor, required this.limits, required this.labels});

  factory BookWizard.fromJson(Map<String, dynamic> json) => BookWizard(themes: (json['themes'] as List).map((e) => WizardTheme.fromJson(e as Map<String, dynamic>)).toList(), languages: (json['languages'] as List).map((e) => BookWizardLanguages.fromJson(e as Map<String, dynamic>)).toList(), defaultLanguage: json['defaultLanguage'] as String, defaultAuthor: json['defaultAuthor'] as String, limits: BookWizardLimits.fromJson(json['limits'] as Map<String, dynamic>), labels: BookWizardLabels.fromJson(json['labels'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'themes': themes.map((e) => e.toJson()).toList(), 'languages': languages.map((e) => e.toJson()).toList(), 'defaultLanguage': defaultLanguage, 'defaultAuthor': defaultAuthor, 'limits': limits.toJson(), 'labels': labels.toJson()};
}

class BookWizardLanguages {
  final String id;
  final String label;

  const BookWizardLanguages({required this.id, required this.label});

  factory BookWizardLanguages.fromJson(Map<String, dynamic> json) => BookWizardLanguages(id: json['id'] as String, label: json['label'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'label': label};
}

class BookWizardLimits {
  final int authorName;
  final int recipientName;
  final int title;
  final int recordedBy;
  final int dedication;
  final int firstChapterTitle;

  const BookWizardLimits({required this.authorName, required this.recipientName, required this.title, required this.recordedBy, required this.dedication, required this.firstChapterTitle});

  factory BookWizardLimits.fromJson(Map<String, dynamic> json) => BookWizardLimits(authorName: (json['authorName'] as num).toInt(), recipientName: (json['recipientName'] as num).toInt(), title: (json['title'] as num).toInt(), recordedBy: (json['recordedBy'] as num).toInt(), dedication: (json['dedication'] as num).toInt(), firstChapterTitle: (json['firstChapterTitle'] as num).toInt());

  Map<String, dynamic> toJson() => {'authorName': authorName, 'recipientName': recipientName, 'title': title, 'recordedBy': recordedBy, 'dedication': dedication, 'firstChapterTitle': firstChapterTitle};
}

class BookWizardLabels {
  final String whoTitle;
  final String whoText;
  final BookWizardLabelsGroups groups;
  final List<String> steps;
  final List<String> stepOf;
  final BookWizardLabelsStepTitles stepTitles;
  final String detailsText;
  final String detailsTextBlank;
  final String titleText;
  final String authorName;
  final String authorAs;
  final BookWizardLabelsGenders genders;
  final String recipientFor;
  final BookWizardLabelsStory story;
  final BookWizardLabelsBlank blank;
  final String language;
  final String languageHint;
  final String languageHintBlank;
  final String bookTitle;
  final String occasion;
  final String occasionHint;
  final String occasionDate;
  final String occasionPickDate;
  final String optional;
  final String submit;
  final String pending;
  final String coverNote;
  final String next;
  final String prev;
  final String back;
  final String previewTitle;
  final BookWizardLabelsErrors errors;

  const BookWizardLabels({required this.whoTitle, required this.whoText, required this.groups, required this.steps, required this.stepOf, required this.stepTitles, required this.detailsText, required this.detailsTextBlank, required this.titleText, required this.authorName, required this.authorAs, required this.genders, required this.recipientFor, required this.story, required this.blank, required this.language, required this.languageHint, required this.languageHintBlank, required this.bookTitle, required this.occasion, required this.occasionHint, required this.occasionDate, required this.occasionPickDate, required this.optional, required this.submit, required this.pending, required this.coverNote, required this.next, required this.prev, required this.back, required this.previewTitle, required this.errors});

  factory BookWizardLabels.fromJson(Map<String, dynamic> json) => BookWizardLabels(whoTitle: json['whoTitle'] as String, whoText: json['whoText'] as String, groups: BookWizardLabelsGroups.fromJson(json['groups'] as Map<String, dynamic>), steps: (json['steps'] as List).map((e) => e as String).toList(), stepOf: (json['stepOf'] as List).map((e) => e as String).toList(), stepTitles: BookWizardLabelsStepTitles.fromJson(json['stepTitles'] as Map<String, dynamic>), detailsText: json['detailsText'] as String, detailsTextBlank: json['detailsTextBlank'] as String, titleText: json['titleText'] as String, authorName: json['authorName'] as String, authorAs: json['authorAs'] as String, genders: BookWizardLabelsGenders.fromJson(json['genders'] as Map<String, dynamic>), recipientFor: json['recipientFor'] as String, story: BookWizardLabelsStory.fromJson(json['story'] as Map<String, dynamic>), blank: BookWizardLabelsBlank.fromJson(json['blank'] as Map<String, dynamic>), language: json['language'] as String, languageHint: json['languageHint'] as String, languageHintBlank: json['languageHintBlank'] as String, bookTitle: json['bookTitle'] as String, occasion: json['occasion'] as String, occasionHint: json['occasionHint'] as String, occasionDate: json['occasionDate'] as String, occasionPickDate: json['occasionPickDate'] as String, optional: json['optional'] as String, submit: json['submit'] as String, pending: json['pending'] as String, coverNote: json['coverNote'] as String, next: json['next'] as String, prev: json['prev'] as String, back: json['back'] as String, previewTitle: json['previewTitle'] as String, errors: BookWizardLabelsErrors.fromJson(json['errors'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'whoTitle': whoTitle, 'whoText': whoText, 'groups': groups.toJson(), 'steps': steps.map((e) => e).toList(), 'stepOf': stepOf.map((e) => e).toList(), 'stepTitles': stepTitles.toJson(), 'detailsText': detailsText, 'detailsTextBlank': detailsTextBlank, 'titleText': titleText, 'authorName': authorName, 'authorAs': authorAs, 'genders': genders.toJson(), 'recipientFor': recipientFor, 'story': story.toJson(), 'blank': blank.toJson(), 'language': language, 'languageHint': languageHint, 'languageHintBlank': languageHintBlank, 'bookTitle': bookTitle, 'occasion': occasion, 'occasionHint': occasionHint, 'occasionDate': occasionDate, 'occasionPickDate': occasionPickDate, 'optional': optional, 'submit': submit, 'pending': pending, 'coverNote': coverNote, 'next': next, 'prev': prev, 'back': back, 'previewTitle': previewTitle, 'errors': errors.toJson()};
}

class BookWizardLabelsGroups {
  final String gift;
  final String own;

  const BookWizardLabelsGroups({required this.gift, required this.own});

  factory BookWizardLabelsGroups.fromJson(Map<String, dynamic> json) => BookWizardLabelsGroups(gift: json['gift'] as String, own: json['own'] as String);

  Map<String, dynamic> toJson() => {'gift': gift, 'own': own};
}

class BookWizardLabelsStepTitles {
  final String names;
  final String namesBlank;
  final String title;

  const BookWizardLabelsStepTitles({required this.names, required this.namesBlank, required this.title});

  factory BookWizardLabelsStepTitles.fromJson(Map<String, dynamic> json) => BookWizardLabelsStepTitles(names: json['names'] as String, namesBlank: json['namesBlank'] as String, title: json['title'] as String);

  Map<String, dynamic> toJson() => {'names': names, 'namesBlank': namesBlank, 'title': title};
}

class BookWizardLabelsGenders {
  final List<String> author;
  final List<String> recipient;

  const BookWizardLabelsGenders({required this.author, required this.recipient});

  factory BookWizardLabelsGenders.fromJson(Map<String, dynamic> json) => BookWizardLabelsGenders(author: (json['author'] as List).map((e) => e as String).toList(), recipient: (json['recipient'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'author': author.map((e) => e).toList(), 'recipient': recipient.map((e) => e).toList()};
}

class BookWizardLabelsStory {
  final String title;
  final String own;
  final String other;
  final String narratorName;
  final String narratorNamePlaceholder;
  final String narratorAs;
  final String recordedBy;
  final String recordedByPlaceholder;
  final String recordedByHint;
  final String dedication;
  final String dedicationPlaceholder;
  final String dedicationHint;

  const BookWizardLabelsStory({required this.title, required this.own, required this.other, required this.narratorName, required this.narratorNamePlaceholder, required this.narratorAs, required this.recordedBy, required this.recordedByPlaceholder, required this.recordedByHint, required this.dedication, required this.dedicationPlaceholder, required this.dedicationHint});

  factory BookWizardLabelsStory.fromJson(Map<String, dynamic> json) => BookWizardLabelsStory(title: json['title'] as String, own: json['own'] as String, other: json['other'] as String, narratorName: json['narratorName'] as String, narratorNamePlaceholder: json['narratorNamePlaceholder'] as String, narratorAs: json['narratorAs'] as String, recordedBy: json['recordedBy'] as String, recordedByPlaceholder: json['recordedByPlaceholder'] as String, recordedByHint: json['recordedByHint'] as String, dedication: json['dedication'] as String, dedicationPlaceholder: json['dedicationPlaceholder'] as String, dedicationHint: json['dedicationHint'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'own': own, 'other': other, 'narratorName': narratorName, 'narratorNamePlaceholder': narratorNamePlaceholder, 'narratorAs': narratorAs, 'recordedBy': recordedBy, 'recordedByPlaceholder': recordedByPlaceholder, 'recordedByHint': recordedByHint, 'dedication': dedication, 'dedicationPlaceholder': dedicationPlaceholder, 'dedicationHint': dedicationHint};
}

class BookWizardLabelsBlank {
  final String authorName;
  final String firstChapter;
  final String firstChapterHint;
  final String titleHint;

  const BookWizardLabelsBlank({required this.authorName, required this.firstChapter, required this.firstChapterHint, required this.titleHint});

  factory BookWizardLabelsBlank.fromJson(Map<String, dynamic> json) => BookWizardLabelsBlank(authorName: json['authorName'] as String, firstChapter: json['firstChapter'] as String, firstChapterHint: json['firstChapterHint'] as String, titleHint: json['titleHint'] as String);

  Map<String, dynamic> toJson() => {'authorName': authorName, 'firstChapter': firstChapter, 'firstChapterHint': firstChapterHint, 'titleHint': titleHint};
}

class BookWizardLabelsErrors {
  final String authorName;
  final String recipientName;
  final String title;

  const BookWizardLabelsErrors({required this.authorName, required this.recipientName, required this.title});

  factory BookWizardLabelsErrors.fromJson(Map<String, dynamic> json) => BookWizardLabelsErrors(authorName: json['authorName'] as String, recipientName: json['recipientName'] as String, title: json['title'] as String);

  Map<String, dynamic> toJson() => {'authorName': authorName, 'recipientName': recipientName, 'title': title};
}

class WizardDeadline {
  final String? text;

  const WizardDeadline({this.text});

  factory WizardDeadline.fromJson(Map<String, dynamic> json) => WizardDeadline(text: json['text'] == null ? null : json['text'] as String);

  Map<String, dynamic> toJson() => {'text': text};
}

class ShelfDeadline {
  final String text;
  /// calm | warm | hot
  final String tone;

  const ShelfDeadline({required this.text, required this.tone});

  factory ShelfDeadline.fromJson(Map<String, dynamic> json) => ShelfDeadline(text: json['text'] as String, tone: json['tone'] as String);

  Map<String, dynamic> toJson() => {'text': text, 'tone': tone};
}

class ShelfOrder {
  final String id;
  final int number;
  final String label;
  final String status;
  final String statusLabel;
  final String tone;

  const ShelfOrder({required this.id, required this.number, required this.label, required this.status, required this.statusLabel, required this.tone});

  factory ShelfOrder.fromJson(Map<String, dynamic> json) => ShelfOrder(id: json['id'] as String, number: (json['number'] as num).toInt(), label: json['label'] as String, status: json['status'] as String, statusLabel: json['statusLabel'] as String, tone: json['tone'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'label': label, 'status': status, 'statusLabel': statusLabel, 'tone': tone};
}

class ShelfItem {
  final String id;
  final String title;
  final String subtitle;
  final String kind;
  final bool blank;
  final bool ordered;
  final int progress;
  final String progressLabel;
  final String counts;
  final String updated;
  final ShelfDeadline? deadline;
  final ShelfOrder? order;
  final bool started;
  final String? writeSectionId;
  final String coverUrl;
  final String coverThumbUrl;

  const ShelfItem({required this.id, required this.title, required this.subtitle, required this.kind, required this.blank, required this.ordered, required this.progress, required this.progressLabel, required this.counts, required this.updated, this.deadline, this.order, required this.started, this.writeSectionId, required this.coverUrl, required this.coverThumbUrl});

  factory ShelfItem.fromJson(Map<String, dynamic> json) => ShelfItem(id: json['id'] as String, title: json['title'] as String, subtitle: json['subtitle'] as String, kind: json['kind'] as String, blank: json['blank'] as bool, ordered: json['ordered'] as bool, progress: (json['progress'] as num).toInt(), progressLabel: json['progressLabel'] as String, counts: json['counts'] as String, updated: json['updated'] as String, deadline: json['deadline'] == null ? null : ShelfDeadline.fromJson(json['deadline'] as Map<String, dynamic>), order: json['order'] == null ? null : ShelfOrder.fromJson(json['order'] as Map<String, dynamic>), started: json['started'] as bool, writeSectionId: json['writeSectionId'] == null ? null : json['writeSectionId'] as String, coverUrl: json['coverUrl'] as String, coverThumbUrl: json['coverThumbUrl'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'subtitle': subtitle, 'kind': kind, 'blank': blank, 'ordered': ordered, 'progress': progress, 'progressLabel': progressLabel, 'counts': counts, 'updated': updated, 'deadline': deadline == null ? null : deadline!.toJson(), 'order': order == null ? null : order!.toJson(), 'started': started, 'writeSectionId': writeSectionId, 'coverUrl': coverUrl, 'coverThumbUrl': coverThumbUrl};
}

class CabinetShelf {
  final List<ShelfItem> books;
  final CabinetShelfLabels labels;

  const CabinetShelf({required this.books, required this.labels});

  factory CabinetShelf.fromJson(Map<String, dynamic> json) => CabinetShelf(books: (json['books'] as List).map((e) => ShelfItem.fromJson(e as Map<String, dynamic>)).toList(), labels: CabinetShelfLabels.fromJson(json['labels'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'books': books.map((e) => e.toJson()).toList(), 'labels': labels.toJson()};
}

class CabinetShelfLabels {
  final String newBook;
  final CabinetShelfLabelsFirst first;

  const CabinetShelfLabels({required this.newBook, required this.first});

  factory CabinetShelfLabels.fromJson(Map<String, dynamic> json) => CabinetShelfLabels(newBook: json['newBook'] as String, first: CabinetShelfLabelsFirst.fromJson(json['first'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'newBook': newBook, 'first': first.toJson()};
}

class CabinetShelfLabelsFirst {
  final String hello;
  final String text;
  final String create;
  final String coverTitle;
  final List<CabinetShelfLabelsFirstSteps> steps;

  const CabinetShelfLabelsFirst({required this.hello, required this.text, required this.create, required this.coverTitle, required this.steps});

  factory CabinetShelfLabelsFirst.fromJson(Map<String, dynamic> json) => CabinetShelfLabelsFirst(hello: json['hello'] as String, text: json['text'] as String, create: json['create'] as String, coverTitle: json['coverTitle'] as String, steps: (json['steps'] as List).map((e) => CabinetShelfLabelsFirstSteps.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'hello': hello, 'text': text, 'create': create, 'coverTitle': coverTitle, 'steps': steps.map((e) => e.toJson()).toList()};
}

class CabinetShelfLabelsFirstSteps {
  final String title;
  final String text;

  const CabinetShelfLabelsFirstSteps({required this.title, required this.text});

  factory CabinetShelfLabelsFirstSteps.fromJson(Map<String, dynamic> json) => CabinetShelfLabelsFirstSteps(title: json['title'] as String, text: json['text'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'text': text};
}

class HubLink {
  final String href;
  final String label;

  const HubLink({required this.href, required this.label});

  factory HubLink.fromJson(Map<String, dynamic> json) => HubLink(href: json['href'] as String, label: json['label'] as String);

  Map<String, dynamic> toJson() => {'href': href, 'label': label};
}

class HubCard {
  final String eyebrow;
  final String title;
  final String? text;
  final bool serif;
  final HubLink primary;
  final bool primaryWrite;
  final HubLink? secondary;
  final String? moreText;
  final HubLink? more;

  const HubCard({required this.eyebrow, required this.title, this.text, required this.serif, required this.primary, required this.primaryWrite, this.secondary, this.moreText, this.more});

  factory HubCard.fromJson(Map<String, dynamic> json) => HubCard(eyebrow: json['eyebrow'] as String, title: json['title'] as String, text: json['text'] == null ? null : json['text'] as String, serif: json['serif'] as bool, primary: HubLink.fromJson(json['primary'] as Map<String, dynamic>), primaryWrite: json['primaryWrite'] as bool, secondary: json['secondary'] == null ? null : HubLink.fromJson(json['secondary'] as Map<String, dynamic>), moreText: json['moreText'] == null ? null : json['moreText'] as String, more: json['more'] == null ? null : HubLink.fromJson(json['more'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'eyebrow': eyebrow, 'title': title, 'text': text, 'serif': serif, 'primary': primary.toJson(), 'primaryWrite': primaryWrite, 'secondary': secondary == null ? null : secondary!.toJson(), 'moreText': moreText, 'more': more == null ? null : more!.toJson()};
}

class HubDeadline {
  final int days;
  final String daysShort;
  /// calm | warm | hot
  final String tone;
  final String headline;
  final String line;
  final String? icon;
  final String changeLabel;

  const HubDeadline({required this.days, required this.daysShort, required this.tone, required this.headline, required this.line, this.icon, required this.changeLabel});

  factory HubDeadline.fromJson(Map<String, dynamic> json) => HubDeadline(days: (json['days'] as num).toInt(), daysShort: json['daysShort'] as String, tone: json['tone'] as String, headline: json['headline'] as String, line: json['line'] as String, icon: json['icon'] == null ? null : json['icon'] as String, changeLabel: json['changeLabel'] as String);

  Map<String, dynamic> toJson() => {'days': days, 'daysShort': daysShort, 'tone': tone, 'headline': headline, 'line': line, 'icon': icon, 'changeLabel': changeLabel};
}

class HubStep {
  final String key;
  final String href;
  final String title;
  final String value;
  final String action;
  final String status;
  final double fraction;
  final int? bar;
  final bool active;

  const HubStep({required this.key, required this.href, required this.title, required this.value, required this.action, required this.status, required this.fraction, this.bar, required this.active});

  factory HubStep.fromJson(Map<String, dynamic> json) => HubStep(key: json['key'] as String, href: json['href'] as String, title: json['title'] as String, value: json['value'] as String, action: json['action'] as String, status: json['status'] as String, fraction: (json['fraction'] as num).toDouble(), bar: json['bar'] == null ? null : (json['bar'] as num).toInt(), active: json['active'] as bool);

  Map<String, dynamic> toJson() => {'key': key, 'href': href, 'title': title, 'value': value, 'action': action, 'status': status, 'fraction': fraction, 'bar': bar, 'active': active};
}

class HubNeed {
  /// error | warning
  final String level;
  final String text;
  final String? href;

  const HubNeed({required this.level, required this.text, this.href});

  factory HubNeed.fromJson(Map<String, dynamic> json) => HubNeed(level: json['level'] as String, text: json['text'] as String, href: json['href'] == null ? null : json['href'] as String);

  Map<String, dynamic> toJson() => {'level': level, 'text': text, 'href': href};
}

class HubChapter {
  final String key;
  final String title;
  final String label;
  final bool done;
  final int percent;
  final String? sectionId;

  const HubChapter({required this.key, required this.title, required this.label, required this.done, required this.percent, this.sectionId});

  factory HubChapter.fromJson(Map<String, dynamic> json) => HubChapter(key: json['key'] as String, title: json['title'] as String, label: json['label'] as String, done: json['done'] as bool, percent: (json['percent'] as num).toInt(), sectionId: json['sectionId'] == null ? null : json['sectionId'] as String);

  Map<String, dynamic> toJson() => {'key': key, 'title': title, 'label': label, 'done': done, 'percent': percent, 'sectionId': sectionId};
}

class CabinetBook {
  final String id;
  final String title;
  final String subtitle;
  final String kind;
  final String language;
  final bool blank;
  final bool editable;
  final String coverUrl;
  final String coverThumbUrl;
  final HubCard? card;
  final HubDeadline? deadline;
  final String pathTitle;
  final List<HubStep> steps;
  final String needsTitle;
  final String needsFix;
  final List<HubNeed> needs;
  final String chaptersTitle;
  final String? chaptersAside;
  final String allChaptersLabel;
  final List<HubChapter> chapters;
  final CabinetBookLetters letters;
  final CabinetBookHelp help;
  final String whereToStart;
  final List<String> tips;
  final String? tipsNote;
  final CabinetBookPreview preview;
  final CabinetBookEditor editor;

  const CabinetBook({required this.id, required this.title, required this.subtitle, required this.kind, required this.language, required this.blank, required this.editable, required this.coverUrl, required this.coverThumbUrl, this.card, this.deadline, required this.pathTitle, required this.steps, required this.needsTitle, required this.needsFix, required this.needs, required this.chaptersTitle, this.chaptersAside, required this.allChaptersLabel, required this.chapters, required this.letters, required this.help, required this.whereToStart, required this.tips, this.tipsNote, required this.preview, required this.editor});

  factory CabinetBook.fromJson(Map<String, dynamic> json) => CabinetBook(id: json['id'] as String, title: json['title'] as String, subtitle: json['subtitle'] as String, kind: json['kind'] as String, language: json['language'] as String, blank: json['blank'] as bool, editable: json['editable'] as bool, coverUrl: json['coverUrl'] as String, coverThumbUrl: json['coverThumbUrl'] as String, card: json['card'] == null ? null : HubCard.fromJson(json['card'] as Map<String, dynamic>), deadline: json['deadline'] == null ? null : HubDeadline.fromJson(json['deadline'] as Map<String, dynamic>), pathTitle: json['pathTitle'] as String, steps: (json['steps'] as List).map((e) => HubStep.fromJson(e as Map<String, dynamic>)).toList(), needsTitle: json['needsTitle'] as String, needsFix: json['needsFix'] as String, needs: (json['needs'] as List).map((e) => HubNeed.fromJson(e as Map<String, dynamic>)).toList(), chaptersTitle: json['chaptersTitle'] as String, chaptersAside: json['chaptersAside'] == null ? null : json['chaptersAside'] as String, allChaptersLabel: json['allChaptersLabel'] as String, chapters: (json['chapters'] as List).map((e) => HubChapter.fromJson(e as Map<String, dynamic>)).toList(), letters: CabinetBookLetters.fromJson(json['letters'] as Map<String, dynamic>), help: CabinetBookHelp.fromJson(json['help'] as Map<String, dynamic>), whereToStart: json['whereToStart'] as String, tips: (json['tips'] as List).map((e) => e as String).toList(), tipsNote: json['tipsNote'] == null ? null : json['tipsNote'] as String, preview: CabinetBookPreview.fromJson(json['preview'] as Map<String, dynamic>), editor: CabinetBookEditor.fromJson(json['editor'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'subtitle': subtitle, 'kind': kind, 'language': language, 'blank': blank, 'editable': editable, 'coverUrl': coverUrl, 'coverThumbUrl': coverThumbUrl, 'card': card == null ? null : card!.toJson(), 'deadline': deadline == null ? null : deadline!.toJson(), 'pathTitle': pathTitle, 'steps': steps.map((e) => e.toJson()).toList(), 'needsTitle': needsTitle, 'needsFix': needsFix, 'needs': needs.map((e) => e.toJson()).toList(), 'chaptersTitle': chaptersTitle, 'chaptersAside': chaptersAside, 'allChaptersLabel': allChaptersLabel, 'chapters': chapters.map((e) => e.toJson()).toList(), 'letters': letters.toJson(), 'help': help.toJson(), 'whereToStart': whereToStart, 'tips': tips.map((e) => e).toList(), 'tipsNote': tipsNote, 'preview': preview.toJson(), 'editor': editor.toJson()};
}

class CabinetBookLetters {
  final String title;
  final String text;
  final String action;
  final String href;
  final String tab;

  const CabinetBookLetters({required this.title, required this.text, required this.action, required this.href, required this.tab});

  factory CabinetBookLetters.fromJson(Map<String, dynamic> json) => CabinetBookLetters(title: json['title'] as String, text: json['text'] as String, action: json['action'] as String, href: json['href'] as String, tab: json['tab'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'text': text, 'action': action, 'href': href, 'tab': tab};
}

class CabinetBookHelp {
  final String title;
  final String text;
  final String url;

  const CabinetBookHelp({required this.title, required this.text, required this.url});

  factory CabinetBookHelp.fromJson(Map<String, dynamic> json) => CabinetBookHelp(title: json['title'] as String, text: json['text'] as String, url: json['url'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'text': text, 'url': url};
}

class CabinetBookPreview {
  final String href;
  final String tab;
  final String cta;

  const CabinetBookPreview({required this.href, required this.tab, required this.cta});

  factory CabinetBookPreview.fromJson(Map<String, dynamic> json) => CabinetBookPreview(href: json['href'] as String, tab: json['tab'] as String, cta: json['cta'] as String);

  Map<String, dynamic> toJson() => {'href': href, 'tab': tab, 'cta': cta};
}

class CabinetBookEditor {
  final String answerPlaceholder;
  final String prev;
  final String next;
  final String dictate;
  final String dictateTitle;
  final String stop;
  final String recording;
  final String recognizing;

  const CabinetBookEditor({required this.answerPlaceholder, required this.prev, required this.next, required this.dictate, required this.dictateTitle, required this.stop, required this.recording, required this.recognizing});

  factory CabinetBookEditor.fromJson(Map<String, dynamic> json) => CabinetBookEditor(answerPlaceholder: json['answerPlaceholder'] as String, prev: json['prev'] as String, next: json['next'] as String, dictate: json['dictate'] as String, dictateTitle: json['dictateTitle'] as String, stop: json['stop'] as String, recording: json['recording'] as String, recognizing: json['recognizing'] as String);

  Map<String, dynamic> toJson() => {'answerPlaceholder': answerPlaceholder, 'prev': prev, 'next': next, 'dictate': dictate, 'dictateTitle': dictateTitle, 'stop': stop, 'recording': recording, 'recognizing': recognizing};
}

class CabPhotoPlace {
  final String kind;
  final String label;
  final bool auto;
  final String? onCover;
  final String option;

  const CabPhotoPlace({required this.kind, required this.label, required this.auto, this.onCover, required this.option});

  factory CabPhotoPlace.fromJson(Map<String, dynamic> json) => CabPhotoPlace(kind: json['kind'] as String, label: json['label'] as String, auto: json['auto'] as bool, onCover: json['onCover'] == null ? null : json['onCover'] as String, option: json['option'] as String);

  Map<String, dynamic> toJson() => {'kind': kind, 'label': label, 'auto': auto, 'onCover': onCover, 'option': option};
}

class CabPhoto {
  final String id;
  final int n;
  final int width;
  final int height;
  final String caption;
  final String layout;
  final String thumbUrl;
  final String url;
  final CabPhotoPlace place;
  final String? questionId;
  final String? chapter;
  final String? loss;

  const CabPhoto({required this.id, required this.n, required this.width, required this.height, required this.caption, required this.layout, required this.thumbUrl, required this.url, required this.place, this.questionId, this.chapter, this.loss});

  factory CabPhoto.fromJson(Map<String, dynamic> json) => CabPhoto(id: json['id'] as String, n: (json['n'] as num).toInt(), width: (json['width'] as num).toInt(), height: (json['height'] as num).toInt(), caption: json['caption'] as String, layout: json['layout'] as String, thumbUrl: json['thumbUrl'] as String, url: json['url'] as String, place: CabPhotoPlace.fromJson(json['place'] as Map<String, dynamic>), questionId: json['questionId'] == null ? null : json['questionId'] as String, chapter: json['chapter'] == null ? null : json['chapter'] as String, loss: json['loss'] == null ? null : json['loss'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'n': n, 'width': width, 'height': height, 'caption': caption, 'layout': layout, 'thumbUrl': thumbUrl, 'url': url, 'place': place.toJson(), 'questionId': questionId, 'chapter': chapter, 'loss': loss};
}

class CabLabeled {
  final String key;
  final String label;
  final String? hint;
  final int? count;

  const CabLabeled({required this.key, required this.label, this.hint, this.count});

  factory CabLabeled.fromJson(Map<String, dynamic> json) => CabLabeled(key: json['key'] as String, label: json['label'] as String, hint: json['hint'] == null ? null : json['hint'] as String, count: json['count'] == null ? null : (json['count'] as num).toInt());

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'hint': hint, 'count': count};
}

class CabinetPhotos {
  final bool editable;
  final bool blank;
  final int maxPhotos;
  final String title;
  final String intro;
  final String addLabel;
  final List<CabLabeled> summary;
  final List<CabLabeled> filters;
  final String ruleTitle;
  final String ruleName;
  final String ruleChange;
  final String noMatch;
  final List<CabPhoto> photos;
  final List<CabinetPhotosChapters> chapters;
  final List<CabinetPhotosAnswers> answers;
  final CabinetPhotosSheet sheet;

  const CabinetPhotos({required this.editable, required this.blank, required this.maxPhotos, required this.title, required this.intro, required this.addLabel, required this.summary, required this.filters, required this.ruleTitle, required this.ruleName, required this.ruleChange, required this.noMatch, required this.photos, required this.chapters, required this.answers, required this.sheet});

  factory CabinetPhotos.fromJson(Map<String, dynamic> json) => CabinetPhotos(editable: json['editable'] as bool, blank: json['blank'] as bool, maxPhotos: (json['maxPhotos'] as num).toInt(), title: json['title'] as String, intro: json['intro'] as String, addLabel: json['addLabel'] as String, summary: (json['summary'] as List).map((e) => CabLabeled.fromJson(e as Map<String, dynamic>)).toList(), filters: (json['filters'] as List).map((e) => CabLabeled.fromJson(e as Map<String, dynamic>)).toList(), ruleTitle: json['ruleTitle'] as String, ruleName: json['ruleName'] as String, ruleChange: json['ruleChange'] as String, noMatch: json['noMatch'] as String, photos: (json['photos'] as List).map((e) => CabPhoto.fromJson(e as Map<String, dynamic>)).toList(), chapters: (json['chapters'] as List).map((e) => CabinetPhotosChapters.fromJson(e as Map<String, dynamic>)).toList(), answers: (json['answers'] as List).map((e) => CabinetPhotosAnswers.fromJson(e as Map<String, dynamic>)).toList(), sheet: CabinetPhotosSheet.fromJson(json['sheet'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'editable': editable, 'blank': blank, 'maxPhotos': maxPhotos, 'title': title, 'intro': intro, 'addLabel': addLabel, 'summary': summary.map((e) => e.toJson()).toList(), 'filters': filters.map((e) => e.toJson()).toList(), 'ruleTitle': ruleTitle, 'ruleName': ruleName, 'ruleChange': ruleChange, 'noMatch': noMatch, 'photos': photos.map((e) => e.toJson()).toList(), 'chapters': chapters.map((e) => e.toJson()).toList(), 'answers': answers.map((e) => e.toJson()).toList(), 'sheet': sheet.toJson()};
}

class CabinetPhotosChapters {
  final String key;
  final String title;

  const CabinetPhotosChapters({required this.key, required this.title});

  factory CabinetPhotosChapters.fromJson(Map<String, dynamic> json) => CabinetPhotosChapters(key: json['key'] as String, title: json['title'] as String);

  Map<String, dynamic> toJson() => {'key': key, 'title': title};
}

class CabinetPhotosAnswers {
  final String id;
  final String title;
  final String chapterKey;

  const CabinetPhotosAnswers({required this.id, required this.title, required this.chapterKey});

  factory CabinetPhotosAnswers.fromJson(Map<String, dynamic> json) => CabinetPhotosAnswers(id: json['id'] as String, title: json['title'] as String, chapterKey: json['chapterKey'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'chapterKey': chapterKey};
}

class CabinetPhotosSheet {
  final String title;
  final List<CabLabeled> options;
  final String stepChapter;
  final String stepAnswer;
  final String here;
  final String layoutTitle;
  final List<CabLabeled> layouts;
  final String caption;
  final String done;
  final String coverNote;
  final String backNote;
  final String deleteLabel;
  final String deleteTitle;
  final String deleteText;
  final String deleteConfirm;
  final String deleteKeep;
  final String cancel;

  const CabinetPhotosSheet({required this.title, required this.options, required this.stepChapter, required this.stepAnswer, required this.here, required this.layoutTitle, required this.layouts, required this.caption, required this.done, required this.coverNote, required this.backNote, required this.deleteLabel, required this.deleteTitle, required this.deleteText, required this.deleteConfirm, required this.deleteKeep, required this.cancel});

  factory CabinetPhotosSheet.fromJson(Map<String, dynamic> json) => CabinetPhotosSheet(title: json['title'] as String, options: (json['options'] as List).map((e) => CabLabeled.fromJson(e as Map<String, dynamic>)).toList(), stepChapter: json['stepChapter'] as String, stepAnswer: json['stepAnswer'] as String, here: json['here'] as String, layoutTitle: json['layoutTitle'] as String, layouts: (json['layouts'] as List).map((e) => CabLabeled.fromJson(e as Map<String, dynamic>)).toList(), caption: json['caption'] as String, done: json['done'] as String, coverNote: json['coverNote'] as String, backNote: json['backNote'] as String, deleteLabel: json['deleteLabel'] as String, deleteTitle: json['deleteTitle'] as String, deleteText: json['deleteText'] as String, deleteConfirm: json['deleteConfirm'] as String, deleteKeep: json['deleteKeep'] as String, cancel: json['cancel'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'options': options.map((e) => e.toJson()).toList(), 'stepChapter': stepChapter, 'stepAnswer': stepAnswer, 'here': here, 'layoutTitle': layoutTitle, 'layouts': layouts.map((e) => e.toJson()).toList(), 'caption': caption, 'done': done, 'coverNote': coverNote, 'backNote': backNote, 'deleteLabel': deleteLabel, 'deleteTitle': deleteTitle, 'deleteText': deleteText, 'deleteConfirm': deleteConfirm, 'deleteKeep': deleteKeep, 'cancel': cancel};
}

class HelpMessage {
  final String id;
  /// client | bot | manager
  final String from;
  final String at;
  final String text;
  final String place;

  const HelpMessage({required this.id, required this.from, required this.at, required this.text, required this.place});

  factory HelpMessage.fromJson(Map<String, dynamic> json) => HelpMessage(id: json['id'] as String, from: json['from'] as String, at: json['at'] as String, text: json['text'] as String, place: json['place'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'from': from, 'at': at, 'text': text, 'place': place};
}

class CabinetHelp {
  final bool enabled;
  final String whatsapp;
  final List<HelpMessage> messages;
  final List<String> hints;
  final CabinetHelpLabels labels;

  const CabinetHelp({required this.enabled, required this.whatsapp, required this.messages, required this.hints, required this.labels});

  factory CabinetHelp.fromJson(Map<String, dynamic> json) => CabinetHelp(enabled: json['enabled'] as bool, whatsapp: json['whatsapp'] as String, messages: (json['messages'] as List).map((e) => HelpMessage.fromJson(e as Map<String, dynamic>)).toList(), hints: (json['hints'] as List).map((e) => e as String).toList(), labels: CabinetHelpLabels.fromJson(json['labels'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'enabled': enabled, 'whatsapp': whatsapp, 'messages': messages.map((e) => e.toJson()).toList(), 'hints': hints.map((e) => e).toList(), 'labels': labels.toJson()};
}

class CabinetHelpLabels {
  final String button;
  final String title;
  final String subtitle;
  final String hello;
  final String faqTitle;
  final String placeholder;
  final String typing;
  final String bot;
  final String manager;
  final String notHelped;
  final String callHuman;
  final String handoff;
  final String whatsapp;
  final String disclaimer;
  final String off;
  final String error;

  const CabinetHelpLabels({required this.button, required this.title, required this.subtitle, required this.hello, required this.faqTitle, required this.placeholder, required this.typing, required this.bot, required this.manager, required this.notHelped, required this.callHuman, required this.handoff, required this.whatsapp, required this.disclaimer, required this.off, required this.error});

  factory CabinetHelpLabels.fromJson(Map<String, dynamic> json) => CabinetHelpLabels(button: json['button'] as String, title: json['title'] as String, subtitle: json['subtitle'] as String, hello: json['hello'] as String, faqTitle: json['faqTitle'] as String, placeholder: json['placeholder'] as String, typing: json['typing'] as String, bot: json['bot'] as String, manager: json['manager'] as String, notHelped: json['notHelped'] as String, callHuman: json['callHuman'] as String, handoff: json['handoff'] as String, whatsapp: json['whatsapp'] as String, disclaimer: json['disclaimer'] as String, off: json['off'] as String, error: json['error'] as String);

  Map<String, dynamic> toJson() => {'button': button, 'title': title, 'subtitle': subtitle, 'hello': hello, 'faqTitle': faqTitle, 'placeholder': placeholder, 'typing': typing, 'bot': bot, 'manager': manager, 'notHelped': notHelped, 'callHuman': callHuman, 'handoff': handoff, 'whatsapp': whatsapp, 'disclaimer': disclaimer, 'off': off, 'error': error};
}

class HelpAskBody {
  final String text;
  final bool human;

  const HelpAskBody({required this.text, required this.human});

  factory HelpAskBody.fromJson(Map<String, dynamic> json) => HelpAskBody(text: json['text'] as String, human: json['human'] as bool);

  Map<String, dynamic> toJson() => {'text': text, 'human': human};
}

class HelpAnswer {
  final String outcome;
  final List<String> suggestions;
  final List<HelpMessage> messages;

  const HelpAnswer({required this.outcome, required this.suggestions, required this.messages});

  factory HelpAnswer.fromJson(Map<String, dynamic> json) => HelpAnswer(outcome: json['outcome'] as String, suggestions: (json['suggestions'] as List).map((e) => e as String).toList(), messages: (json['messages'] as List).map((e) => HelpMessage.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'outcome': outcome, 'suggestions': suggestions.map((e) => e).toList(), 'messages': messages.map((e) => e.toJson()).toList()};
}

class PriceLine {
  final String label;
  final String value;
  /// plain | success | muted
  final String tone;

  const PriceLine({required this.label, required this.value, required this.tone});

  factory PriceLine.fromJson(Map<String, dynamic> json) => PriceLine(label: json['label'] as String, value: json['value'] as String, tone: json['tone'] as String);

  Map<String, dynamic> toJson() => {'label': label, 'value': value, 'tone': tone};
}

class CheckoutAddon {
  final String id;
  final String name;
  final String description;
  final String priceLabel;

  const CheckoutAddon({required this.id, required this.name, required this.description, required this.priceLabel});

  factory CheckoutAddon.fromJson(Map<String, dynamic> json) => CheckoutAddon(id: json['id'] as String, name: json['name'] as String, description: json['description'] as String, priceLabel: json['priceLabel'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'description': description, 'priceLabel': priceLabel};
}

class CheckoutPlan {
  final String id;
  final String name;
  final List<String> features;
  final int price;
  final String priceLabel;
  final bool printed;
  final String? extraCopy;
  final List<CheckoutAddon> addons;

  const CheckoutPlan({required this.id, required this.name, required this.features, required this.price, required this.priceLabel, required this.printed, this.extraCopy, required this.addons});

  factory CheckoutPlan.fromJson(Map<String, dynamic> json) => CheckoutPlan(id: json['id'] as String, name: json['name'] as String, features: (json['features'] as List).map((e) => e as String).toList(), price: (json['price'] as num).toInt(), priceLabel: json['priceLabel'] as String, printed: json['printed'] as bool, extraCopy: json['extraCopy'] == null ? null : json['extraCopy'] as String, addons: (json['addons'] as List).map((e) => CheckoutAddon.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'features': features.map((e) => e).toList(), 'price': price, 'priceLabel': priceLabel, 'printed': printed, 'extraCopy': extraCopy, 'addons': addons.map((e) => e.toJson()).toList()};
}

class CheckoutDelivery {
  final String id;
  final String name;
  final String description;
  final String priceLabel;
  final bool quoted;
  final bool abroad;

  const CheckoutDelivery({required this.id, required this.name, required this.description, required this.priceLabel, required this.quoted, required this.abroad});

  factory CheckoutDelivery.fromJson(Map<String, dynamic> json) => CheckoutDelivery(id: json['id'] as String, name: json['name'] as String, description: json['description'] as String, priceLabel: json['priceLabel'] as String, quoted: json['quoted'] as bool, abroad: json['abroad'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'description': description, 'priceLabel': priceLabel, 'quoted': quoted, 'abroad': abroad};
}

class CheckoutIssue {
  /// error | warning
  final String level;
  final String text;
  final String? href;

  const CheckoutIssue({required this.level, required this.text, this.href});

  factory CheckoutIssue.fromJson(Map<String, dynamic> json) => CheckoutIssue(level: json['level'] as String, text: json['text'] as String, href: json['href'] == null ? null : json['href'] as String);

  Map<String, dynamic> toJson() => {'level': level, 'text': text, 'href': href};
}

class CheckoutAgreement {
  final String title;
  final String summary;
  final String? batch;
  final String? gifts;
  final List<CheckoutAgreementModes> modes;
  final String refund;
  final String whatsapp;

  const CheckoutAgreement({required this.title, required this.summary, this.batch, this.gifts, required this.modes, required this.refund, required this.whatsapp});

  factory CheckoutAgreement.fromJson(Map<String, dynamic> json) => CheckoutAgreement(title: json['title'] as String, summary: json['summary'] as String, batch: json['batch'] == null ? null : json['batch'] as String, gifts: json['gifts'] == null ? null : json['gifts'] as String, modes: (json['modes'] as List).map((e) => CheckoutAgreementModes.fromJson(e as Map<String, dynamic>)).toList(), refund: json['refund'] as String, whatsapp: json['whatsapp'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'summary': summary, 'batch': batch, 'gifts': gifts, 'modes': modes.map((e) => e.toJson()).toList(), 'refund': refund, 'whatsapp': whatsapp};
}

class CheckoutAgreementModes {
  final String id;
  final String title;
  final String hint;

  const CheckoutAgreementModes({required this.id, required this.title, required this.hint});

  factory CheckoutAgreementModes.fromJson(Map<String, dynamic> json) => CheckoutAgreementModes(id: json['id'] as String, title: json['title'] as String, hint: json['hint'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'hint': hint};
}

class CabinetCheckout {
  final bool closed;
  final String? orderId;
  final String? title;
  final String? summary;
  final List<String>? design;
  final String? checkPreview;
  final bool? blocked;
  final List<CheckoutIssue>? issues;
  final List<CheckoutPlan>? plans;
  final String? lockedPlan;
  final List<CheckoutDelivery>? deliveries;
  final String? quotedNote;
  final bool? giftNote;
  final String? occasionLabel;
  final CheckoutAgreement? agreement;
  final CabinetCheckoutDefaults? defaults;
  final String? offerUrl;
  final String? privacyUrl;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CabinetCheckout({required this.closed, this.orderId, this.title, this.summary, this.design, this.checkPreview, this.blocked, this.issues, this.plans, this.lockedPlan, this.deliveries, this.quotedNote, this.giftNote, this.occasionLabel, this.agreement, this.defaults, this.offerUrl, this.privacyUrl, this.nulls = const {}});

  factory CabinetCheckout.fromJson(Map<String, dynamic> json) => CabinetCheckout(closed: json['closed'] as bool, orderId: json['orderId'] == null ? null : json['orderId'] as String, title: json['title'] == null ? null : json['title'] as String, summary: json['summary'] == null ? null : json['summary'] as String, design: json['design'] == null ? null : (json['design'] as List).map((e) => e as String).toList(), checkPreview: json['checkPreview'] == null ? null : json['checkPreview'] as String, blocked: json['blocked'] == null ? null : json['blocked'] as bool, issues: json['issues'] == null ? null : (json['issues'] as List).map((e) => CheckoutIssue.fromJson(e as Map<String, dynamic>)).toList(), plans: json['plans'] == null ? null : (json['plans'] as List).map((e) => CheckoutPlan.fromJson(e as Map<String, dynamic>)).toList(), lockedPlan: json['lockedPlan'] == null ? null : json['lockedPlan'] as String, deliveries: json['deliveries'] == null ? null : (json['deliveries'] as List).map((e) => CheckoutDelivery.fromJson(e as Map<String, dynamic>)).toList(), quotedNote: json['quotedNote'] == null ? null : json['quotedNote'] as String, giftNote: json['giftNote'] == null ? null : json['giftNote'] as bool, occasionLabel: json['occasionLabel'] == null ? null : json['occasionLabel'] as String, agreement: json['agreement'] == null ? null : CheckoutAgreement.fromJson(json['agreement'] as Map<String, dynamic>), defaults: json['defaults'] == null ? null : CabinetCheckoutDefaults.fromJson(json['defaults'] as Map<String, dynamic>), offerUrl: json['offerUrl'] == null ? null : json['offerUrl'] as String, privacyUrl: json['privacyUrl'] == null ? null : json['privacyUrl'] as String);

  Map<String, dynamic> toJson() => {'closed': closed, 'orderId': orderId, if (title != null) 'title': title!, if (summary != null) 'summary': summary!, if (design != null) 'design': design!.map((e) => e).toList(), if (checkPreview != null) 'checkPreview': checkPreview!, if (blocked != null) 'blocked': blocked!, if (issues != null) 'issues': issues!.map((e) => e.toJson()).toList(), if (plans != null) 'plans': plans!.map((e) => e.toJson()).toList(), if (lockedPlan != null || nulls.contains('lockedPlan')) 'lockedPlan': lockedPlan, if (deliveries != null) 'deliveries': deliveries!.map((e) => e.toJson()).toList(), if (quotedNote != null) 'quotedNote': quotedNote!, if (giftNote != null) 'giftNote': giftNote!, if (occasionLabel != null || nulls.contains('occasionLabel')) 'occasionLabel': occasionLabel, if (agreement != null || nulls.contains('agreement')) 'agreement': agreement == null ? null : agreement!.toJson(), if (defaults != null) 'defaults': defaults!.toJson(), if (offerUrl != null) 'offerUrl': offerUrl!, if (privacyUrl != null) 'privacyUrl': privacyUrl!};
}

class CabinetCheckoutDefaults {
  final String name;
  final String email;
  final String phone;
  final String desiredDate;

  const CabinetCheckoutDefaults({required this.name, required this.email, required this.phone, required this.desiredDate});

  factory CabinetCheckoutDefaults.fromJson(Map<String, dynamic> json) => CabinetCheckoutDefaults(name: json['name'] as String, email: json['email'] as String, phone: json['phone'] as String, desiredDate: json['desiredDate'] as String);

  Map<String, dynamic> toJson() => {'name': name, 'email': email, 'phone': phone, 'desiredDate': desiredDate};
}

class CheckoutQuoteBody {
  final String plan;
  final int quantity;
  final String? delivery;
  final List<String> addons;
  final String? promoCode;
  final String? mode;

  const CheckoutQuoteBody({required this.plan, required this.quantity, this.delivery, required this.addons, this.promoCode, this.mode});

  factory CheckoutQuoteBody.fromJson(Map<String, dynamic> json) => CheckoutQuoteBody(plan: json['plan'] as String, quantity: (json['quantity'] as num).toInt(), delivery: json['delivery'] == null ? null : json['delivery'] as String, addons: (json['addons'] as List).map((e) => e as String).toList(), promoCode: json['promoCode'] == null ? null : json['promoCode'] as String, mode: json['mode'] == null ? null : json['mode'] as String);

  Map<String, dynamic> toJson() => {'plan': plan, 'quantity': quantity, 'delivery': delivery, 'addons': addons.map((e) => e).toList(), 'promoCode': promoCode, 'mode': mode};
}

class CheckoutQuote {
  final String plan;
  final List<PriceLine> lines;
  final String totalLabel;
  final String total;
  final String? quotedTotal;
  final CheckoutQuotePromo? promo;

  const CheckoutQuote({required this.plan, required this.lines, required this.totalLabel, required this.total, this.quotedTotal, this.promo});

  factory CheckoutQuote.fromJson(Map<String, dynamic> json) => CheckoutQuote(plan: json['plan'] as String, lines: (json['lines'] as List).map((e) => PriceLine.fromJson(e as Map<String, dynamic>)).toList(), totalLabel: json['totalLabel'] as String, total: json['total'] as String, quotedTotal: json['quotedTotal'] == null ? null : json['quotedTotal'] as String, promo: json['promo'] == null ? null : CheckoutQuotePromo.fromJson(json['promo'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'plan': plan, 'lines': lines.map((e) => e.toJson()).toList(), 'totalLabel': totalLabel, 'total': total, 'quotedTotal': quotedTotal, 'promo': promo == null ? null : promo!.toJson()};
}

class CheckoutQuotePromo {
  final bool ok;
  final String text;

  const CheckoutQuotePromo({required this.ok, required this.text});

  factory CheckoutQuotePromo.fromJson(Map<String, dynamic> json) => CheckoutQuotePromo(ok: json['ok'] as bool, text: json['text'] as String);

  Map<String, dynamic> toJson() => {'ok': ok, 'text': text};
}

class OrderPlaceBody {
  final String plan;
  final int quantity;
  final String? delivery;
  final List<String> addons;
  final String? promoCode;
  final String? mode;
  final String contactName;
  final String contactPhone;
  final String contactEmail;
  final String country;
  final String city;
  final String address;
  final String postalCode;
  final String comment;
  final String giftNote;
  final String desiredDate;
  final bool surprise;
  final bool consent;

  const OrderPlaceBody({required this.plan, required this.quantity, this.delivery, required this.addons, this.promoCode, this.mode, required this.contactName, required this.contactPhone, required this.contactEmail, required this.country, required this.city, required this.address, required this.postalCode, required this.comment, required this.giftNote, required this.desiredDate, required this.surprise, required this.consent});

  factory OrderPlaceBody.fromJson(Map<String, dynamic> json) => OrderPlaceBody(plan: json['plan'] as String, quantity: (json['quantity'] as num).toInt(), delivery: json['delivery'] == null ? null : json['delivery'] as String, addons: (json['addons'] as List).map((e) => e as String).toList(), promoCode: json['promoCode'] == null ? null : json['promoCode'] as String, mode: json['mode'] == null ? null : json['mode'] as String, contactName: json['contactName'] as String, contactPhone: json['contactPhone'] as String, contactEmail: json['contactEmail'] as String, country: json['country'] as String, city: json['city'] as String, address: json['address'] as String, postalCode: json['postalCode'] as String, comment: json['comment'] as String, giftNote: json['giftNote'] as String, desiredDate: json['desiredDate'] as String, surprise: json['surprise'] as bool, consent: json['consent'] as bool);

  Map<String, dynamic> toJson() => {'plan': plan, 'quantity': quantity, 'delivery': delivery, 'addons': addons.map((e) => e).toList(), 'promoCode': promoCode, 'mode': mode, 'contactName': contactName, 'contactPhone': contactPhone, 'contactEmail': contactEmail, 'country': country, 'city': city, 'address': address, 'postalCode': postalCode, 'comment': comment, 'giftNote': giftNote, 'desiredDate': desiredDate, 'surprise': surprise, 'consent': consent};
}

class OrderPlaced {
  final String orderId;

  const OrderPlaced({required this.orderId});

  factory OrderPlaced.fromJson(Map<String, dynamic> json) => OrderPlaced(orderId: json['orderId'] as String);

  Map<String, dynamic> toJson() => {'orderId': orderId};
}

class KaspiInvoice {
  final String id;
  final String method;
  final String status;
  final double amount;
  final String? phone;
  final String? link;
  final String? qrSvg;
  final String? expiresAt;
  final String? paidAt;

  const KaspiInvoice({required this.id, required this.method, required this.status, required this.amount, this.phone, this.link, this.qrSvg, this.expiresAt, this.paidAt});

  factory KaspiInvoice.fromJson(Map<String, dynamic> json) => KaspiInvoice(id: json['id'] as String, method: json['method'] as String, status: json['status'] as String, amount: (json['amount'] as num).toDouble(), phone: json['phone'] == null ? null : json['phone'] as String, link: json['link'] == null ? null : json['link'] as String, qrSvg: json['qrSvg'] == null ? null : json['qrSvg'] as String, expiresAt: json['expiresAt'] == null ? null : json['expiresAt'] as String, paidAt: json['paidAt'] == null ? null : json['paidAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'method': method, 'status': status, 'amount': amount, 'phone': phone, 'link': link, 'qrSvg': qrSvg, 'expiresAt': expiresAt, 'paidAt': paidAt};
}

class CabinetOrder {
  final String id;
  final int number;
  final String title;
  final String created;
  final String bookId;
  final String bookTitle;
  final String status;
  final String statusLabel;
  final String tone;
  final bool printed;
  final bool paid;
  final String nowTitle;
  final String nowText;
  final List<CabinetOrderSteps> steps;
  final String? stepOf;
  final String trackingLabel;
  final String? trackingNumber;
  final String detailsTitle;
  final List<CabinetOrderFacts> facts;
  final List<PriceLine> lines;
  final String totalLabel;
  final String total;
  final String? quotedNote;
  final CabinetOrderPayment? payment;

  const CabinetOrder({required this.id, required this.number, required this.title, required this.created, required this.bookId, required this.bookTitle, required this.status, required this.statusLabel, required this.tone, required this.printed, required this.paid, required this.nowTitle, required this.nowText, required this.steps, this.stepOf, required this.trackingLabel, this.trackingNumber, required this.detailsTitle, required this.facts, required this.lines, required this.totalLabel, required this.total, this.quotedNote, this.payment});

  factory CabinetOrder.fromJson(Map<String, dynamic> json) => CabinetOrder(id: json['id'] as String, number: (json['number'] as num).toInt(), title: json['title'] as String, created: json['created'] as String, bookId: json['bookId'] as String, bookTitle: json['bookTitle'] as String, status: json['status'] as String, statusLabel: json['statusLabel'] as String, tone: json['tone'] as String, printed: json['printed'] as bool, paid: json['paid'] as bool, nowTitle: json['nowTitle'] as String, nowText: json['nowText'] as String, steps: (json['steps'] as List).map((e) => CabinetOrderSteps.fromJson(e as Map<String, dynamic>)).toList(), stepOf: json['stepOf'] == null ? null : json['stepOf'] as String, trackingLabel: json['trackingLabel'] as String, trackingNumber: json['trackingNumber'] == null ? null : json['trackingNumber'] as String, detailsTitle: json['detailsTitle'] as String, facts: (json['facts'] as List).map((e) => CabinetOrderFacts.fromJson(e as Map<String, dynamic>)).toList(), lines: (json['lines'] as List).map((e) => PriceLine.fromJson(e as Map<String, dynamic>)).toList(), totalLabel: json['totalLabel'] as String, total: json['total'] as String, quotedNote: json['quotedNote'] == null ? null : json['quotedNote'] as String, payment: json['payment'] == null ? null : CabinetOrderPayment.fromJson(json['payment'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'title': title, 'created': created, 'bookId': bookId, 'bookTitle': bookTitle, 'status': status, 'statusLabel': statusLabel, 'tone': tone, 'printed': printed, 'paid': paid, 'nowTitle': nowTitle, 'nowText': nowText, 'steps': steps.map((e) => e.toJson()).toList(), 'stepOf': stepOf, 'trackingLabel': trackingLabel, 'trackingNumber': trackingNumber, 'detailsTitle': detailsTitle, 'facts': facts.map((e) => e.toJson()).toList(), 'lines': lines.map((e) => e.toJson()).toList(), 'totalLabel': totalLabel, 'total': total, 'quotedNote': quotedNote, 'payment': payment == null ? null : payment!.toJson()};
}

class CabinetOrderSteps {
  final String label;
  final String state;

  const CabinetOrderSteps({required this.label, required this.state});

  factory CabinetOrderSteps.fromJson(Map<String, dynamic> json) => CabinetOrderSteps(label: json['label'] as String, state: json['state'] as String);

  Map<String, dynamic> toJson() => {'label': label, 'state': state};
}

class CabinetOrderFacts {
  final String label;
  final String value;

  const CabinetOrderFacts({required this.label, required this.value});

  factory CabinetOrderFacts.fromJson(Map<String, dynamic> json) => CabinetOrderFacts(label: json['label'] as String, value: json['value'] as String);

  Map<String, dynamic> toJson() => {'label': label, 'value': value};
}

class CabinetOrderPayment {
  final String title;
  final String amount;
  final CabinetOrderPaymentKaspi? kaspi;
  final CabinetOrderPaymentManual? manual;
  final String unavailable;
  final CabinetOrderPaymentCancel cancel;

  const CabinetOrderPayment({required this.title, required this.amount, this.kaspi, this.manual, required this.unavailable, required this.cancel});

  factory CabinetOrderPayment.fromJson(Map<String, dynamic> json) => CabinetOrderPayment(title: json['title'] as String, amount: json['amount'] as String, kaspi: json['kaspi'] == null ? null : CabinetOrderPaymentKaspi.fromJson(json['kaspi'] as Map<String, dynamic>), manual: json['manual'] == null ? null : CabinetOrderPaymentManual.fromJson(json['manual'] as Map<String, dynamic>), unavailable: json['unavailable'] as String, cancel: CabinetOrderPaymentCancel.fromJson(json['cancel'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'title': title, 'amount': amount, 'kaspi': kaspi == null ? null : kaspi!.toJson(), 'manual': manual == null ? null : manual!.toJson(), 'unavailable': unavailable, 'cancel': cancel.toJson()};
}

class CabinetOrderPaymentKaspi {
  final String title;
  final String phoneLabel;
  final String invoiceNote;
  final String sendInvoice;
  final String payByQr;
  final String sentSteps;
  final String scanQr;
  final String openKaspi;
  final String waiting;
  final String paid;
  final String failed;
  final String cancelled;
  final String expired;
  final String again;
  final String defaultPhone;
  final KaspiInvoice? current;

  const CabinetOrderPaymentKaspi({required this.title, required this.phoneLabel, required this.invoiceNote, required this.sendInvoice, required this.payByQr, required this.sentSteps, required this.scanQr, required this.openKaspi, required this.waiting, required this.paid, required this.failed, required this.cancelled, required this.expired, required this.again, required this.defaultPhone, this.current});

  factory CabinetOrderPaymentKaspi.fromJson(Map<String, dynamic> json) => CabinetOrderPaymentKaspi(title: json['title'] as String, phoneLabel: json['phoneLabel'] as String, invoiceNote: json['invoiceNote'] as String, sendInvoice: json['sendInvoice'] as String, payByQr: json['payByQr'] as String, sentSteps: json['sentSteps'] as String, scanQr: json['scanQr'] as String, openKaspi: json['openKaspi'] as String, waiting: json['waiting'] as String, paid: json['paid'] as String, failed: json['failed'] as String, cancelled: json['cancelled'] as String, expired: json['expired'] as String, again: json['again'] as String, defaultPhone: json['defaultPhone'] as String, current: json['current'] == null ? null : KaspiInvoice.fromJson(json['current'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'title': title, 'phoneLabel': phoneLabel, 'invoiceNote': invoiceNote, 'sendInvoice': sendInvoice, 'payByQr': payByQr, 'sentSteps': sentSteps, 'scanQr': scanQr, 'openKaspi': openKaspi, 'waiting': waiting, 'paid': paid, 'failed': failed, 'cancelled': cancelled, 'expired': expired, 'again': again, 'defaultPhone': defaultPhone, 'current': current == null ? null : current!.toJson()};
}

class CabinetOrderPaymentManual {
  final String title;
  final List<String> steps;
  final String claim;
  final String? claimed;

  const CabinetOrderPaymentManual({required this.title, required this.steps, required this.claim, this.claimed});

  factory CabinetOrderPaymentManual.fromJson(Map<String, dynamic> json) => CabinetOrderPaymentManual(title: json['title'] as String, steps: (json['steps'] as List).map((e) => e as String).toList(), claim: json['claim'] as String, claimed: json['claimed'] == null ? null : json['claimed'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'steps': steps.map((e) => e).toList(), 'claim': claim, 'claimed': claimed};
}

class CabinetOrderPaymentCancel {
  final String label;
  final String title;
  final String text;
  final String confirm;
  final String keep;

  const CabinetOrderPaymentCancel({required this.label, required this.title, required this.text, required this.confirm, required this.keep});

  factory CabinetOrderPaymentCancel.fromJson(Map<String, dynamic> json) => CabinetOrderPaymentCancel(label: json['label'] as String, title: json['title'] as String, text: json['text'] as String, confirm: json['confirm'] as String, keep: json['keep'] as String);

  Map<String, dynamic> toJson() => {'label': label, 'title': title, 'text': text, 'confirm': confirm, 'keep': keep};
}

class CabinetOrders {
  final String title;
  final String lead;
  final String empty;
  final String emptyText;
  final List<CabinetOrdersOrders> orders;

  const CabinetOrders({required this.title, required this.lead, required this.empty, required this.emptyText, required this.orders});

  factory CabinetOrders.fromJson(Map<String, dynamic> json) => CabinetOrders(title: json['title'] as String, lead: json['lead'] as String, empty: json['empty'] as String, emptyText: json['emptyText'] as String, orders: (json['orders'] as List).map((e) => CabinetOrdersOrders.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'title': title, 'lead': lead, 'empty': empty, 'emptyText': emptyText, 'orders': orders.map((e) => e.toJson()).toList()};
}

class CabinetOrdersOrders {
  final String id;
  final int number;
  final String title;
  final String bookTitle;
  final String bookId;
  final String status;
  final String statusLabel;
  final String tone;
  final String amount;
  final String created;
  final String? pay;

  const CabinetOrdersOrders({required this.id, required this.number, required this.title, required this.bookTitle, required this.bookId, required this.status, required this.statusLabel, required this.tone, required this.amount, required this.created, this.pay});

  factory CabinetOrdersOrders.fromJson(Map<String, dynamic> json) => CabinetOrdersOrders(id: json['id'] as String, number: (json['number'] as num).toInt(), title: json['title'] as String, bookTitle: json['bookTitle'] as String, bookId: json['bookId'] as String, status: json['status'] as String, statusLabel: json['statusLabel'] as String, tone: json['tone'] as String, amount: json['amount'] as String, created: json['created'] as String, pay: json['pay'] == null ? null : json['pay'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'title': title, 'bookTitle': bookTitle, 'bookId': bookId, 'status': status, 'statusLabel': statusLabel, 'tone': tone, 'amount': amount, 'created': created, 'pay': pay};
}

class KaspiPayBody {
  /// invoice | qr
  final String method;
  final String phone;

  const KaspiPayBody({required this.method, required this.phone});

  factory KaspiPayBody.fromJson(Map<String, dynamic> json) => KaspiPayBody(method: json['method'] as String, phone: json['phone'] as String);

  Map<String, dynamic> toJson() => {'method': method, 'phone': phone};
}

class KaspiInvoiceResult {
  final KaspiInvoice invoice;

  const KaspiInvoiceResult({required this.invoice});

  factory KaspiInvoiceResult.fromJson(Map<String, dynamic> json) => KaspiInvoiceResult(invoice: KaspiInvoice.fromJson(json['invoice'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'invoice': invoice.toJson()};
}

class OkResult {
  final bool ok;

  const OkResult({required this.ok});

  factory OkResult.fromJson(Map<String, dynamic> json) => OkResult(ok: json['ok'] as bool);

  Map<String, dynamic> toJson() => {'ok': ok};
}

class Choice {
  final String id;
  final String label;

  const Choice({required this.id, required this.label});

  factory Choice.fromJson(Map<String, dynamic> json) => Choice(id: json['id'] as String, label: json['label'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'label': label};
}

class Done {
  final bool ok;
  final String? message;

  const Done({required this.ok, this.message});

  factory Done.fromJson(Map<String, dynamic> json) => Done(ok: json['ok'] as bool, message: json['message'] == null ? null : json['message'] as String);

  Map<String, dynamic> toJson() => {'ok': ok, 'message': message};
}

class CustomField {
  final String key;
  final String label;
  /// text | number | date | select | checkbox
  final String type;
  final List<String> options;
  final String value;

  const CustomField({required this.key, required this.label, required this.type, required this.options, required this.value});

  factory CustomField.fromJson(Map<String, dynamic> json) => CustomField(key: json['key'] as String, label: json['label'] as String, type: json['type'] as String, options: (json['options'] as List).map((e) => e as String).toList(), value: json['value'] as String);

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'type': type, 'options': options.map((e) => e).toList(), 'value': value};
}

class PlanChoice {
  final String id;
  final String label;
  final int price;

  const PlanChoice({required this.id, required this.label, required this.price});

  factory PlanChoice.fromJson(Map<String, dynamic> json) => PlanChoice(id: json['id'] as String, label: json['label'] as String, price: (json['price'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'label': label, 'price': price};
}

class DealForm {
  final String id;
  final int number;
  final String title;
  final String contactName;
  final String? phone;
  final String? email;
  final List<String> extraPhones;
  final bool canEditContacts;
  final int amount;
  final double? maxDiscountPercent;
  final String source;
  final List<Choice> sources;
  final List<String> tags;
  final List<CustomField> fields;
  final bool canEdit;
  final String? plan;
  final List<PlanChoice> plans;
  final List<String> gifts;
  final List<Choice> giftOptions;
  final bool agreementLocked;

  const DealForm({required this.id, required this.number, required this.title, required this.contactName, this.phone, this.email, required this.extraPhones, required this.canEditContacts, required this.amount, this.maxDiscountPercent, required this.source, required this.sources, required this.tags, required this.fields, required this.canEdit, this.plan, required this.plans, required this.gifts, required this.giftOptions, required this.agreementLocked});

  factory DealForm.fromJson(Map<String, dynamic> json) => DealForm(id: json['id'] as String, number: (json['number'] as num).toInt(), title: json['title'] as String, contactName: json['contactName'] as String, phone: json['phone'] == null ? null : json['phone'] as String, email: json['email'] == null ? null : json['email'] as String, extraPhones: (json['extraPhones'] as List).map((e) => e as String).toList(), canEditContacts: json['canEditContacts'] as bool, amount: (json['amount'] as num).toInt(), maxDiscountPercent: json['maxDiscountPercent'] == null ? null : (json['maxDiscountPercent'] as num).toDouble(), source: json['source'] as String, sources: (json['sources'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), tags: (json['tags'] as List).map((e) => e as String).toList(), fields: (json['fields'] as List).map((e) => CustomField.fromJson(e as Map<String, dynamic>)).toList(), canEdit: json['canEdit'] as bool, plan: json['plan'] == null ? null : json['plan'] as String, plans: (json['plans'] as List).map((e) => PlanChoice.fromJson(e as Map<String, dynamic>)).toList(), gifts: (json['gifts'] as List).map((e) => e as String).toList(), giftOptions: (json['giftOptions'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), agreementLocked: json['agreementLocked'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'title': title, 'contactName': contactName, 'phone': phone, 'email': email, 'extraPhones': extraPhones.map((e) => e).toList(), 'canEditContacts': canEditContacts, 'amount': amount, 'maxDiscountPercent': maxDiscountPercent, 'source': source, 'sources': sources.map((e) => e.toJson()).toList(), 'tags': tags.map((e) => e).toList(), 'fields': fields.map((e) => e.toJson()).toList(), 'canEdit': canEdit, 'plan': plan, 'plans': plans.map((e) => e.toJson()).toList(), 'gifts': gifts.map((e) => e).toList(), 'giftOptions': giftOptions.map((e) => e.toJson()).toList(), 'agreementLocked': agreementLocked};
}

class DealPatch {
  final String? title;
  final String? contactName;
  final String? phone;
  final String? email;
  final List<String>? extraPhones;
  final int? amount;
  final String? source;
  final List<String>? tags;
  final Map<String, dynamic>? fields;

  const DealPatch({this.title, this.contactName, this.phone, this.email, this.extraPhones, this.amount, this.source, this.tags, this.fields});

  factory DealPatch.fromJson(Map<String, dynamic> json) => DealPatch(title: json['title'] == null ? null : json['title'] as String, contactName: json['contactName'] == null ? null : json['contactName'] as String, phone: json['phone'] == null ? null : json['phone'] as String, email: json['email'] == null ? null : json['email'] as String, extraPhones: json['extraPhones'] == null ? null : (json['extraPhones'] as List).map((e) => e as String).toList(), amount: json['amount'] == null ? null : (json['amount'] as num).toInt(), source: json['source'] == null ? null : json['source'] as String, tags: json['tags'] == null ? null : (json['tags'] as List).map((e) => e as String).toList(), fields: json['fields'] == null ? null : json['fields'] as Map<String, dynamic>);

  Map<String, dynamic> toJson() => {if (title != null) 'title': title!, if (contactName != null) 'contactName': contactName!, if (phone != null) 'phone': phone!, if (email != null) 'email': email!, if (extraPhones != null) 'extraPhones': extraPhones!.map((e) => e).toList(), if (amount != null) 'amount': amount!, if (source != null) 'source': source!, if (tags != null) 'tags': tags!.map((e) => e).toList(), if (fields != null) 'fields': fields!};
}

class DealPlanBody {
  final String? plan;

  const DealPlanBody({this.plan});

  factory DealPlanBody.fromJson(Map<String, dynamic> json) => DealPlanBody(plan: json['plan'] == null ? null : json['plan'] as String);

  Map<String, dynamic> toJson() => {'plan': plan};
}

class DealGiftsBody {
  final List<String> gifts;

  const DealGiftsBody({required this.gifts});

  factory DealGiftsBody.fromJson(Map<String, dynamic> json) => DealGiftsBody(gifts: (json['gifts'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'gifts': gifts.map((e) => e).toList()};
}

class ClientForm {
  final String id;
  final String name;
  final String? phone;
  final List<String> extraPhones;
  final bool canEditPhones;
  final List<String> tags;
  final List<CustomField> fields;
  final bool noMarketing;
  final String locale;
  final List<Choice> locales;
  final String? channel;
  final List<Choice> channels;
  final String? managerId;
  final List<Choice> managers;
  final bool canEdit;

  const ClientForm({required this.id, required this.name, this.phone, required this.extraPhones, required this.canEditPhones, required this.tags, required this.fields, required this.noMarketing, required this.locale, required this.locales, this.channel, required this.channels, this.managerId, required this.managers, required this.canEdit});

  factory ClientForm.fromJson(Map<String, dynamic> json) => ClientForm(id: json['id'] as String, name: json['name'] as String, phone: json['phone'] == null ? null : json['phone'] as String, extraPhones: (json['extraPhones'] as List).map((e) => e as String).toList(), canEditPhones: json['canEditPhones'] as bool, tags: (json['tags'] as List).map((e) => e as String).toList(), fields: (json['fields'] as List).map((e) => CustomField.fromJson(e as Map<String, dynamic>)).toList(), noMarketing: json['noMarketing'] as bool, locale: json['locale'] as String, locales: (json['locales'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), channel: json['channel'] == null ? null : json['channel'] as String, channels: (json['channels'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), managerId: json['managerId'] == null ? null : json['managerId'] as String, managers: (json['managers'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), canEdit: json['canEdit'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'phone': phone, 'extraPhones': extraPhones.map((e) => e).toList(), 'canEditPhones': canEditPhones, 'tags': tags.map((e) => e).toList(), 'fields': fields.map((e) => e.toJson()).toList(), 'noMarketing': noMarketing, 'locale': locale, 'locales': locales.map((e) => e.toJson()).toList(), 'channel': channel, 'channels': channels.map((e) => e.toJson()).toList(), 'managerId': managerId, 'managers': managers.map((e) => e.toJson()).toList(), 'canEdit': canEdit};
}

class ClientPatch {
  final List<String>? extraPhones;
  final List<String>? tags;
  final Map<String, dynamic>? fields;
  final bool? noMarketing;
  final String? locale;
  final String? channel;
  final String? managerId;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const ClientPatch({this.extraPhones, this.tags, this.fields, this.noMarketing, this.locale, this.channel, this.managerId, this.nulls = const {}});

  factory ClientPatch.fromJson(Map<String, dynamic> json) => ClientPatch(extraPhones: json['extraPhones'] == null ? null : (json['extraPhones'] as List).map((e) => e as String).toList(), tags: json['tags'] == null ? null : (json['tags'] as List).map((e) => e as String).toList(), fields: json['fields'] == null ? null : json['fields'] as Map<String, dynamic>, noMarketing: json['noMarketing'] == null ? null : json['noMarketing'] as bool, locale: json['locale'] == null ? null : json['locale'] as String, channel: json['channel'] == null ? null : json['channel'] as String, managerId: json['managerId'] == null ? null : json['managerId'] as String);

  Map<String, dynamic> toJson() => {if (extraPhones != null) 'extraPhones': extraPhones!.map((e) => e).toList(), if (tags != null) 'tags': tags!.map((e) => e).toList(), if (fields != null) 'fields': fields!, if (noMarketing != null) 'noMarketing': noMarketing!, if (locale != null) 'locale': locale!, if (channel != null) 'channel': channel!, if (managerId != null || nulls.contains('managerId')) 'managerId': managerId};
}

class ChatBotBody {
  final bool run;

  const ChatBotBody({required this.run});

  factory ChatBotBody.fromJson(Map<String, dynamic> json) => ChatBotBody(run: json['run'] as bool);

  Map<String, dynamic> toJson() => {'run': run};
}

class OrderPayment {
  final String id;
  final String kind;
  final int amount;
  final String method;
  final String at;
  final String? note;
  final bool receipt;
  final String? payForm;
  final String? by;
  final String? reviewed;
  final String? voidReason;
  final bool voided;

  const OrderPayment({required this.id, required this.kind, required this.amount, required this.method, required this.at, this.note, required this.receipt, this.payForm, this.by, this.reviewed, this.voidReason, required this.voided});

  factory OrderPayment.fromJson(Map<String, dynamic> json) => OrderPayment(id: json['id'] as String, kind: json['kind'] as String, amount: (json['amount'] as num).toInt(), method: json['method'] as String, at: json['at'] as String, note: json['note'] == null ? null : json['note'] as String, receipt: json['receipt'] as bool, payForm: json['payForm'] == null ? null : json['payForm'] as String, by: json['by'] == null ? null : json['by'] as String, reviewed: json['reviewed'] == null ? null : json['reviewed'] as String, voidReason: json['voidReason'] == null ? null : json['voidReason'] as String, voided: json['voided'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'kind': kind, 'amount': amount, 'method': method, 'at': at, 'note': note, 'receipt': receipt, 'payForm': payForm, 'by': by, 'reviewed': reviewed, 'voidReason': voidReason, 'voided': voided};
}

class OrderMoney {
  final String id;
  final int number;
  final String status;
  final String statusLabel;
  final List<Choice> statuses;
  final bool printed;
  final String? trackingNumber;
  final int amount;
  final int received;
  final int refundable;
  final bool settled;
  final bool postpay;
  final bool cancelled;
  final List<OrderPayment> payments;
  final List<String> payForms;
  final String plan;
  final List<PlanChoice> plans;
  final int? agreed;
  final double? maxDiscountPercent;
  final bool canEdit;
  final bool canVoid;
  final bool canReview;
  final bool canTerms;
  final bool canRequestReprice;

  const OrderMoney({required this.id, required this.number, required this.status, required this.statusLabel, required this.statuses, required this.printed, this.trackingNumber, required this.amount, required this.received, required this.refundable, required this.settled, required this.postpay, required this.cancelled, required this.payments, required this.payForms, required this.plan, required this.plans, this.agreed, this.maxDiscountPercent, required this.canEdit, required this.canVoid, required this.canReview, required this.canTerms, required this.canRequestReprice});

  factory OrderMoney.fromJson(Map<String, dynamic> json) => OrderMoney(id: json['id'] as String, number: (json['number'] as num).toInt(), status: json['status'] as String, statusLabel: json['statusLabel'] as String, statuses: (json['statuses'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), printed: json['printed'] as bool, trackingNumber: json['trackingNumber'] == null ? null : json['trackingNumber'] as String, amount: (json['amount'] as num).toInt(), received: (json['received'] as num).toInt(), refundable: (json['refundable'] as num).toInt(), settled: json['settled'] as bool, postpay: json['postpay'] as bool, cancelled: json['cancelled'] as bool, payments: (json['payments'] as List).map((e) => OrderPayment.fromJson(e as Map<String, dynamic>)).toList(), payForms: (json['payForms'] as List).map((e) => e as String).toList(), plan: json['plan'] as String, plans: (json['plans'] as List).map((e) => PlanChoice.fromJson(e as Map<String, dynamic>)).toList(), agreed: json['agreed'] == null ? null : (json['agreed'] as num).toInt(), maxDiscountPercent: json['maxDiscountPercent'] == null ? null : (json['maxDiscountPercent'] as num).toDouble(), canEdit: json['canEdit'] as bool, canVoid: json['canVoid'] as bool, canReview: json['canReview'] as bool, canTerms: json['canTerms'] as bool, canRequestReprice: json['canRequestReprice'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'status': status, 'statusLabel': statusLabel, 'statuses': statuses.map((e) => e.toJson()).toList(), 'printed': printed, 'trackingNumber': trackingNumber, 'amount': amount, 'received': received, 'refundable': refundable, 'settled': settled, 'postpay': postpay, 'cancelled': cancelled, 'payments': payments.map((e) => e.toJson()).toList(), 'payForms': payForms.map((e) => e).toList(), 'plan': plan, 'plans': plans.map((e) => e.toJson()).toList(), 'agreed': agreed, 'maxDiscountPercent': maxDiscountPercent, 'canEdit': canEdit, 'canVoid': canVoid, 'canReview': canReview, 'canTerms': canTerms, 'canRequestReprice': canRequestReprice};
}

class ReasonBody {
  final String reason;

  const ReasonBody({required this.reason});

  factory ReasonBody.fromJson(Map<String, dynamic> json) => ReasonBody(reason: json['reason'] as String);

  Map<String, dynamic> toJson() => {'reason': reason};
}

class OrderTermsBody {
  final String plan;
  final int? agreedTotal;
  final String? reason;

  const OrderTermsBody({required this.plan, this.agreedTotal, this.reason});

  factory OrderTermsBody.fromJson(Map<String, dynamic> json) => OrderTermsBody(plan: json['plan'] as String, agreedTotal: json['agreedTotal'] == null ? null : (json['agreedTotal'] as num).toInt(), reason: json['reason'] == null ? null : json['reason'] as String);

  Map<String, dynamic> toJson() => {'plan': plan, 'agreedTotal': agreedTotal, if (reason != null) 'reason': reason!};
}

class RepriceRequestBody {
  final int price;
  final String reason;

  const RepriceRequestBody({required this.price, required this.reason});

  factory RepriceRequestBody.fromJson(Map<String, dynamic> json) => RepriceRequestBody(price: (json['price'] as num).toInt(), reason: json['reason'] as String);

  Map<String, dynamic> toJson() => {'price': price, 'reason': reason};
}

class OrderDeliveryBody {
  final String status;
  final String? trackingNumber;
  final String? note;

  const OrderDeliveryBody({required this.status, this.trackingNumber, this.note});

  factory OrderDeliveryBody.fromJson(Map<String, dynamic> json) => OrderDeliveryBody(status: json['status'] as String, trackingNumber: json['trackingNumber'] == null ? null : json['trackingNumber'] as String, note: json['note'] == null ? null : json['note'] as String);

  Map<String, dynamic> toJson() => {'status': status, if (trackingNumber != null) 'trackingNumber': trackingNumber!, if (note != null) 'note': note!};
}

class NewClientOptions {
  final List<Choice> channels;
  final List<Choice> locales;
  final List<PlanChoice> plans;
  final List<String> payForms;
  final List<Choice> stages;
  final String? defaultStageId;
  final List<Choice> managers;
  final String me;
  final bool canAssign;
  final bool canDeal;
  final double? maxDiscountPercent;

  const NewClientOptions({required this.channels, required this.locales, required this.plans, required this.payForms, required this.stages, this.defaultStageId, required this.managers, required this.me, required this.canAssign, required this.canDeal, this.maxDiscountPercent});

  factory NewClientOptions.fromJson(Map<String, dynamic> json) => NewClientOptions(channels: (json['channels'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), locales: (json['locales'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), plans: (json['plans'] as List).map((e) => PlanChoice.fromJson(e as Map<String, dynamic>)).toList(), payForms: (json['payForms'] as List).map((e) => e as String).toList(), stages: (json['stages'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), defaultStageId: json['defaultStageId'] == null ? null : json['defaultStageId'] as String, managers: (json['managers'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), me: json['me'] as String, canAssign: json['canAssign'] as bool, canDeal: json['canDeal'] as bool, maxDiscountPercent: json['maxDiscountPercent'] == null ? null : (json['maxDiscountPercent'] as num).toDouble());

  Map<String, dynamic> toJson() => {'channels': channels.map((e) => e.toJson()).toList(), 'locales': locales.map((e) => e.toJson()).toList(), 'plans': plans.map((e) => e.toJson()).toList(), 'payForms': payForms.map((e) => e).toList(), 'stages': stages.map((e) => e.toJson()).toList(), 'defaultStageId': defaultStageId, 'managers': managers.map((e) => e.toJson()).toList(), 'me': me, 'canAssign': canAssign, 'canDeal': canDeal, 'maxDiscountPercent': maxDiscountPercent};
}

class NewClientDeal {
  final String? recipient;
  final String? deadline;
  final String plan;
  final int count;
  final int agreed;
  final int prepaid;
  final String? payForm;
  final String? stageId;
  final String? assigneeId;
  final String? comment;
  final List<String>? gifts;

  const NewClientDeal({this.recipient, this.deadline, required this.plan, required this.count, required this.agreed, required this.prepaid, this.payForm, this.stageId, this.assigneeId, this.comment, this.gifts});

  factory NewClientDeal.fromJson(Map<String, dynamic> json) => NewClientDeal(recipient: json['recipient'] == null ? null : json['recipient'] as String, deadline: json['deadline'] == null ? null : json['deadline'] as String, plan: json['plan'] as String, count: (json['count'] as num).toInt(), agreed: (json['agreed'] as num).toInt(), prepaid: (json['prepaid'] as num).toInt(), payForm: json['payForm'] == null ? null : json['payForm'] as String, stageId: json['stageId'] == null ? null : json['stageId'] as String, assigneeId: json['assigneeId'] == null ? null : json['assigneeId'] as String, comment: json['comment'] == null ? null : json['comment'] as String, gifts: json['gifts'] == null ? null : (json['gifts'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {if (recipient != null) 'recipient': recipient!, if (deadline != null) 'deadline': deadline!, 'plan': plan, 'count': count, 'agreed': agreed, 'prepaid': prepaid, if (payForm != null) 'payForm': payForm!, if (stageId != null) 'stageId': stageId!, if (assigneeId != null) 'assigneeId': assigneeId!, if (comment != null) 'comment': comment!, if (gifts != null) 'gifts': gifts!.map((e) => e).toList()};
}

class NewClientBody {
  final String name;
  final String phone;
  final String? email;
  final String? city;
  final String channel;
  final String? locale;
  final String? password;
  final NewClientDeal? deal;

  const NewClientBody({required this.name, required this.phone, this.email, this.city, required this.channel, this.locale, this.password, this.deal});

  factory NewClientBody.fromJson(Map<String, dynamic> json) => NewClientBody(name: json['name'] as String, phone: json['phone'] as String, email: json['email'] == null ? null : json['email'] as String, city: json['city'] == null ? null : json['city'] as String, channel: json['channel'] as String, locale: json['locale'] == null ? null : json['locale'] as String, password: json['password'] == null ? null : json['password'] as String, deal: json['deal'] == null ? null : NewClientDeal.fromJson(json['deal'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'name': name, 'phone': phone, if (email != null) 'email': email!, if (city != null) 'city': city!, 'channel': channel, if (locale != null) 'locale': locale!, if (password != null) 'password': password!, if (deal != null) 'deal': deal!.toJson()};
}

class DealPartOut {
  final String dealId;
  final int dealNumber;
  final int agreed;
  final int prepaid;
  final String? paymentId;

  const DealPartOut({required this.dealId, required this.dealNumber, required this.agreed, required this.prepaid, this.paymentId});

  factory DealPartOut.fromJson(Map<String, dynamic> json) => DealPartOut(dealId: json['dealId'] as String, dealNumber: (json['dealNumber'] as num).toInt(), agreed: (json['agreed'] as num).toInt(), prepaid: (json['prepaid'] as num).toInt(), paymentId: json['paymentId'] == null ? null : json['paymentId'] as String);

  Map<String, dynamic> toJson() => {'dealId': dealId, 'dealNumber': dealNumber, 'agreed': agreed, 'prepaid': prepaid, 'paymentId': paymentId};
}

class NewClientResult {
  final String clientId;
  final String clientName;
  final String? dealId;
  final int? dealNumber;
  final List<DealPartOut> parts;
  final int count;
  final String loginText;
  final String password;
  final String loginUrl;
  final String message;
  final int agreed;
  final int prepaid;
  final int remainder;
  final int tasks;

  const NewClientResult({required this.clientId, required this.clientName, this.dealId, this.dealNumber, required this.parts, required this.count, required this.loginText, required this.password, required this.loginUrl, required this.message, required this.agreed, required this.prepaid, required this.remainder, required this.tasks});

  factory NewClientResult.fromJson(Map<String, dynamic> json) => NewClientResult(clientId: json['clientId'] as String, clientName: json['clientName'] as String, dealId: json['dealId'] == null ? null : json['dealId'] as String, dealNumber: json['dealNumber'] == null ? null : (json['dealNumber'] as num).toInt(), parts: (json['parts'] as List).map((e) => DealPartOut.fromJson(e as Map<String, dynamic>)).toList(), count: (json['count'] as num).toInt(), loginText: json['loginText'] as String, password: json['password'] as String, loginUrl: json['loginUrl'] as String, message: json['message'] as String, agreed: (json['agreed'] as num).toInt(), prepaid: (json['prepaid'] as num).toInt(), remainder: (json['remainder'] as num).toInt(), tasks: (json['tasks'] as num).toInt());

  Map<String, dynamic> toJson() => {'clientId': clientId, 'clientName': clientName, 'dealId': dealId, 'dealNumber': dealNumber, 'parts': parts.map((e) => e.toJson()).toList(), 'count': count, 'loginText': loginText, 'password': password, 'loginUrl': loginUrl, 'message': message, 'agreed': agreed, 'prepaid': prepaid, 'remainder': remainder, 'tasks': tasks};
}

class OrderFileLink {
  final String kind;
  final String label;
  final String url;

  const OrderFileLink({required this.kind, required this.label, required this.url});

  factory OrderFileLink.fromJson(Map<String, dynamic> json) => OrderFileLink(kind: json['kind'] as String, label: json['label'] as String, url: json['url'] as String);

  Map<String, dynamic> toJson() => {'kind': kind, 'label': label, 'url': url};
}

class OrderFiles {
  final bool canFiles;
  final OrderFilesSpec? spec;
  final List<OrderFileLink> files;
  final String? packageUrl;
  final String progressUrl;
  final bool bookLocked;
  final bool canLock;
  final bool canRegenerate;

  const OrderFiles({required this.canFiles, this.spec, required this.files, this.packageUrl, required this.progressUrl, required this.bookLocked, required this.canLock, required this.canRegenerate});

  factory OrderFiles.fromJson(Map<String, dynamic> json) => OrderFiles(canFiles: json['canFiles'] as bool, spec: json['spec'] == null ? null : OrderFilesSpec.fromJson(json['spec'] as Map<String, dynamic>), files: (json['files'] as List).map((e) => OrderFileLink.fromJson(e as Map<String, dynamic>)).toList(), packageUrl: json['packageUrl'] == null ? null : json['packageUrl'] as String, progressUrl: json['progressUrl'] as String, bookLocked: json['bookLocked'] as bool, canLock: json['canLock'] as bool, canRegenerate: json['canRegenerate'] as bool);

  Map<String, dynamic> toJson() => {'canFiles': canFiles, 'spec': spec == null ? null : spec!.toJson(), 'files': files.map((e) => e.toJson()).toList(), 'packageUrl': packageUrl, 'progressUrl': progressUrl, 'bookLocked': bookLocked, 'canLock': canLock, 'canRegenerate': canRegenerate};
}

class OrderFilesSpec {
  final String format;
  final int pages;
  final double spineMm;
  final double coverWidthMm;
  final double coverHeightMm;
  final String generatedAt;

  const OrderFilesSpec({required this.format, required this.pages, required this.spineMm, required this.coverWidthMm, required this.coverHeightMm, required this.generatedAt});

  factory OrderFilesSpec.fromJson(Map<String, dynamic> json) => OrderFilesSpec(format: json['format'] as String, pages: (json['pages'] as num).toInt(), spineMm: (json['spineMm'] as num).toDouble(), coverWidthMm: (json['coverWidthMm'] as num).toDouble(), coverHeightMm: (json['coverHeightMm'] as num).toDouble(), generatedAt: json['generatedAt'] as String);

  Map<String, dynamic> toJson() => {'format': format, 'pages': pages, 'spineMm': spineMm, 'coverWidthMm': coverWidthMm, 'coverHeightMm': coverHeightMm, 'generatedAt': generatedAt};
}

class OrderDetailsForm {
  final bool canEdit;
  final String contactName;
  final String contactPhone;
  final String contactEmail;
  final String? deliveryMethod;
  final List<Choice> deliveryMethods;
  final String? country;
  final String? city;
  final String? address;
  final String? postalCode;
  final String? desiredDate;
  final String? giftNote;

  const OrderDetailsForm({required this.canEdit, required this.contactName, required this.contactPhone, required this.contactEmail, this.deliveryMethod, required this.deliveryMethods, this.country, this.city, this.address, this.postalCode, this.desiredDate, this.giftNote});

  factory OrderDetailsForm.fromJson(Map<String, dynamic> json) => OrderDetailsForm(canEdit: json['canEdit'] as bool, contactName: json['contactName'] as String, contactPhone: json['contactPhone'] as String, contactEmail: json['contactEmail'] as String, deliveryMethod: json['deliveryMethod'] == null ? null : json['deliveryMethod'] as String, deliveryMethods: (json['deliveryMethods'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), country: json['country'] == null ? null : json['country'] as String, city: json['city'] == null ? null : json['city'] as String, address: json['address'] == null ? null : json['address'] as String, postalCode: json['postalCode'] == null ? null : json['postalCode'] as String, desiredDate: json['desiredDate'] == null ? null : json['desiredDate'] as String, giftNote: json['giftNote'] == null ? null : json['giftNote'] as String);

  Map<String, dynamic> toJson() => {'canEdit': canEdit, 'contactName': contactName, 'contactPhone': contactPhone, 'contactEmail': contactEmail, 'deliveryMethod': deliveryMethod, 'deliveryMethods': deliveryMethods.map((e) => e.toJson()).toList(), 'country': country, 'city': city, 'address': address, 'postalCode': postalCode, 'desiredDate': desiredDate, 'giftNote': giftNote};
}

class OrderDetailsBody {
  final String contactName;
  final String contactPhone;
  final String contactEmail;
  final String? deliveryMethod;
  final String? country;
  final String? city;
  final String? address;
  final String? postalCode;
  final String? desiredDate;
  final String? giftNote;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const OrderDetailsBody({required this.contactName, required this.contactPhone, required this.contactEmail, this.deliveryMethod, this.country, this.city, this.address, this.postalCode, this.desiredDate, this.giftNote, this.nulls = const {}});

  factory OrderDetailsBody.fromJson(Map<String, dynamic> json) => OrderDetailsBody(contactName: json['contactName'] as String, contactPhone: json['contactPhone'] as String, contactEmail: json['contactEmail'] as String, deliveryMethod: json['deliveryMethod'] == null ? null : json['deliveryMethod'] as String, country: json['country'] == null ? null : json['country'] as String, city: json['city'] == null ? null : json['city'] as String, address: json['address'] == null ? null : json['address'] as String, postalCode: json['postalCode'] == null ? null : json['postalCode'] as String, desiredDate: json['desiredDate'] == null ? null : json['desiredDate'] as String, giftNote: json['giftNote'] == null ? null : json['giftNote'] as String);

  Map<String, dynamic> toJson() => {'contactName': contactName, 'contactPhone': contactPhone, 'contactEmail': contactEmail, if (deliveryMethod != null || nulls.contains('deliveryMethod')) 'deliveryMethod': deliveryMethod, if (country != null || nulls.contains('country')) 'country': country, if (city != null || nulls.contains('city')) 'city': city, if (address != null || nulls.contains('address')) 'address': address, if (postalCode != null || nulls.contains('postalCode')) 'postalCode': postalCode, if (desiredDate != null || nulls.contains('desiredDate')) 'desiredDate': desiredDate, if (giftNote != null || nulls.contains('giftNote')) 'giftNote': giftNote};
}

class OrderLinks {
  final String? clientId;
  final String? dealId;
  final int? dealNumber;
  final String? chatId;
  final String bookId;
  final String adminNote;
  final bool canNote;
  final String? printUrl;

  const OrderLinks({this.clientId, this.dealId, this.dealNumber, this.chatId, required this.bookId, required this.adminNote, required this.canNote, this.printUrl});

  factory OrderLinks.fromJson(Map<String, dynamic> json) => OrderLinks(clientId: json['clientId'] == null ? null : json['clientId'] as String, dealId: json['dealId'] == null ? null : json['dealId'] as String, dealNumber: json['dealNumber'] == null ? null : (json['dealNumber'] as num).toInt(), chatId: json['chatId'] == null ? null : json['chatId'] as String, bookId: json['bookId'] as String, adminNote: json['adminNote'] as String, canNote: json['canNote'] as bool, printUrl: json['printUrl'] == null ? null : json['printUrl'] as String);

  Map<String, dynamic> toJson() => {'clientId': clientId, 'dealId': dealId, 'dealNumber': dealNumber, 'chatId': chatId, 'bookId': bookId, 'adminNote': adminNote, 'canNote': canNote, 'printUrl': printUrl};
}

class OrderNoteBody {
  final String note;

  const OrderNoteBody({required this.note});

  factory OrderNoteBody.fromJson(Map<String, dynamic> json) => OrderNoteBody(note: json['note'] as String);

  Map<String, dynamic> toJson() => {'note': note};
}

class BookLockBody {
  final bool locked;

  const BookLockBody({required this.locked});

  factory BookLockBody.fromJson(Map<String, dynamic> json) => BookLockBody(locked: json['locked'] as bool);

  Map<String, dynamic> toJson() => {'locked': locked};
}

class SupportRow {
  final String id;
  final int number;
  final String status;
  final String statusLabel;
  final String kindLabel;
  final bool urgent;
  final String text;
  final String reporter;
  final int attachments;
  final String createdAt;

  const SupportRow({required this.id, required this.number, required this.status, required this.statusLabel, required this.kindLabel, required this.urgent, required this.text, required this.reporter, required this.attachments, required this.createdAt});

  factory SupportRow.fromJson(Map<String, dynamic> json) => SupportRow(id: json['id'] as String, number: (json['number'] as num).toInt(), status: json['status'] as String, statusLabel: json['statusLabel'] as String, kindLabel: json['kindLabel'] as String, urgent: json['urgent'] as bool, text: json['text'] as String, reporter: json['reporter'] as String, attachments: (json['attachments'] as num).toInt(), createdAt: json['createdAt'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'status': status, 'statusLabel': statusLabel, 'kindLabel': kindLabel, 'urgent': urgent, 'text': text, 'reporter': reporter, 'attachments': attachments, 'createdAt': createdAt};
}

class SupportList {
  final List<SupportRow> tickets;
  final Map<String, dynamic> counts;
  final List<Choice> statuses;
  final bool canManage;

  const SupportList({required this.tickets, required this.counts, required this.statuses, required this.canManage});

  factory SupportList.fromJson(Map<String, dynamic> json) => SupportList(tickets: (json['tickets'] as List).map((e) => SupportRow.fromJson(e as Map<String, dynamic>)).toList(), counts: json['counts'] as Map<String, dynamic>, statuses: (json['statuses'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), canManage: json['canManage'] as bool);

  Map<String, dynamic> toJson() => {'tickets': tickets.map((e) => e.toJson()).toList(), 'counts': counts, 'statuses': statuses.map((e) => e.toJson()).toList(), 'canManage': canManage};
}

class SupportFile {
  final String id;
  final String name;
  final String kind;
  final int size;
  final String url;
  final String? transcript;
  final String? transcriptError;

  const SupportFile({required this.id, required this.name, required this.kind, required this.size, required this.url, this.transcript, this.transcriptError});

  factory SupportFile.fromJson(Map<String, dynamic> json) => SupportFile(id: json['id'] as String, name: json['name'] as String, kind: json['kind'] as String, size: (json['size'] as num).toInt(), url: json['url'] as String, transcript: json['transcript'] == null ? null : json['transcript'] as String, transcriptError: json['transcriptError'] == null ? null : json['transcriptError'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'kind': kind, 'size': size, 'url': url, 'transcript': transcript, 'transcriptError': transcriptError};
}

class SupportTicketView {
  final String id;
  final int number;
  final String status;
  final String statusLabel;
  final List<Choice> statuses;
  final String kindLabel;
  final bool urgent;
  final String summary;
  final String description;
  final String place;
  final String expected;
  final String reporter;
  final String createdAt;
  final List<SupportFile> files;
  final String? chatId;
  final List<SupportTicketViewChat> chat;
  final String resolution;
  final String devNote;
  final List<SupportTicketViewCommits> commits;
  final List<SupportTicketViewHistory> history;
  final String? notifiedAt;
  final String? notifyError;
  final bool canManage;

  const SupportTicketView({required this.id, required this.number, required this.status, required this.statusLabel, required this.statuses, required this.kindLabel, required this.urgent, required this.summary, required this.description, required this.place, required this.expected, required this.reporter, required this.createdAt, required this.files, this.chatId, required this.chat, required this.resolution, required this.devNote, required this.commits, required this.history, this.notifiedAt, this.notifyError, required this.canManage});

  factory SupportTicketView.fromJson(Map<String, dynamic> json) => SupportTicketView(id: json['id'] as String, number: (json['number'] as num).toInt(), status: json['status'] as String, statusLabel: json['statusLabel'] as String, statuses: (json['statuses'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), kindLabel: json['kindLabel'] as String, urgent: json['urgent'] as bool, summary: json['summary'] as String, description: json['description'] as String, place: json['place'] as String, expected: json['expected'] as String, reporter: json['reporter'] as String, createdAt: json['createdAt'] as String, files: (json['files'] as List).map((e) => SupportFile.fromJson(e as Map<String, dynamic>)).toList(), chatId: json['chatId'] == null ? null : json['chatId'] as String, chat: (json['chat'] as List).map((e) => SupportTicketViewChat.fromJson(e as Map<String, dynamic>)).toList(), resolution: json['resolution'] as String, devNote: json['devNote'] as String, commits: (json['commits'] as List).map((e) => SupportTicketViewCommits.fromJson(e as Map<String, dynamic>)).toList(), history: (json['history'] as List).map((e) => SupportTicketViewHistory.fromJson(e as Map<String, dynamic>)).toList(), notifiedAt: json['notifiedAt'] == null ? null : json['notifiedAt'] as String, notifyError: json['notifyError'] == null ? null : json['notifyError'] as String, canManage: json['canManage'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'status': status, 'statusLabel': statusLabel, 'statuses': statuses.map((e) => e.toJson()).toList(), 'kindLabel': kindLabel, 'urgent': urgent, 'summary': summary, 'description': description, 'place': place, 'expected': expected, 'reporter': reporter, 'createdAt': createdAt, 'files': files.map((e) => e.toJson()).toList(), 'chatId': chatId, 'chat': chat.map((e) => e.toJson()).toList(), 'resolution': resolution, 'devNote': devNote, 'commits': commits.map((e) => e.toJson()).toList(), 'history': history.map((e) => e.toJson()).toList(), 'notifiedAt': notifiedAt, 'notifyError': notifyError, 'canManage': canManage};
}

class SupportTicketViewChat {
  final String id;
  final bool inbound;
  final String text;
  final String at;

  const SupportTicketViewChat({required this.id, required this.inbound, required this.text, required this.at});

  factory SupportTicketViewChat.fromJson(Map<String, dynamic> json) => SupportTicketViewChat(id: json['id'] as String, inbound: json['inbound'] as bool, text: json['text'] as String, at: json['at'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'inbound': inbound, 'text': text, 'at': at};
}

class SupportTicketViewCommits {
  final String sha;
  final String subject;
  final String at;

  const SupportTicketViewCommits({required this.sha, required this.subject, required this.at});

  factory SupportTicketViewCommits.fromJson(Map<String, dynamic> json) => SupportTicketViewCommits(sha: json['sha'] as String, subject: json['subject'] as String, at: json['at'] as String);

  Map<String, dynamic> toJson() => {'sha': sha, 'subject': subject, 'at': at};
}

class SupportTicketViewHistory {
  final String at;
  final String by;
  final String text;

  const SupportTicketViewHistory({required this.at, required this.by, required this.text});

  factory SupportTicketViewHistory.fromJson(Map<String, dynamic> json) => SupportTicketViewHistory(at: json['at'] as String, by: json['by'] as String, text: json['text'] as String);

  Map<String, dynamic> toJson() => {'at': at, 'by': by, 'text': text};
}

class SupportUpdateBody {
  final String status;
  final String resolution;
  final String devNote;
  final bool notify;

  const SupportUpdateBody({required this.status, required this.resolution, required this.devNote, required this.notify});

  factory SupportUpdateBody.fromJson(Map<String, dynamic> json) => SupportUpdateBody(status: json['status'] as String, resolution: json['resolution'] as String, devNote: json['devNote'] as String, notify: json['notify'] as bool);

  Map<String, dynamic> toJson() => {'status': status, 'resolution': resolution, 'devNote': devNote, 'notify': notify};
}

class DealLinkRow {
  final String id;
  final int number;
  final String title;
  final String stage;
  final int amount;
  final String dateLabel;

  const DealLinkRow({required this.id, required this.number, required this.title, required this.stage, required this.amount, required this.dateLabel});

  factory DealLinkRow.fromJson(Map<String, dynamic> json) => DealLinkRow(id: json['id'] as String, number: (json['number'] as num).toInt(), title: json['title'] as String, stage: json['stage'] as String, amount: (json['amount'] as num).toInt(), dateLabel: json['dateLabel'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'title': title, 'stage': stage, 'amount': amount, 'dateLabel': dateLabel};
}

class DealExtras {
  final String? clientId;
  final DealExtrasSuggested? suggested;
  final bool canCreateClient;
  final bool canLink;
  final List<Choice> channels;
  final List<DealLinkRow> duplicates;
  final bool canMerge;
  final List<DealLinkRow> past;
  final List<Choice> pipelines;
  final String pipelineId;
  final bool canMovePipeline;
  final bool canDelete;

  const DealExtras({this.clientId, this.suggested, required this.canCreateClient, required this.canLink, required this.channels, required this.duplicates, required this.canMerge, required this.past, required this.pipelines, required this.pipelineId, required this.canMovePipeline, required this.canDelete});

  factory DealExtras.fromJson(Map<String, dynamic> json) => DealExtras(clientId: json['clientId'] == null ? null : json['clientId'] as String, suggested: json['suggested'] == null ? null : DealExtrasSuggested.fromJson(json['suggested'] as Map<String, dynamic>), canCreateClient: json['canCreateClient'] as bool, canLink: json['canLink'] as bool, channels: (json['channels'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), duplicates: (json['duplicates'] as List).map((e) => DealLinkRow.fromJson(e as Map<String, dynamic>)).toList(), canMerge: json['canMerge'] as bool, past: (json['past'] as List).map((e) => DealLinkRow.fromJson(e as Map<String, dynamic>)).toList(), pipelines: (json['pipelines'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), pipelineId: json['pipelineId'] as String, canMovePipeline: json['canMovePipeline'] as bool, canDelete: json['canDelete'] as bool);

  Map<String, dynamic> toJson() => {'clientId': clientId, 'suggested': suggested == null ? null : suggested!.toJson(), 'canCreateClient': canCreateClient, 'canLink': canLink, 'channels': channels.map((e) => e.toJson()).toList(), 'duplicates': duplicates.map((e) => e.toJson()).toList(), 'canMerge': canMerge, 'past': past.map((e) => e.toJson()).toList(), 'pipelines': pipelines.map((e) => e.toJson()).toList(), 'pipelineId': pipelineId, 'canMovePipeline': canMovePipeline, 'canDelete': canDelete};
}

class DealExtrasSuggested {
  final String id;
  final String name;

  const DealExtrasSuggested({required this.id, required this.name});

  factory DealExtrasSuggested.fromJson(Map<String, dynamic> json) => DealExtrasSuggested(id: json['id'] as String, name: json['name'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

class DealClientBody {
  final String name;
  final String email;
  /// ru | kk | en
  final String locale;
  final String channel;

  const DealClientBody({required this.name, required this.email, required this.locale, required this.channel});

  factory DealClientBody.fromJson(Map<String, dynamic> json) => DealClientBody(name: json['name'] as String, email: json['email'] as String, locale: json['locale'] as String, channel: json['channel'] as String);

  Map<String, dynamic> toJson() => {'name': name, 'email': email, 'locale': locale, 'channel': channel};
}

class DealClientCreated {
  final String clientId;
  final String login;
  final String password;
  final String message;

  const DealClientCreated({required this.clientId, required this.login, required this.password, required this.message});

  factory DealClientCreated.fromJson(Map<String, dynamic> json) => DealClientCreated(clientId: json['clientId'] as String, login: json['login'] as String, password: json['password'] as String, message: json['message'] as String);

  Map<String, dynamic> toJson() => {'clientId': clientId, 'login': login, 'password': password, 'message': message};
}

class DealLinkBody {
  final String? clientId;

  const DealLinkBody({this.clientId});

  factory DealLinkBody.fromJson(Map<String, dynamic> json) => DealLinkBody(clientId: json['clientId'] == null ? null : json['clientId'] as String);

  Map<String, dynamic> toJson() => {'clientId': clientId};
}

class DealMergeBody {
  final String sourceId;

  const DealMergeBody({required this.sourceId});

  factory DealMergeBody.fromJson(Map<String, dynamic> json) => DealMergeBody(sourceId: json['sourceId'] as String);

  Map<String, dynamic> toJson() => {'sourceId': sourceId};
}

class DealPipelineBody {
  final String pipelineId;

  const DealPipelineBody({required this.pipelineId});

  factory DealPipelineBody.fromJson(Map<String, dynamic> json) => DealPipelineBody(pipelineId: json['pipelineId'] as String);

  Map<String, dynamic> toJson() => {'pipelineId': pipelineId};
}

class ClientAccess {
  final String login;
  final String password;
  final String message;

  const ClientAccess({required this.login, required this.password, required this.message});

  factory ClientAccess.fromJson(Map<String, dynamic> json) => ClientAccess(login: json['login'] as String, password: json['password'] as String, message: json['message'] as String);

  Map<String, dynamic> toJson() => {'login': login, 'password': password, 'message': message};
}

class MoneyPeriod {
  /// today | 7d | month | prev | custom
  final String preset;
  final String label;
  final String first;
  final String last;
  final List<Choice> presets;

  const MoneyPeriod({required this.preset, required this.label, required this.first, required this.last, required this.presets});

  factory MoneyPeriod.fromJson(Map<String, dynamic> json) => MoneyPeriod(preset: json['preset'] as String, label: json['label'] as String, first: json['first'] as String, last: json['last'] as String, presets: (json['presets'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'preset': preset, 'label': label, 'first': first, 'last': last, 'presets': presets.map((e) => e.toJson()).toList()};
}

class MoneyRef {
  final String label;
  final String href;

  const MoneyRef({required this.label, required this.href});

  factory MoneyRef.fromJson(Map<String, dynamic> json) => MoneyRef(label: json['label'] as String, href: json['href'] as String);

  Map<String, dynamic> toJson() => {'label': label, 'href': href};
}

class MoneyBar {
  final String key;
  final String label;
  final int value;
  final int count;

  const MoneyBar({required this.key, required this.label, required this.value, required this.count});

  factory MoneyBar.fromJson(Map<String, dynamic> json) => MoneyBar(key: json['key'] as String, label: json['label'] as String, value: (json['value'] as num).toInt(), count: (json['count'] as num).toInt());

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'value': value, 'count': count};
}

class MoneyFlow {
  final int incoming;
  final int refunds;
  final int fees;
  final int tax;
  final int net;
  final int other;
  final int profit;

  const MoneyFlow({required this.incoming, required this.refunds, required this.fees, required this.tax, required this.net, required this.other, required this.profit});

  factory MoneyFlow.fromJson(Map<String, dynamic> json) => MoneyFlow(incoming: (json['incoming'] as num).toInt(), refunds: (json['refunds'] as num).toInt(), fees: (json['fees'] as num).toInt(), tax: (json['tax'] as num).toInt(), net: (json['net'] as num).toInt(), other: (json['other'] as num).toInt(), profit: (json['profit'] as num).toInt());

  Map<String, dynamic> toJson() => {'incoming': incoming, 'refunds': refunds, 'fees': fees, 'tax': tax, 'net': net, 'other': other, 'profit': profit};
}

class FinanceMoneyRow {
  final String key;
  final String dateLabel;
  final int amount;
  final bool refund;
  final String method;
  final String what;
  final List<MoneyRef> refs;
  final String client;
  final String manager;
  final String acceptedBy;
  final String? receiptUrl;
  final String? check;

  const FinanceMoneyRow({required this.key, required this.dateLabel, required this.amount, required this.refund, required this.method, required this.what, required this.refs, required this.client, required this.manager, required this.acceptedBy, this.receiptUrl, this.check});

  factory FinanceMoneyRow.fromJson(Map<String, dynamic> json) => FinanceMoneyRow(key: json['key'] as String, dateLabel: json['dateLabel'] as String, amount: (json['amount'] as num).toInt(), refund: json['refund'] as bool, method: json['method'] as String, what: json['what'] as String, refs: (json['refs'] as List).map((e) => MoneyRef.fromJson(e as Map<String, dynamic>)).toList(), client: json['client'] as String, manager: json['manager'] as String, acceptedBy: json['acceptedBy'] as String, receiptUrl: json['receiptUrl'] == null ? null : json['receiptUrl'] as String, check: json['check'] == null ? null : json['check'] as String);

  Map<String, dynamic> toJson() => {'key': key, 'dateLabel': dateLabel, 'amount': amount, 'refund': refund, 'method': method, 'what': what, 'refs': refs.map((e) => e.toJson()).toList(), 'client': client, 'manager': manager, 'acceptedBy': acceptedBy, 'receiptUrl': receiptUrl, 'check': check};
}

class FinanceReviewRow {
  final String key;
  /// deal | order
  final String kind;
  final String id;
  final int amount;
  final String dateLabel;
  final String what;
  final bool refund;
  final bool mine;
  final List<MoneyRef> refs;
  final String client;
  final String manager;
  final String acceptedBy;
  final String? receiptUrl;
  final String? invoice;
  final String? note;

  const FinanceReviewRow({required this.key, required this.kind, required this.id, required this.amount, required this.dateLabel, required this.what, required this.refund, required this.mine, required this.refs, required this.client, required this.manager, required this.acceptedBy, this.receiptUrl, this.invoice, this.note});

  factory FinanceReviewRow.fromJson(Map<String, dynamic> json) => FinanceReviewRow(key: json['key'] as String, kind: json['kind'] as String, id: json['id'] as String, amount: (json['amount'] as num).toInt(), dateLabel: json['dateLabel'] as String, what: json['what'] as String, refund: json['refund'] as bool, mine: json['mine'] as bool, refs: (json['refs'] as List).map((e) => MoneyRef.fromJson(e as Map<String, dynamic>)).toList(), client: json['client'] as String, manager: json['manager'] as String, acceptedBy: json['acceptedBy'] as String, receiptUrl: json['receiptUrl'] == null ? null : json['receiptUrl'] as String, invoice: json['invoice'] == null ? null : json['invoice'] as String, note: json['note'] == null ? null : json['note'] as String);

  Map<String, dynamic> toJson() => {'key': key, 'kind': kind, 'id': id, 'amount': amount, 'dateLabel': dateLabel, 'what': what, 'refund': refund, 'mine': mine, 'refs': refs.map((e) => e.toJson()).toList(), 'client': client, 'manager': manager, 'acceptedBy': acceptedBy, 'receiptUrl': receiptUrl, 'invoice': invoice, 'note': note};
}

class FinanceIssue {
  final String key;
  final String kind;
  final String title;
  final String? href;
  final String ref;
  final String client;
  final String manager;
  final int amount;
  final String note;
  final String? dateLabel;
  final FinanceIssueTarget? target;
  final bool canUpgrade;

  const FinanceIssue({required this.key, required this.kind, required this.title, this.href, required this.ref, required this.client, required this.manager, required this.amount, required this.note, this.dateLabel, this.target, required this.canUpgrade});

  factory FinanceIssue.fromJson(Map<String, dynamic> json) => FinanceIssue(key: json['key'] as String, kind: json['kind'] as String, title: json['title'] as String, href: json['href'] == null ? null : json['href'] as String, ref: json['ref'] as String, client: json['client'] as String, manager: json['manager'] as String, amount: (json['amount'] as num).toInt(), note: json['note'] as String, dateLabel: json['dateLabel'] == null ? null : json['dateLabel'] as String, target: json['target'] == null ? null : FinanceIssueTarget.fromJson(json['target'] as Map<String, dynamic>), canUpgrade: json['canUpgrade'] as bool);

  Map<String, dynamic> toJson() => {'key': key, 'kind': kind, 'title': title, 'href': href, 'ref': ref, 'client': client, 'manager': manager, 'amount': amount, 'note': note, 'dateLabel': dateLabel, 'target': target == null ? null : target!.toJson(), 'canUpgrade': canUpgrade};
}

class FinanceIssueTarget {
  /// deal | order
  final String kind;
  final String id;
  final int number;

  const FinanceIssueTarget({required this.kind, required this.id, required this.number});

  factory FinanceIssueTarget.fromJson(Map<String, dynamic> json) => FinanceIssueTarget(kind: json['kind'] as String, id: json['id'] as String, number: (json['number'] as num).toInt());

  Map<String, dynamic> toJson() => {'kind': kind, 'id': id, 'number': number};
}

class FinanceResolved {
  final String id;
  final String title;
  final String ref;
  final String client;
  final String? href;
  final int amount;
  final String note;
  final String by;
  final String dateLabel;
  final bool stillOpen;

  const FinanceResolved({required this.id, required this.title, required this.ref, required this.client, this.href, required this.amount, required this.note, required this.by, required this.dateLabel, required this.stillOpen});

  factory FinanceResolved.fromJson(Map<String, dynamic> json) => FinanceResolved(id: json['id'] as String, title: json['title'] as String, ref: json['ref'] as String, client: json['client'] as String, href: json['href'] == null ? null : json['href'] as String, amount: (json['amount'] as num).toInt(), note: json['note'] as String, by: json['by'] as String, dateLabel: json['dateLabel'] as String, stillOpen: json['stillOpen'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'ref': ref, 'client': client, 'href': href, 'amount': amount, 'note': note, 'by': by, 'dateLabel': dateLabel, 'stillOpen': stillOpen};
}

class FinanceDue {
  final String key;
  /// deal | order | postpay
  final String kind;
  final String href;
  final String ref;
  final String client;
  final String manager;
  final int total;
  final int paid;
  final int left;
  /// ready | progress | none
  final String group;
  final String bookLabel;
  final String? dueLabel;
  final bool overdue;
  final String? invoice;
  final String? note;

  const FinanceDue({required this.key, required this.kind, required this.href, required this.ref, required this.client, required this.manager, required this.total, required this.paid, required this.left, required this.group, required this.bookLabel, this.dueLabel, required this.overdue, this.invoice, this.note});

  factory FinanceDue.fromJson(Map<String, dynamic> json) => FinanceDue(key: json['key'] as String, kind: json['kind'] as String, href: json['href'] as String, ref: json['ref'] as String, client: json['client'] as String, manager: json['manager'] as String, total: (json['total'] as num).toInt(), paid: (json['paid'] as num).toInt(), left: (json['left'] as num).toInt(), group: json['group'] as String, bookLabel: json['bookLabel'] as String, dueLabel: json['dueLabel'] == null ? null : json['dueLabel'] as String, overdue: json['overdue'] as bool, invoice: json['invoice'] == null ? null : json['invoice'] as String, note: json['note'] == null ? null : json['note'] as String);

  Map<String, dynamic> toJson() => {'key': key, 'kind': kind, 'href': href, 'ref': ref, 'client': client, 'manager': manager, 'total': total, 'paid': paid, 'left': left, 'group': group, 'bookLabel': bookLabel, 'dueLabel': dueLabel, 'overdue': overdue, 'invoice': invoice, 'note': note};
}

class Finance {
  final MoneyPeriod period;
  final bool own;
  final FinanceTotals totals;
  final MoneyFlow? flow;
  final List<FinanceByDay> byDay;
  final List<MoneyBar> byMethod;
  final List<MoneyBar> byManager;
  final List<FinanceReviewRow> review;
  final List<FinanceIssue> issues;
  final List<FinanceResolved> resolved;
  final List<FinanceMoneyRow> recent;
  final List<FinanceMoneyRow> refunds;
  final FinanceExpected expected;
  final FinancePerms perms;

  const Finance({required this.period, required this.own, required this.totals, this.flow, required this.byDay, required this.byMethod, required this.byManager, required this.review, required this.issues, required this.resolved, required this.recent, required this.refunds, required this.expected, required this.perms});

  factory Finance.fromJson(Map<String, dynamic> json) => Finance(period: MoneyPeriod.fromJson(json['period'] as Map<String, dynamic>), own: json['own'] as bool, totals: FinanceTotals.fromJson(json['totals'] as Map<String, dynamic>), flow: json['flow'] == null ? null : MoneyFlow.fromJson(json['flow'] as Map<String, dynamic>), byDay: (json['byDay'] as List).map((e) => FinanceByDay.fromJson(e as Map<String, dynamic>)).toList(), byMethod: (json['byMethod'] as List).map((e) => MoneyBar.fromJson(e as Map<String, dynamic>)).toList(), byManager: (json['byManager'] as List).map((e) => MoneyBar.fromJson(e as Map<String, dynamic>)).toList(), review: (json['review'] as List).map((e) => FinanceReviewRow.fromJson(e as Map<String, dynamic>)).toList(), issues: (json['issues'] as List).map((e) => FinanceIssue.fromJson(e as Map<String, dynamic>)).toList(), resolved: (json['resolved'] as List).map((e) => FinanceResolved.fromJson(e as Map<String, dynamic>)).toList(), recent: (json['recent'] as List).map((e) => FinanceMoneyRow.fromJson(e as Map<String, dynamic>)).toList(), refunds: (json['refunds'] as List).map((e) => FinanceMoneyRow.fromJson(e as Map<String, dynamic>)).toList(), expected: FinanceExpected.fromJson(json['expected'] as Map<String, dynamic>), perms: FinancePerms.fromJson(json['perms'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'period': period.toJson(), 'own': own, 'totals': totals.toJson(), 'flow': flow == null ? null : flow!.toJson(), 'byDay': byDay.map((e) => e.toJson()).toList(), 'byMethod': byMethod.map((e) => e.toJson()).toList(), 'byManager': byManager.map((e) => e.toJson()).toList(), 'review': review.map((e) => e.toJson()).toList(), 'issues': issues.map((e) => e.toJson()).toList(), 'resolved': resolved.map((e) => e.toJson()).toList(), 'recent': recent.map((e) => e.toJson()).toList(), 'refunds': refunds.map((e) => e.toJson()).toList(), 'expected': expected.toJson(), 'perms': perms.toJson()};
}

class FinanceTotals {
  final int net;
  final int incoming;
  final int refunds;
  final int online;
  final int manual;
  final int count;
  final int refundCount;
  final int prevNet;
  final double? delta;
  final int expected;
  final int expectedReady;
  final int postpay;
  final int postpayCount;
  final int overpaid;
  final int overpaidCount;
  final int reviewCount;
  final int reviewSum;

  const FinanceTotals({required this.net, required this.incoming, required this.refunds, required this.online, required this.manual, required this.count, required this.refundCount, required this.prevNet, this.delta, required this.expected, required this.expectedReady, required this.postpay, required this.postpayCount, required this.overpaid, required this.overpaidCount, required this.reviewCount, required this.reviewSum});

  factory FinanceTotals.fromJson(Map<String, dynamic> json) => FinanceTotals(net: (json['net'] as num).toInt(), incoming: (json['incoming'] as num).toInt(), refunds: (json['refunds'] as num).toInt(), online: (json['online'] as num).toInt(), manual: (json['manual'] as num).toInt(), count: (json['count'] as num).toInt(), refundCount: (json['refundCount'] as num).toInt(), prevNet: (json['prevNet'] as num).toInt(), delta: json['delta'] == null ? null : (json['delta'] as num).toDouble(), expected: (json['expected'] as num).toInt(), expectedReady: (json['expectedReady'] as num).toInt(), postpay: (json['postpay'] as num).toInt(), postpayCount: (json['postpayCount'] as num).toInt(), overpaid: (json['overpaid'] as num).toInt(), overpaidCount: (json['overpaidCount'] as num).toInt(), reviewCount: (json['reviewCount'] as num).toInt(), reviewSum: (json['reviewSum'] as num).toInt());

  Map<String, dynamic> toJson() => {'net': net, 'incoming': incoming, 'refunds': refunds, 'online': online, 'manual': manual, 'count': count, 'refundCount': refundCount, 'prevNet': prevNet, 'delta': delta, 'expected': expected, 'expectedReady': expectedReady, 'postpay': postpay, 'postpayCount': postpayCount, 'overpaid': overpaid, 'overpaidCount': overpaidCount, 'reviewCount': reviewCount, 'reviewSum': reviewSum};
}

class FinanceByDay {
  final String date;
  final int incoming;
  final int refunds;

  const FinanceByDay({required this.date, required this.incoming, required this.refunds});

  factory FinanceByDay.fromJson(Map<String, dynamic> json) => FinanceByDay(date: json['date'] as String, incoming: (json['incoming'] as num).toInt(), refunds: (json['refunds'] as num).toInt());

  Map<String, dynamic> toJson() => {'date': date, 'incoming': incoming, 'refunds': refunds};
}

class FinanceExpected {
  final List<FinanceDue> rows;
  final List<MoneyBar> groups;
  final int total;

  const FinanceExpected({required this.rows, required this.groups, required this.total});

  factory FinanceExpected.fromJson(Map<String, dynamic> json) => FinanceExpected(rows: (json['rows'] as List).map((e) => FinanceDue.fromJson(e as Map<String, dynamic>)).toList(), groups: (json['groups'] as List).map((e) => MoneyBar.fromJson(e as Map<String, dynamic>)).toList(), total: (json['total'] as num).toInt());

  Map<String, dynamic> toJson() => {'rows': rows.map((e) => e.toJson()).toList(), 'groups': groups.map((e) => e.toJson()).toList(), 'total': total};
}

class FinancePerms {
  final bool reviewDeal;
  final bool reviewOrder;
  final bool resolveDeal;
  final bool resolveOrder;
  final bool refundDeal;
  final bool editOrder;

  const FinancePerms({required this.reviewDeal, required this.reviewOrder, required this.resolveDeal, required this.resolveOrder, required this.refundDeal, required this.editOrder});

  factory FinancePerms.fromJson(Map<String, dynamic> json) => FinancePerms(reviewDeal: json['reviewDeal'] as bool, reviewOrder: json['reviewOrder'] as bool, resolveDeal: json['resolveDeal'] as bool, resolveOrder: json['resolveOrder'] as bool, refundDeal: json['refundDeal'] as bool, editOrder: json['editOrder'] as bool);

  Map<String, dynamic> toJson() => {'reviewDeal': reviewDeal, 'reviewOrder': reviewOrder, 'resolveDeal': resolveDeal, 'resolveOrder': resolveOrder, 'refundDeal': refundDeal, 'editOrder': editOrder};
}

class FinanceReviewBody {
  /// deal | order
  final String kind;
  final String id;

  const FinanceReviewBody({required this.kind, required this.id});

  factory FinanceReviewBody.fromJson(Map<String, dynamic> json) => FinanceReviewBody(kind: json['kind'] as String, id: json['id'] as String);

  Map<String, dynamic> toJson() => {'kind': kind, 'id': id};
}

class FinanceResolveBody {
  final String key;
  final int amount;
  final String note;

  const FinanceResolveBody({required this.key, required this.amount, required this.note});

  factory FinanceResolveBody.fromJson(Map<String, dynamic> json) => FinanceResolveBody(key: json['key'] as String, amount: (json['amount'] as num).toInt(), note: json['note'] as String);

  Map<String, dynamic> toJson() => {'key': key, 'amount': amount, 'note': note};
}

class ExpenseRow {
  final String id;
  /// expense | ads
  final String source;
  final String day;
  final String category;
  final String categoryLabel;
  final String name;
  final String title;
  final int amount;
  final int? quantity;
  final String note;
  final String? channel;
  final String by;

  const ExpenseRow({required this.id, required this.source, required this.day, required this.category, required this.categoryLabel, required this.name, required this.title, required this.amount, this.quantity, required this.note, this.channel, required this.by});

  factory ExpenseRow.fromJson(Map<String, dynamic> json) => ExpenseRow(id: json['id'] as String, source: json['source'] as String, day: json['day'] as String, category: json['category'] as String, categoryLabel: json['categoryLabel'] as String, name: json['name'] as String, title: json['title'] as String, amount: (json['amount'] as num).toInt(), quantity: json['quantity'] == null ? null : (json['quantity'] as num).toInt(), note: json['note'] as String, channel: json['channel'] == null ? null : json['channel'] as String, by: json['by'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'source': source, 'day': day, 'category': category, 'categoryLabel': categoryLabel, 'name': name, 'title': title, 'amount': amount, 'quantity': quantity, 'note': note, 'channel': channel, 'by': by};
}

class Expenses {
  final MoneyPeriod period;
  final int total;
  final List<MoneyBar> byCategory;
  final List<MoneyBar> byGroup;
  final List<ExpenseRow> rows;
  final bool canManage;
  final List<ExpensesCategories> categories;
  final List<Choice> channels;

  const Expenses({required this.period, required this.total, required this.byCategory, required this.byGroup, required this.rows, required this.canManage, required this.categories, required this.channels});

  factory Expenses.fromJson(Map<String, dynamic> json) => Expenses(period: MoneyPeriod.fromJson(json['period'] as Map<String, dynamic>), total: (json['total'] as num).toInt(), byCategory: (json['byCategory'] as List).map((e) => MoneyBar.fromJson(e as Map<String, dynamic>)).toList(), byGroup: (json['byGroup'] as List).map((e) => MoneyBar.fromJson(e as Map<String, dynamic>)).toList(), rows: (json['rows'] as List).map((e) => ExpenseRow.fromJson(e as Map<String, dynamic>)).toList(), canManage: json['canManage'] as bool, categories: (json['categories'] as List).map((e) => ExpensesCategories.fromJson(e as Map<String, dynamic>)).toList(), channels: (json['channels'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'period': period.toJson(), 'total': total, 'byCategory': byCategory.map((e) => e.toJson()).toList(), 'byGroup': byGroup.map((e) => e.toJson()).toList(), 'rows': rows.map((e) => e.toJson()).toList(), 'canManage': canManage, 'categories': categories.map((e) => e.toJson()).toList(), 'channels': channels.map((e) => e.toJson()).toList()};
}

class ExpensesCategories {
  final String id;
  final String label;
  final String group;

  const ExpensesCategories({required this.id, required this.label, required this.group});

  factory ExpensesCategories.fromJson(Map<String, dynamic> json) => ExpensesCategories(id: json['id'] as String, label: json['label'] as String, group: json['group'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'label': label, 'group': group};
}

class ExpenseBody {
  final String category;
  final String day;
  final int amount;
  final String title;
  final int? quantity;
  final String note;
  final String? channel;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const ExpenseBody({required this.category, required this.day, required this.amount, required this.title, this.quantity, required this.note, this.channel, this.nulls = const {}});

  factory ExpenseBody.fromJson(Map<String, dynamic> json) => ExpenseBody(category: json['category'] as String, day: json['day'] as String, amount: (json['amount'] as num).toInt(), title: json['title'] as String, quantity: json['quantity'] == null ? null : (json['quantity'] as num).toInt(), note: json['note'] as String, channel: json['channel'] == null ? null : json['channel'] as String);

  Map<String, dynamic> toJson() => {'category': category, 'day': day, 'amount': amount, 'title': title, if (quantity != null || nulls.contains('quantity')) 'quantity': quantity, 'note': note, if (channel != null || nulls.contains('channel')) 'channel': channel};
}

class ProfitLine {
  final String label;
  final int value;
  final int prev;
  final String? kind;
  final bool minus;

  const ProfitLine({required this.label, required this.value, required this.prev, this.kind, required this.minus});

  factory ProfitLine.fromJson(Map<String, dynamic> json) => ProfitLine(label: json['label'] as String, value: (json['value'] as num).toInt(), prev: (json['prev'] as num).toInt(), kind: json['kind'] == null ? null : json['kind'] as String, minus: json['minus'] as bool);

  Map<String, dynamic> toJson() => {'label': label, 'value': value, 'prev': prev, 'kind': kind, 'minus': minus};
}

class Profit {
  final MoneyPeriod period;
  final ProfitTotals totals;
  final List<ProfitLine> lines;
  /// day | week | month
  final String step;
  final List<ProfitRows> rows;
  final MoneyFlow flow;
  final ProfitUnit unit;
  final ProfitFees fees;
  final ProfitTax tax;
  final bool noExpenses;
  final bool canManage;
  final List<String> payForms;
  final Map<String, dynamic> feeRates;

  const Profit({required this.period, required this.totals, required this.lines, required this.step, required this.rows, required this.flow, required this.unit, required this.fees, required this.tax, required this.noExpenses, required this.canManage, required this.payForms, required this.feeRates});

  factory Profit.fromJson(Map<String, dynamic> json) => Profit(period: MoneyPeriod.fromJson(json['period'] as Map<String, dynamic>), totals: ProfitTotals.fromJson(json['totals'] as Map<String, dynamic>), lines: (json['lines'] as List).map((e) => ProfitLine.fromJson(e as Map<String, dynamic>)).toList(), step: json['step'] as String, rows: (json['rows'] as List).map((e) => ProfitRows.fromJson(e as Map<String, dynamic>)).toList(), flow: MoneyFlow.fromJson(json['flow'] as Map<String, dynamic>), unit: ProfitUnit.fromJson(json['unit'] as Map<String, dynamic>), fees: ProfitFees.fromJson(json['fees'] as Map<String, dynamic>), tax: ProfitTax.fromJson(json['tax'] as Map<String, dynamic>), noExpenses: json['noExpenses'] as bool, canManage: json['canManage'] as bool, payForms: (json['payForms'] as List).map((e) => e as String).toList(), feeRates: json['feeRates'] as Map<String, dynamic>);

  Map<String, dynamic> toJson() => {'period': period.toJson(), 'totals': totals.toJson(), 'lines': lines.map((e) => e.toJson()).toList(), 'step': step, 'rows': rows.map((e) => e.toJson()).toList(), 'flow': flow.toJson(), 'unit': unit.toJson(), 'fees': fees.toJson(), 'tax': tax.toJson(), 'noExpenses': noExpenses, 'canManage': canManage, 'payForms': payForms.map((e) => e).toList(), 'feeRates': feeRates};
}

class ProfitTotals {
  final int revenue;
  final int expenses;
  final int profit;
  final double? margin;
  final double? deltaRevenue;
  final double? deltaExpenses;
  final double? deltaProfit;

  const ProfitTotals({required this.revenue, required this.expenses, required this.profit, this.margin, this.deltaRevenue, this.deltaExpenses, this.deltaProfit});

  factory ProfitTotals.fromJson(Map<String, dynamic> json) => ProfitTotals(revenue: (json['revenue'] as num).toInt(), expenses: (json['expenses'] as num).toInt(), profit: (json['profit'] as num).toInt(), margin: json['margin'] == null ? null : (json['margin'] as num).toDouble(), deltaRevenue: json['deltaRevenue'] == null ? null : (json['deltaRevenue'] as num).toDouble(), deltaExpenses: json['deltaExpenses'] == null ? null : (json['deltaExpenses'] as num).toDouble(), deltaProfit: json['deltaProfit'] == null ? null : (json['deltaProfit'] as num).toDouble());

  Map<String, dynamic> toJson() => {'revenue': revenue, 'expenses': expenses, 'profit': profit, 'margin': margin, 'deltaRevenue': deltaRevenue, 'deltaExpenses': deltaExpenses, 'deltaProfit': deltaProfit};
}

class ProfitRows {
  final String key;
  final String label;
  final int revenue;
  final int expenses;
  final int profit;

  const ProfitRows({required this.key, required this.label, required this.revenue, required this.expenses, required this.profit});

  factory ProfitRows.fromJson(Map<String, dynamic> json) => ProfitRows(key: json['key'] as String, label: json['label'] as String, revenue: (json['revenue'] as num).toInt(), expenses: (json['expenses'] as num).toInt(), profit: (json['profit'] as num).toInt());

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'revenue': revenue, 'expenses': expenses, 'profit': profit};
}

class ProfitUnit {
  final int leads;
  final int buyers;
  final int orders;
  final double? conversion;
  final double? cpl;
  final double? cac;
  final double? roasCash;
  final double? roasFirst;
  final double? roasAgreed;
  final double? adShare;
  final double? avgFirst;
  final double? avgAgreed;
  final double? printPerBook;
  final double? profitPerBuyer;

  const ProfitUnit({required this.leads, required this.buyers, required this.orders, this.conversion, this.cpl, this.cac, this.roasCash, this.roasFirst, this.roasAgreed, this.adShare, this.avgFirst, this.avgAgreed, this.printPerBook, this.profitPerBuyer});

  factory ProfitUnit.fromJson(Map<String, dynamic> json) => ProfitUnit(leads: (json['leads'] as num).toInt(), buyers: (json['buyers'] as num).toInt(), orders: (json['orders'] as num).toInt(), conversion: json['conversion'] == null ? null : (json['conversion'] as num).toDouble(), cpl: json['cpl'] == null ? null : (json['cpl'] as num).toDouble(), cac: json['cac'] == null ? null : (json['cac'] as num).toDouble(), roasCash: json['roasCash'] == null ? null : (json['roasCash'] as num).toDouble(), roasFirst: json['roasFirst'] == null ? null : (json['roasFirst'] as num).toDouble(), roasAgreed: json['roasAgreed'] == null ? null : (json['roasAgreed'] as num).toDouble(), adShare: json['adShare'] == null ? null : (json['adShare'] as num).toDouble(), avgFirst: json['avgFirst'] == null ? null : (json['avgFirst'] as num).toDouble(), avgAgreed: json['avgAgreed'] == null ? null : (json['avgAgreed'] as num).toDouble(), printPerBook: json['printPerBook'] == null ? null : (json['printPerBook'] as num).toDouble(), profitPerBuyer: json['profitPerBuyer'] == null ? null : (json['profitPerBuyer'] as num).toDouble());

  Map<String, dynamic> toJson() => {'leads': leads, 'buyers': buyers, 'orders': orders, 'conversion': conversion, 'cpl': cpl, 'cac': cac, 'roasCash': roasCash, 'roasFirst': roasFirst, 'roasAgreed': roasAgreed, 'adShare': adShare, 'avgFirst': avgFirst, 'avgAgreed': avgAgreed, 'printPerBook': printPerBook, 'profitPerBuyer': profitPerBuyer};
}

class ProfitFees {
  final int auto;
  final double base;
  final List<ProfitFeesByForm> byForm;

  const ProfitFees({required this.auto, required this.base, required this.byForm});

  factory ProfitFees.fromJson(Map<String, dynamic> json) => ProfitFees(auto: (json['auto'] as num).toInt(), base: (json['base'] as num).toDouble(), byForm: (json['byForm'] as List).map((e) => ProfitFeesByForm.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'auto': auto, 'base': base, 'byForm': byForm.map((e) => e.toJson()).toList()};
}

class ProfitFeesByForm {
  final String form;
  final double rate;
  final int money;
  final int fee;
  final int count;

  const ProfitFeesByForm({required this.form, required this.rate, required this.money, required this.fee, required this.count});

  factory ProfitFeesByForm.fromJson(Map<String, dynamic> json) => ProfitFeesByForm(form: json['form'] as String, rate: (json['rate'] as num).toDouble(), money: (json['money'] as num).toInt(), fee: (json['fee'] as num).toInt(), count: (json['count'] as num).toInt());

  Map<String, dynamic> toJson() => {'form': form, 'rate': rate, 'money': money, 'fee': fee, 'count': count};
}

class ProfitTax {
  final double rate;
  final int auto;

  const ProfitTax({required this.rate, required this.auto});

  factory ProfitTax.fromJson(Map<String, dynamic> json) => ProfitTax(rate: (json['rate'] as num).toDouble(), auto: (json['auto'] as num).toInt());

  Map<String, dynamic> toJson() => {'rate': rate, 'auto': auto};
}

class FeeRatesBody {
  final List<FeeRatesBodyRates> rates;
  final double taxRate;

  const FeeRatesBody({required this.rates, required this.taxRate});

  factory FeeRatesBody.fromJson(Map<String, dynamic> json) => FeeRatesBody(rates: (json['rates'] as List).map((e) => FeeRatesBodyRates.fromJson(e as Map<String, dynamic>)).toList(), taxRate: (json['taxRate'] as num).toDouble());

  Map<String, dynamic> toJson() => {'rates': rates.map((e) => e.toJson()).toList(), 'taxRate': taxRate};
}

class FeeRatesBodyRates {
  final String form;
  final double rate;

  const FeeRatesBodyRates({required this.form, required this.rate});

  factory FeeRatesBodyRates.fromJson(Map<String, dynamic> json) => FeeRatesBodyRates(form: json['form'] as String, rate: (json['rate'] as num).toDouble());

  Map<String, dynamic> toJson() => {'form': form, 'rate': rate};
}

class SalesRow {
  final String id;
  final int number;
  final String day;
  final String client;
  final String phone;
  final String city;
  final String channel;
  final String manager;
  final String plan;
  final int price;
  final int paid;
  final int rest;
  final String state;
  final String method;
  final String payForm;
  final int fee;
  final String eventDate;
  final String? orderId;

  const SalesRow({required this.id, required this.number, required this.day, required this.client, required this.phone, required this.city, required this.channel, required this.manager, required this.plan, required this.price, required this.paid, required this.rest, required this.state, required this.method, required this.payForm, required this.fee, required this.eventDate, this.orderId});

  factory SalesRow.fromJson(Map<String, dynamic> json) => SalesRow(id: json['id'] as String, number: (json['number'] as num).toInt(), day: json['day'] as String, client: json['client'] as String, phone: json['phone'] as String, city: json['city'] as String, channel: json['channel'] as String, manager: json['manager'] as String, plan: json['plan'] as String, price: (json['price'] as num).toInt(), paid: (json['paid'] as num).toInt(), rest: (json['rest'] as num).toInt(), state: json['state'] as String, method: json['method'] as String, payForm: json['payForm'] as String, fee: (json['fee'] as num).toInt(), eventDate: json['eventDate'] as String, orderId: json['orderId'] == null ? null : json['orderId'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'day': day, 'client': client, 'phone': phone, 'city': city, 'channel': channel, 'manager': manager, 'plan': plan, 'price': price, 'paid': paid, 'rest': rest, 'state': state, 'method': method, 'payForm': payForm, 'fee': fee, 'eventDate': eventDate, 'orderId': orderId};
}

class SalesRegister {
  final MoneyPeriod period;
  final SalesRegisterTotals totals;
  final List<SalesRow> rows;
  final bool canEdit;
  final List<String> payForms;
  final bool showFees;

  const SalesRegister({required this.period, required this.totals, required this.rows, required this.canEdit, required this.payForms, required this.showFees});

  factory SalesRegister.fromJson(Map<String, dynamic> json) => SalesRegister(period: MoneyPeriod.fromJson(json['period'] as Map<String, dynamic>), totals: SalesRegisterTotals.fromJson(json['totals'] as Map<String, dynamic>), rows: (json['rows'] as List).map((e) => SalesRow.fromJson(e as Map<String, dynamic>)).toList(), canEdit: json['canEdit'] as bool, payForms: (json['payForms'] as List).map((e) => e as String).toList(), showFees: json['showFees'] as bool);

  Map<String, dynamic> toJson() => {'period': period.toJson(), 'totals': totals.toJson(), 'rows': rows.map((e) => e.toJson()).toList(), 'canEdit': canEdit, 'payForms': payForms.map((e) => e).toList(), 'showFees': showFees};
}

class SalesRegisterTotals {
  final int count;
  final int settled;
  final int price;
  final int paid;
  final int rest;
  final int fee;

  const SalesRegisterTotals({required this.count, required this.settled, required this.price, required this.paid, required this.rest, required this.fee});

  factory SalesRegisterTotals.fromJson(Map<String, dynamic> json) => SalesRegisterTotals(count: (json['count'] as num).toInt(), settled: (json['settled'] as num).toInt(), price: (json['price'] as num).toInt(), paid: (json['paid'] as num).toInt(), rest: (json['rest'] as num).toInt(), fee: (json['fee'] as num).toInt());

  Map<String, dynamic> toJson() => {'count': count, 'settled': settled, 'price': price, 'paid': paid, 'rest': rest, 'fee': fee};
}

class PayFormBody {
  final String form;

  const PayFormBody({required this.form});

  factory PayFormBody.fromJson(Map<String, dynamic> json) => PayFormBody(form: json['form'] as String);

  Map<String, dynamic> toJson() => {'form': form};
}

class AnalyticsFunnelRow {
  final String id;
  final String name;
  final String kind;
  final int reached;
  final int? prev;
  final String? conversion;
  final String? timeLabel;

  const AnalyticsFunnelRow({required this.id, required this.name, required this.kind, required this.reached, this.prev, this.conversion, this.timeLabel});

  factory AnalyticsFunnelRow.fromJson(Map<String, dynamic> json) => AnalyticsFunnelRow(id: json['id'] as String, name: json['name'] as String, kind: json['kind'] as String, reached: (json['reached'] as num).toInt(), prev: json['prev'] == null ? null : (json['prev'] as num).toInt(), conversion: json['conversion'] == null ? null : json['conversion'] as String, timeLabel: json['timeLabel'] == null ? null : json['timeLabel'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'kind': kind, 'reached': reached, 'prev': prev, 'conversion': conversion, 'timeLabel': timeLabel};
}

class AnalyticsChannel {
  final String key;
  final String label;
  final int created;
  final int won;
  final int revenue;

  const AnalyticsChannel({required this.key, required this.label, required this.created, required this.won, required this.revenue});

  factory AnalyticsChannel.fromJson(Map<String, dynamic> json) => AnalyticsChannel(key: json['key'] as String, label: json['label'] as String, created: (json['created'] as num).toInt(), won: (json['won'] as num).toInt(), revenue: (json['revenue'] as num).toInt());

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'created': created, 'won': won, 'revenue': revenue};
}

class AnalyticsManager {
  final String id;
  final String name;
  final int deals;
  final int won;
  final int revenue;
  final int received;
  final int open;
  final int messages;
  final int phoneMessages;
  final int calls;
  final int talkMinutes;
  final int tasksDone;
  final int tasksOverdue;
  final String responseLabel;
  final String inSlaLabel;
  final String planLabel;

  const AnalyticsManager({required this.id, required this.name, required this.deals, required this.won, required this.revenue, required this.received, required this.open, required this.messages, required this.phoneMessages, required this.calls, required this.talkMinutes, required this.tasksDone, required this.tasksOverdue, required this.responseLabel, required this.inSlaLabel, required this.planLabel});

  factory AnalyticsManager.fromJson(Map<String, dynamic> json) => AnalyticsManager(id: json['id'] as String, name: json['name'] as String, deals: (json['deals'] as num).toInt(), won: (json['won'] as num).toInt(), revenue: (json['revenue'] as num).toInt(), received: (json['received'] as num).toInt(), open: (json['open'] as num).toInt(), messages: (json['messages'] as num).toInt(), phoneMessages: (json['phoneMessages'] as num).toInt(), calls: (json['calls'] as num).toInt(), talkMinutes: (json['talkMinutes'] as num).toInt(), tasksDone: (json['tasksDone'] as num).toInt(), tasksOverdue: (json['tasksOverdue'] as num).toInt(), responseLabel: json['responseLabel'] as String, inSlaLabel: json['inSlaLabel'] as String, planLabel: json['planLabel'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'deals': deals, 'won': won, 'revenue': revenue, 'received': received, 'open': open, 'messages': messages, 'phoneMessages': phoneMessages, 'calls': calls, 'talkMinutes': talkMinutes, 'tasksDone': tasksDone, 'tasksOverdue': tasksOverdue, 'responseLabel': responseLabel, 'inSlaLabel': inSlaLabel, 'planLabel': planLabel};
}

class SalesAnalytics {
  final MoneyPeriod period;
  final List<Choice> pipelines;
  final String pipelineId;
  final MoneyFlow? flow;
  final SalesAnalyticsTiles tiles;
  final SalesAnalyticsFunnel funnel;
  final List<AnalyticsChannel> channels;
  final List<AnalyticsManager> team;
  final List<SalesAnalyticsLongest> longest;
  final SalesAnalyticsCalls calls;
  final List<SalesAnalyticsLost> lost;

  const SalesAnalytics({required this.period, required this.pipelines, required this.pipelineId, this.flow, required this.tiles, required this.funnel, required this.channels, required this.team, required this.longest, required this.calls, required this.lost});

  factory SalesAnalytics.fromJson(Map<String, dynamic> json) => SalesAnalytics(period: MoneyPeriod.fromJson(json['period'] as Map<String, dynamic>), pipelines: (json['pipelines'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), pipelineId: json['pipelineId'] as String, flow: json['flow'] == null ? null : MoneyFlow.fromJson(json['flow'] as Map<String, dynamic>), tiles: SalesAnalyticsTiles.fromJson(json['tiles'] as Map<String, dynamic>), funnel: SalesAnalyticsFunnel.fromJson(json['funnel'] as Map<String, dynamic>), channels: (json['channels'] as List).map((e) => AnalyticsChannel.fromJson(e as Map<String, dynamic>)).toList(), team: (json['team'] as List).map((e) => AnalyticsManager.fromJson(e as Map<String, dynamic>)).toList(), longest: (json['longest'] as List).map((e) => SalesAnalyticsLongest.fromJson(e as Map<String, dynamic>)).toList(), calls: SalesAnalyticsCalls.fromJson(json['calls'] as Map<String, dynamic>), lost: (json['lost'] as List).map((e) => SalesAnalyticsLost.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'period': period.toJson(), 'pipelines': pipelines.map((e) => e.toJson()).toList(), 'pipelineId': pipelineId, 'flow': flow == null ? null : flow!.toJson(), 'tiles': tiles.toJson(), 'funnel': funnel.toJson(), 'channels': channels.map((e) => e.toJson()).toList(), 'team': team.map((e) => e.toJson()).toList(), 'longest': longest.map((e) => e.toJson()).toList(), 'calls': calls.toJson(), 'lost': lost.map((e) => e.toJson()).toList()};
}

class SalesAnalyticsTiles {
  final int received;
  final double? receivedDelta;
  final int wonSum;
  final double? wonSumDelta;
  final int repeatRevenue;
  final int created;
  final double? createdDelta;
  final int repeatCreated;
  final int won;
  final double? wonDelta;
  final int repeatWon;
  final String conversion;
  final String cycle;
  final String responseMedian;
  final String inSla;
  final int slaMinutes;
  final int awaiting;
  final int botFirst;
  final String? botMedian;

  const SalesAnalyticsTiles({required this.received, this.receivedDelta, required this.wonSum, this.wonSumDelta, required this.repeatRevenue, required this.created, this.createdDelta, required this.repeatCreated, required this.won, this.wonDelta, required this.repeatWon, required this.conversion, required this.cycle, required this.responseMedian, required this.inSla, required this.slaMinutes, required this.awaiting, required this.botFirst, this.botMedian});

  factory SalesAnalyticsTiles.fromJson(Map<String, dynamic> json) => SalesAnalyticsTiles(received: (json['received'] as num).toInt(), receivedDelta: json['receivedDelta'] == null ? null : (json['receivedDelta'] as num).toDouble(), wonSum: (json['wonSum'] as num).toInt(), wonSumDelta: json['wonSumDelta'] == null ? null : (json['wonSumDelta'] as num).toDouble(), repeatRevenue: (json['repeatRevenue'] as num).toInt(), created: (json['created'] as num).toInt(), createdDelta: json['createdDelta'] == null ? null : (json['createdDelta'] as num).toDouble(), repeatCreated: (json['repeatCreated'] as num).toInt(), won: (json['won'] as num).toInt(), wonDelta: json['wonDelta'] == null ? null : (json['wonDelta'] as num).toDouble(), repeatWon: (json['repeatWon'] as num).toInt(), conversion: json['conversion'] as String, cycle: json['cycle'] as String, responseMedian: json['responseMedian'] as String, inSla: json['inSla'] as String, slaMinutes: (json['slaMinutes'] as num).toInt(), awaiting: (json['awaiting'] as num).toInt(), botFirst: (json['botFirst'] as num).toInt(), botMedian: json['botMedian'] == null ? null : json['botMedian'] as String);

  Map<String, dynamic> toJson() => {'received': received, 'receivedDelta': receivedDelta, 'wonSum': wonSum, 'wonSumDelta': wonSumDelta, 'repeatRevenue': repeatRevenue, 'created': created, 'createdDelta': createdDelta, 'repeatCreated': repeatCreated, 'won': won, 'wonDelta': wonDelta, 'repeatWon': repeatWon, 'conversion': conversion, 'cycle': cycle, 'responseMedian': responseMedian, 'inSla': inSla, 'slaMinutes': slaMinutes, 'awaiting': awaiting, 'botFirst': botFirst, 'botMedian': botMedian};
}

class SalesAnalyticsFunnel {
  final int base;
  final int inWork;
  final List<AnalyticsFunnelRow> rows;

  const SalesAnalyticsFunnel({required this.base, required this.inWork, required this.rows});

  factory SalesAnalyticsFunnel.fromJson(Map<String, dynamic> json) => SalesAnalyticsFunnel(base: (json['base'] as num).toInt(), inWork: (json['inWork'] as num).toInt(), rows: (json['rows'] as List).map((e) => AnalyticsFunnelRow.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'base': base, 'inWork': inWork, 'rows': rows.map((e) => e.toJson()).toList()};
}

class SalesAnalyticsLongest {
  final String conversationId;
  final String askedLabel;
  final String waitLabel;
  final bool answered;

  const SalesAnalyticsLongest({required this.conversationId, required this.askedLabel, required this.waitLabel, required this.answered});

  factory SalesAnalyticsLongest.fromJson(Map<String, dynamic> json) => SalesAnalyticsLongest(conversationId: json['conversationId'] as String, askedLabel: json['askedLabel'] as String, waitLabel: json['waitLabel'] as String, answered: json['answered'] as bool);

  Map<String, dynamic> toJson() => {'conversationId': conversationId, 'askedLabel': askedLabel, 'waitLabel': waitLabel, 'answered': answered};
}

class SalesAnalyticsCalls {
  final int incoming;
  final int outgoing;
  final int missed;
  final int handled;
  final int talkMinutes;
  final int unanswered;
  final int asked;

  const SalesAnalyticsCalls({required this.incoming, required this.outgoing, required this.missed, required this.handled, required this.talkMinutes, required this.unanswered, required this.asked});

  factory SalesAnalyticsCalls.fromJson(Map<String, dynamic> json) => SalesAnalyticsCalls(incoming: (json['incoming'] as num).toInt(), outgoing: (json['outgoing'] as num).toInt(), missed: (json['missed'] as num).toInt(), handled: (json['handled'] as num).toInt(), talkMinutes: (json['talkMinutes'] as num).toInt(), unanswered: (json['unanswered'] as num).toInt(), asked: (json['asked'] as num).toInt());

  Map<String, dynamic> toJson() => {'incoming': incoming, 'outgoing': outgoing, 'missed': missed, 'handled': handled, 'talkMinutes': talkMinutes, 'unanswered': unanswered, 'asked': asked};
}

class SalesAnalyticsLost {
  final String label;
  final int value;

  const SalesAnalyticsLost({required this.label, required this.value});

  factory SalesAnalyticsLost.fromJson(Map<String, dynamic> json) => SalesAnalyticsLost(label: json['label'] as String, value: (json['value'] as num).toInt());

  Map<String, dynamic> toJson() => {'label': label, 'value': value};
}

class LeadCut {
  final String? key;
  final String label;
  final int leads;
  final int paid;
  final double? conversion;

  const LeadCut({this.key, required this.label, required this.leads, required this.paid, this.conversion});

  factory LeadCut.fromJson(Map<String, dynamic> json) => LeadCut(key: json['key'] == null ? null : json['key'] as String, label: json['label'] as String, leads: (json['leads'] as num).toInt(), paid: (json['paid'] as num).toInt(), conversion: json['conversion'] == null ? null : (json['conversion'] as num).toDouble());

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'leads': leads, 'paid': paid, 'conversion': conversion};
}

class LeadShare {
  final String label;
  final int count;
  final double? share;

  const LeadShare({required this.label, required this.count, this.share});

  factory LeadShare.fromJson(Map<String, dynamic> json) => LeadShare(label: json['label'] as String, count: (json['count'] as num).toInt(), share: json['share'] == null ? null : (json['share'] as num).toDouble());

  Map<String, dynamic> toJson() => {'label': label, 'count': count, 'share': share};
}

class LeadStats {
  final MoneyPeriod period;
  final List<Choice> managers;
  final String? managerId;
  final bool showSpend;
  final LeadStatsTotals totals;
  final List<LeadStatsDaily> daily;
  final List<LeadStatsStages> stages;
  final List<LeadShare> lost;
  final List<LeadCut> bySource;
  final List<LeadStatsBuyersBySource> buyersBySource;
  final List<LeadCut> byManager;
  final List<LeadCut> byRecipient;
  final List<LeadCut> byOccasion;
  final List<LeadCut> byLeadTime;
  final List<LeadCut> byWeekday;
  final List<LeadCut> byHour;
  final List<LeadShare> payDelay;

  const LeadStats({required this.period, required this.managers, this.managerId, required this.showSpend, required this.totals, required this.daily, required this.stages, required this.lost, required this.bySource, required this.buyersBySource, required this.byManager, required this.byRecipient, required this.byOccasion, required this.byLeadTime, required this.byWeekday, required this.byHour, required this.payDelay});

  factory LeadStats.fromJson(Map<String, dynamic> json) => LeadStats(period: MoneyPeriod.fromJson(json['period'] as Map<String, dynamic>), managers: (json['managers'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), managerId: json['managerId'] == null ? null : json['managerId'] as String, showSpend: json['showSpend'] as bool, totals: LeadStatsTotals.fromJson(json['totals'] as Map<String, dynamic>), daily: (json['daily'] as List).map((e) => LeadStatsDaily.fromJson(e as Map<String, dynamic>)).toList(), stages: (json['stages'] as List).map((e) => LeadStatsStages.fromJson(e as Map<String, dynamic>)).toList(), lost: (json['lost'] as List).map((e) => LeadShare.fromJson(e as Map<String, dynamic>)).toList(), bySource: (json['bySource'] as List).map((e) => LeadCut.fromJson(e as Map<String, dynamic>)).toList(), buyersBySource: (json['buyersBySource'] as List).map((e) => LeadStatsBuyersBySource.fromJson(e as Map<String, dynamic>)).toList(), byManager: (json['byManager'] as List).map((e) => LeadCut.fromJson(e as Map<String, dynamic>)).toList(), byRecipient: (json['byRecipient'] as List).map((e) => LeadCut.fromJson(e as Map<String, dynamic>)).toList(), byOccasion: (json['byOccasion'] as List).map((e) => LeadCut.fromJson(e as Map<String, dynamic>)).toList(), byLeadTime: (json['byLeadTime'] as List).map((e) => LeadCut.fromJson(e as Map<String, dynamic>)).toList(), byWeekday: (json['byWeekday'] as List).map((e) => LeadCut.fromJson(e as Map<String, dynamic>)).toList(), byHour: (json['byHour'] as List).map((e) => LeadCut.fromJson(e as Map<String, dynamic>)).toList(), payDelay: (json['payDelay'] as List).map((e) => LeadShare.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'period': period.toJson(), 'managers': managers.map((e) => e.toJson()).toList(), 'managerId': managerId, 'showSpend': showSpend, 'totals': totals.toJson(), 'daily': daily.map((e) => e.toJson()).toList(), 'stages': stages.map((e) => e.toJson()).toList(), 'lost': lost.map((e) => e.toJson()).toList(), 'bySource': bySource.map((e) => e.toJson()).toList(), 'buyersBySource': buyersBySource.map((e) => e.toJson()).toList(), 'byManager': byManager.map((e) => e.toJson()).toList(), 'byRecipient': byRecipient.map((e) => e.toJson()).toList(), 'byOccasion': byOccasion.map((e) => e.toJson()).toList(), 'byLeadTime': byLeadTime.map((e) => e.toJson()).toList(), 'byWeekday': byWeekday.map((e) => e.toJson()).toList(), 'byHour': byHour.map((e) => e.toJson()).toList(), 'payDelay': payDelay.map((e) => e.toJson()).toList()};
}

class LeadStatsTotals {
  final int leads;
  final int junk;
  final int paid;
  final double? conversion;
  final int open;
  final int lost;
  final int repeat;
  final int? avgCheck;
  final double? medianHours;
  final int payments;
  final int paymentsFirst;
  final int paymentsAgreed;
  final int invoices;
  final int spend;
  final int? cpl;
  final int? cac;
  final double? roas;
  final double? roasAgreed;
  final double? adShare;
  final double? deltaLeads;
  final double? deltaPaid;
  final double? deltaConversion;

  const LeadStatsTotals({required this.leads, required this.junk, required this.paid, this.conversion, required this.open, required this.lost, required this.repeat, this.avgCheck, this.medianHours, required this.payments, required this.paymentsFirst, required this.paymentsAgreed, required this.invoices, required this.spend, this.cpl, this.cac, this.roas, this.roasAgreed, this.adShare, this.deltaLeads, this.deltaPaid, this.deltaConversion});

  factory LeadStatsTotals.fromJson(Map<String, dynamic> json) => LeadStatsTotals(leads: (json['leads'] as num).toInt(), junk: (json['junk'] as num).toInt(), paid: (json['paid'] as num).toInt(), conversion: json['conversion'] == null ? null : (json['conversion'] as num).toDouble(), open: (json['open'] as num).toInt(), lost: (json['lost'] as num).toInt(), repeat: (json['repeat'] as num).toInt(), avgCheck: json['avgCheck'] == null ? null : (json['avgCheck'] as num).toInt(), medianHours: json['medianHours'] == null ? null : (json['medianHours'] as num).toDouble(), payments: (json['payments'] as num).toInt(), paymentsFirst: (json['paymentsFirst'] as num).toInt(), paymentsAgreed: (json['paymentsAgreed'] as num).toInt(), invoices: (json['invoices'] as num).toInt(), spend: (json['spend'] as num).toInt(), cpl: json['cpl'] == null ? null : (json['cpl'] as num).toInt(), cac: json['cac'] == null ? null : (json['cac'] as num).toInt(), roas: json['roas'] == null ? null : (json['roas'] as num).toDouble(), roasAgreed: json['roasAgreed'] == null ? null : (json['roasAgreed'] as num).toDouble(), adShare: json['adShare'] == null ? null : (json['adShare'] as num).toDouble(), deltaLeads: json['deltaLeads'] == null ? null : (json['deltaLeads'] as num).toDouble(), deltaPaid: json['deltaPaid'] == null ? null : (json['deltaPaid'] as num).toDouble(), deltaConversion: json['deltaConversion'] == null ? null : (json['deltaConversion'] as num).toDouble());

  Map<String, dynamic> toJson() => {'leads': leads, 'junk': junk, 'paid': paid, 'conversion': conversion, 'open': open, 'lost': lost, 'repeat': repeat, 'avgCheck': avgCheck, 'medianHours': medianHours, 'payments': payments, 'paymentsFirst': paymentsFirst, 'paymentsAgreed': paymentsAgreed, 'invoices': invoices, 'spend': spend, 'cpl': cpl, 'cac': cac, 'roas': roas, 'roasAgreed': roasAgreed, 'adShare': adShare, 'deltaLeads': deltaLeads, 'deltaPaid': deltaPaid, 'deltaConversion': deltaConversion};
}

class LeadStatsDaily {
  final String day;
  final int leads;
  final int junk;
  final int invoices;
  final int payments;
  final int first;
  final int agreed;
  final int spend;
  final double? conversion;
  final int? cpl;
  final int? cac;
  final double? roas;

  const LeadStatsDaily({required this.day, required this.leads, required this.junk, required this.invoices, required this.payments, required this.first, required this.agreed, required this.spend, this.conversion, this.cpl, this.cac, this.roas});

  factory LeadStatsDaily.fromJson(Map<String, dynamic> json) => LeadStatsDaily(day: json['day'] as String, leads: (json['leads'] as num).toInt(), junk: (json['junk'] as num).toInt(), invoices: (json['invoices'] as num).toInt(), payments: (json['payments'] as num).toInt(), first: (json['first'] as num).toInt(), agreed: (json['agreed'] as num).toInt(), spend: (json['spend'] as num).toInt(), conversion: json['conversion'] == null ? null : (json['conversion'] as num).toDouble(), cpl: json['cpl'] == null ? null : (json['cpl'] as num).toInt(), cac: json['cac'] == null ? null : (json['cac'] as num).toInt(), roas: json['roas'] == null ? null : (json['roas'] as num).toDouble());

  Map<String, dynamic> toJson() => {'day': day, 'leads': leads, 'junk': junk, 'invoices': invoices, 'payments': payments, 'first': first, 'agreed': agreed, 'spend': spend, 'conversion': conversion, 'cpl': cpl, 'cac': cac, 'roas': roas};
}

class LeadStatsStages {
  final String key;
  final String label;
  final String kind;
  final String pipeline;
  final int count;
  final double? share;
  final int paid;

  const LeadStatsStages({required this.key, required this.label, required this.kind, required this.pipeline, required this.count, this.share, required this.paid});

  factory LeadStatsStages.fromJson(Map<String, dynamic> json) => LeadStatsStages(key: json['key'] as String, label: json['label'] as String, kind: json['kind'] as String, pipeline: json['pipeline'] as String, count: (json['count'] as num).toInt(), share: json['share'] == null ? null : (json['share'] as num).toDouble(), paid: (json['paid'] as num).toInt());

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'kind': kind, 'pipeline': pipeline, 'count': count, 'share': share, 'paid': paid};
}

class LeadStatsBuyersBySource {
  final String key;
  final String label;
  final int buyers;
  final int agreed;
  final int received;
  final double? share;

  const LeadStatsBuyersBySource({required this.key, required this.label, required this.buyers, required this.agreed, required this.received, this.share});

  factory LeadStatsBuyersBySource.fromJson(Map<String, dynamic> json) => LeadStatsBuyersBySource(key: json['key'] as String, label: json['label'] as String, buyers: (json['buyers'] as num).toInt(), agreed: (json['agreed'] as num).toInt(), received: (json['received'] as num).toInt(), share: json['share'] == null ? null : (json['share'] as num).toDouble());

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'buyers': buyers, 'agreed': agreed, 'received': received, 'share': share};
}

class CrmSalesSettings {
  final bool canManage;
  final List<int> workDays;
  final String from;
  final String to;
  final String off;
  final int slaMinutes;
  final int reassignMinutes;
  final String autoDealFrom;
  final List<Choice> autoDealOptions;
  final int mergeClosedDays;
  final int maxDiscount;
  final bool unsorted;
  final bool digest;
  final bool autoLetters;
  final bool chatReward;
  final bool widgetEnabled;
  final bool widgetChat;
  final bool widgetHelp;
  final String botMode;
  final List<CrmSalesSettingsBotModes> botModes;

  const CrmSalesSettings({required this.canManage, required this.workDays, required this.from, required this.to, required this.off, required this.slaMinutes, required this.reassignMinutes, required this.autoDealFrom, required this.autoDealOptions, required this.mergeClosedDays, required this.maxDiscount, required this.unsorted, required this.digest, required this.autoLetters, required this.chatReward, required this.widgetEnabled, required this.widgetChat, required this.widgetHelp, required this.botMode, required this.botModes});

  factory CrmSalesSettings.fromJson(Map<String, dynamic> json) => CrmSalesSettings(canManage: json['canManage'] as bool, workDays: (json['workDays'] as List).map((e) => (e as num).toInt()).toList(), from: json['from'] as String, to: json['to'] as String, off: json['off'] as String, slaMinutes: (json['slaMinutes'] as num).toInt(), reassignMinutes: (json['reassignMinutes'] as num).toInt(), autoDealFrom: json['autoDealFrom'] as String, autoDealOptions: (json['autoDealOptions'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), mergeClosedDays: (json['mergeClosedDays'] as num).toInt(), maxDiscount: (json['maxDiscount'] as num).toInt(), unsorted: json['unsorted'] as bool, digest: json['digest'] as bool, autoLetters: json['autoLetters'] as bool, chatReward: json['chatReward'] as bool, widgetEnabled: json['widgetEnabled'] as bool, widgetChat: json['widgetChat'] as bool, widgetHelp: json['widgetHelp'] as bool, botMode: json['botMode'] as String, botModes: (json['botModes'] as List).map((e) => CrmSalesSettingsBotModes.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'canManage': canManage, 'workDays': workDays.map((e) => e).toList(), 'from': from, 'to': to, 'off': off, 'slaMinutes': slaMinutes, 'reassignMinutes': reassignMinutes, 'autoDealFrom': autoDealFrom, 'autoDealOptions': autoDealOptions.map((e) => e.toJson()).toList(), 'mergeClosedDays': mergeClosedDays, 'maxDiscount': maxDiscount, 'unsorted': unsorted, 'digest': digest, 'autoLetters': autoLetters, 'chatReward': chatReward, 'widgetEnabled': widgetEnabled, 'widgetChat': widgetChat, 'widgetHelp': widgetHelp, 'botMode': botMode, 'botModes': botModes.map((e) => e.toJson()).toList()};
}

class CrmSalesSettingsBotModes {
  final String id;
  final String label;
  final String hint;

  const CrmSalesSettingsBotModes({required this.id, required this.label, required this.hint});

  factory CrmSalesSettingsBotModes.fromJson(Map<String, dynamic> json) => CrmSalesSettingsBotModes(id: json['id'] as String, label: json['label'] as String, hint: json['hint'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'label': label, 'hint': hint};
}

class CrmSalesSettingsBody {
  final List<int> workDays;
  final String from;
  final String to;
  final String off;
  final int slaMinutes;
  final int reassignMinutes;
  /// off | registered | book_started | book_half | book_ready
  final String autoDealFrom;
  final int mergeClosedDays;
  final int maxDiscount;
  final bool unsorted;
  final bool digest;
  final bool autoLetters;
  final bool chatReward;
  final bool widgetEnabled;
  final bool widgetChat;
  final bool widgetHelp;

  const CrmSalesSettingsBody({required this.workDays, required this.from, required this.to, required this.off, required this.slaMinutes, required this.reassignMinutes, required this.autoDealFrom, required this.mergeClosedDays, required this.maxDiscount, required this.unsorted, required this.digest, required this.autoLetters, required this.chatReward, required this.widgetEnabled, required this.widgetChat, required this.widgetHelp});

  factory CrmSalesSettingsBody.fromJson(Map<String, dynamic> json) => CrmSalesSettingsBody(workDays: (json['workDays'] as List).map((e) => (e as num).toInt()).toList(), from: json['from'] as String, to: json['to'] as String, off: json['off'] as String, slaMinutes: (json['slaMinutes'] as num).toInt(), reassignMinutes: (json['reassignMinutes'] as num).toInt(), autoDealFrom: json['autoDealFrom'] as String, mergeClosedDays: (json['mergeClosedDays'] as num).toInt(), maxDiscount: (json['maxDiscount'] as num).toInt(), unsorted: json['unsorted'] as bool, digest: json['digest'] as bool, autoLetters: json['autoLetters'] as bool, chatReward: json['chatReward'] as bool, widgetEnabled: json['widgetEnabled'] as bool, widgetChat: json['widgetChat'] as bool, widgetHelp: json['widgetHelp'] as bool);

  Map<String, dynamic> toJson() => {'workDays': workDays.map((e) => e).toList(), 'from': from, 'to': to, 'off': off, 'slaMinutes': slaMinutes, 'reassignMinutes': reassignMinutes, 'autoDealFrom': autoDealFrom, 'mergeClosedDays': mergeClosedDays, 'maxDiscount': maxDiscount, 'unsorted': unsorted, 'digest': digest, 'autoLetters': autoLetters, 'chatReward': chatReward, 'widgetEnabled': widgetEnabled, 'widgetChat': widgetChat, 'widgetHelp': widgetHelp};
}

class BotModeBody {
  /// off | fallback | off_hours | always
  final String mode;

  const BotModeBody({required this.mode});

  factory BotModeBody.fromJson(Map<String, dynamic> json) => BotModeBody(mode: json['mode'] as String);

  Map<String, dynamic> toJson() => {'mode': mode};
}

class PromoRow {
  final String id;
  final String code;
  final String discount;
  final bool active;
  final int used;
  final int? maxUses;
  final String until;
  final String note;
  final int paid;
  final int revenue;

  const PromoRow({required this.id, required this.code, required this.discount, required this.active, required this.used, this.maxUses, required this.until, required this.note, required this.paid, required this.revenue});

  factory PromoRow.fromJson(Map<String, dynamic> json) => PromoRow(id: json['id'] as String, code: json['code'] as String, discount: json['discount'] as String, active: json['active'] as bool, used: (json['used'] as num).toInt(), maxUses: json['maxUses'] == null ? null : (json['maxUses'] as num).toInt(), until: json['until'] as String, note: json['note'] as String, paid: (json['paid'] as num).toInt(), revenue: (json['revenue'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'code': code, 'discount': discount, 'active': active, 'used': used, 'maxUses': maxUses, 'until': until, 'note': note, 'paid': paid, 'revenue': revenue};
}

class Promos {
  final List<PromoRow> rows;
  final PromosTotals totals;

  const Promos({required this.rows, required this.totals});

  factory Promos.fromJson(Map<String, dynamic> json) => Promos(rows: (json['rows'] as List).map((e) => PromoRow.fromJson(e as Map<String, dynamic>)).toList(), totals: PromosTotals.fromJson(json['totals'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'rows': rows.map((e) => e.toJson()).toList(), 'totals': totals.toJson()};
}

class PromosTotals {
  final int count;
  final int active;
  final int used;
  final int paid;
  final int revenue;

  const PromosTotals({required this.count, required this.active, required this.used, required this.paid, required this.revenue});

  factory PromosTotals.fromJson(Map<String, dynamic> json) => PromosTotals(count: (json['count'] as num).toInt(), active: (json['active'] as num).toInt(), used: (json['used'] as num).toInt(), paid: (json['paid'] as num).toInt(), revenue: (json['revenue'] as num).toInt());

  Map<String, dynamic> toJson() => {'count': count, 'active': active, 'used': used, 'paid': paid, 'revenue': revenue};
}

class PromoBody {
  final String code;
  /// percent | fixed
  final String kind;
  final int value;
  final int? maxUses;
  final String? expiresAt;
  final String? note;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const PromoBody({required this.code, required this.kind, required this.value, this.maxUses, this.expiresAt, this.note, this.nulls = const {}});

  factory PromoBody.fromJson(Map<String, dynamic> json) => PromoBody(code: json['code'] as String, kind: json['kind'] as String, value: (json['value'] as num).toInt(), maxUses: json['maxUses'] == null ? null : (json['maxUses'] as num).toInt(), expiresAt: json['expiresAt'] == null ? null : json['expiresAt'] as String, note: json['note'] == null ? null : json['note'] as String);

  Map<String, dynamic> toJson() => {'code': code, 'kind': kind, 'value': value, if (maxUses != null || nulls.contains('maxUses')) 'maxUses': maxUses, if (expiresAt != null || nulls.contains('expiresAt')) 'expiresAt': expiresAt, if (note != null) 'note': note!};
}

class GiftRow {
  final String id;
  final int number;
  /// pending_payment | paid | cancelled
  final String status;
  final String statusLabel;
  final int amount;
  final String plan;
  final String buyer;
  final String buyerContact;
  final String recipient;
  final String delivery;
  final String createdLabel;
  final bool claimed;
  final String? code;
  final bool redeemed;
  final bool canResend;
  final String? receiptUrl;

  const GiftRow({required this.id, required this.number, required this.status, required this.statusLabel, required this.amount, required this.plan, required this.buyer, required this.buyerContact, required this.recipient, required this.delivery, required this.createdLabel, required this.claimed, this.code, required this.redeemed, required this.canResend, this.receiptUrl});

  factory GiftRow.fromJson(Map<String, dynamic> json) => GiftRow(id: json['id'] as String, number: (json['number'] as num).toInt(), status: json['status'] as String, statusLabel: json['statusLabel'] as String, amount: (json['amount'] as num).toInt(), plan: json['plan'] as String, buyer: json['buyer'] as String, buyerContact: json['buyerContact'] as String, recipient: json['recipient'] as String, delivery: json['delivery'] as String, createdLabel: json['createdLabel'] as String, claimed: json['claimed'] as bool, code: json['code'] == null ? null : json['code'] as String, redeemed: json['redeemed'] as bool, canResend: json['canResend'] as bool, receiptUrl: json['receiptUrl'] == null ? null : json['receiptUrl'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'status': status, 'statusLabel': statusLabel, 'amount': amount, 'plan': plan, 'buyer': buyer, 'buyerContact': buyerContact, 'recipient': recipient, 'delivery': delivery, 'createdLabel': createdLabel, 'claimed': claimed, 'code': code, 'redeemed': redeemed, 'canResend': canResend, 'receiptUrl': receiptUrl};
}

class Gifts {
  final List<GiftRow> waiting;
  final List<GiftRow> register;
  final GiftsTotals totals;

  const Gifts({required this.waiting, required this.register, required this.totals});

  factory Gifts.fromJson(Map<String, dynamic> json) => Gifts(waiting: (json['waiting'] as List).map((e) => GiftRow.fromJson(e as Map<String, dynamic>)).toList(), register: (json['register'] as List).map((e) => GiftRow.fromJson(e as Map<String, dynamic>)).toList(), totals: GiftsTotals.fromJson(json['totals'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'waiting': waiting.map((e) => e.toJson()).toList(), 'register': register.map((e) => e.toJson()).toList(), 'totals': totals.toJson()};
}

class GiftsTotals {
  final int paid;
  final int redeemed;
  final int revenue;
  final int claimed;

  const GiftsTotals({required this.paid, required this.redeemed, required this.revenue, required this.claimed});

  factory GiftsTotals.fromJson(Map<String, dynamic> json) => GiftsTotals(paid: (json['paid'] as num).toInt(), redeemed: (json['redeemed'] as num).toInt(), revenue: (json['revenue'] as num).toInt(), claimed: (json['claimed'] as num).toInt());

  Map<String, dynamic> toJson() => {'paid': paid, 'redeemed': redeemed, 'revenue': revenue, 'claimed': claimed};
}

class ReviewRow {
  final String id;
  /// new | published | hidden
  final String status;
  final int rating;
  final String text;
  final String author;
  final String city;
  final String theme;
  final String locale;
  final bool featured;
  final String? blocker;
  final String? photoUrl;
  final String? orderId;
  final int? orderNumber;
  final String? thankYouCode;
  final String createdLabel;

  const ReviewRow({required this.id, required this.status, required this.rating, required this.text, required this.author, required this.city, required this.theme, required this.locale, required this.featured, this.blocker, this.photoUrl, this.orderId, this.orderNumber, this.thankYouCode, required this.createdLabel});

  factory ReviewRow.fromJson(Map<String, dynamic> json) => ReviewRow(id: json['id'] as String, status: json['status'] as String, rating: (json['rating'] as num).toInt(), text: json['text'] as String, author: json['author'] as String, city: json['city'] as String, theme: json['theme'] as String, locale: json['locale'] as String, featured: json['featured'] as bool, blocker: json['blocker'] == null ? null : json['blocker'] as String, photoUrl: json['photoUrl'] == null ? null : json['photoUrl'] as String, orderId: json['orderId'] == null ? null : json['orderId'] as String, orderNumber: json['orderNumber'] == null ? null : (json['orderNumber'] as num).toInt(), thankYouCode: json['thankYouCode'] == null ? null : json['thankYouCode'] as String, createdLabel: json['createdLabel'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'status': status, 'rating': rating, 'text': text, 'author': author, 'city': city, 'theme': theme, 'locale': locale, 'featured': featured, 'blocker': blocker, 'photoUrl': photoUrl, 'orderId': orderId, 'orderNumber': orderNumber, 'thankYouCode': thankYouCode, 'createdLabel': createdLabel};
}

class Reviews {
  final List<ReviewRow> rows;
  final ReviewsCounts counts;
  final String average;
  final String filter;

  const Reviews({required this.rows, required this.counts, required this.average, required this.filter});

  factory Reviews.fromJson(Map<String, dynamic> json) => Reviews(rows: (json['rows'] as List).map((e) => ReviewRow.fromJson(e as Map<String, dynamic>)).toList(), counts: ReviewsCounts.fromJson(json['counts'] as Map<String, dynamic>), average: json['average'] as String, filter: json['filter'] as String);

  Map<String, dynamic> toJson() => {'rows': rows.map((e) => e.toJson()).toList(), 'counts': counts.toJson(), 'average': average, 'filter': filter};
}

class ReviewsCounts {
  final int waiting;
  final int published;
  final int hidden;

  const ReviewsCounts({required this.waiting, required this.published, required this.hidden});

  factory ReviewsCounts.fromJson(Map<String, dynamic> json) => ReviewsCounts(waiting: (json['waiting'] as num).toInt(), published: (json['published'] as num).toInt(), hidden: (json['hidden'] as num).toInt());

  Map<String, dynamic> toJson() => {'waiting': waiting, 'published': published, 'hidden': hidden};
}

class ChannelStat {
  final String key;
  final String label;
  final int clicks;
  final int leads;
  final int registrations;
  final int startedBook;
  final int sales;
  final int revenue;
  final int spend;
  final String conversion;
  final String costPerLead;
  final String romi;

  const ChannelStat({required this.key, required this.label, required this.clicks, required this.leads, required this.registrations, required this.startedBook, required this.sales, required this.revenue, required this.spend, required this.conversion, required this.costPerLead, required this.romi});

  factory ChannelStat.fromJson(Map<String, dynamic> json) => ChannelStat(key: json['key'] as String, label: json['label'] as String, clicks: (json['clicks'] as num).toInt(), leads: (json['leads'] as num).toInt(), registrations: (json['registrations'] as num).toInt(), startedBook: (json['startedBook'] as num).toInt(), sales: (json['sales'] as num).toInt(), revenue: (json['revenue'] as num).toInt(), spend: (json['spend'] as num).toInt(), conversion: json['conversion'] as String, costPerLead: json['costPerLead'] as String, romi: json['romi'] as String);

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'clicks': clicks, 'leads': leads, 'registrations': registrations, 'startedBook': startedBook, 'sales': sales, 'revenue': revenue, 'spend': spend, 'conversion': conversion, 'costPerLead': costPerLead, 'romi': romi};
}

class MarketingLink {
  final String id;
  final String name;
  final String slug;
  final String shortUrl;
  final String target;
  final String fullUrl;
  final bool archived;
  final String createdLabel;
  final int clicks;
  final int leads;
  final int registrations;
  final int sales;
  final int revenue;

  const MarketingLink({required this.id, required this.name, required this.slug, required this.shortUrl, required this.target, required this.fullUrl, required this.archived, required this.createdLabel, required this.clicks, required this.leads, required this.registrations, required this.sales, required this.revenue});

  factory MarketingLink.fromJson(Map<String, dynamic> json) => MarketingLink(id: json['id'] as String, name: json['name'] as String, slug: json['slug'] as String, shortUrl: json['shortUrl'] as String, target: json['target'] as String, fullUrl: json['fullUrl'] as String, archived: json['archived'] as bool, createdLabel: json['createdLabel'] as String, clicks: (json['clicks'] as num).toInt(), leads: (json['leads'] as num).toInt(), registrations: (json['registrations'] as num).toInt(), sales: (json['sales'] as num).toInt(), revenue: (json['revenue'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'slug': slug, 'shortUrl': shortUrl, 'target': target, 'fullUrl': fullUrl, 'archived': archived, 'createdLabel': createdLabel, 'clicks': clicks, 'leads': leads, 'registrations': registrations, 'sales': sales, 'revenue': revenue};
}

class MarketingReport {
  final int period;
  final ChannelStat total;
  final List<ChannelStat> channels;
  final List<MarketingLink> links;
  final bool archived;
  final bool showAnalytics;
  final bool canManage;
  final List<MarketingReportPages> pages;

  const MarketingReport({required this.period, required this.total, required this.channels, required this.links, required this.archived, required this.showAnalytics, required this.canManage, required this.pages});

  factory MarketingReport.fromJson(Map<String, dynamic> json) => MarketingReport(period: (json['period'] as num).toInt(), total: ChannelStat.fromJson(json['total'] as Map<String, dynamic>), channels: (json['channels'] as List).map((e) => ChannelStat.fromJson(e as Map<String, dynamic>)).toList(), links: (json['links'] as List).map((e) => MarketingLink.fromJson(e as Map<String, dynamic>)).toList(), archived: json['archived'] as bool, showAnalytics: json['showAnalytics'] as bool, canManage: json['canManage'] as bool, pages: (json['pages'] as List).map((e) => MarketingReportPages.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'period': period, 'total': total.toJson(), 'channels': channels.map((e) => e.toJson()).toList(), 'links': links.map((e) => e.toJson()).toList(), 'archived': archived, 'showAnalytics': showAnalytics, 'canManage': canManage, 'pages': pages.map((e) => e.toJson()).toList()};
}

class MarketingReportPages {
  final String path;
  final String label;

  const MarketingReportPages({required this.path, required this.label});

  factory MarketingReportPages.fromJson(Map<String, dynamic> json) => MarketingReportPages(path: json['path'] as String, label: json['label'] as String);

  Map<String, dynamic> toJson() => {'path': path, 'label': label};
}

class MarketingLinkBody {
  final String name;
  /// site | whatsapp
  final String kind;
  final String targetPath;
  final String waText;
  final String utmSource;
  final String utmMedium;
  final String utmCampaign;
  final String utmContent;

  const MarketingLinkBody({required this.name, required this.kind, required this.targetPath, required this.waText, required this.utmSource, required this.utmMedium, required this.utmCampaign, required this.utmContent});

  factory MarketingLinkBody.fromJson(Map<String, dynamic> json) => MarketingLinkBody(name: json['name'] as String, kind: json['kind'] as String, targetPath: json['targetPath'] as String, waText: json['waText'] as String, utmSource: json['utmSource'] as String, utmMedium: json['utmMedium'] as String, utmCampaign: json['utmCampaign'] as String, utmContent: json['utmContent'] as String);

  Map<String, dynamic> toJson() => {'name': name, 'kind': kind, 'targetPath': targetPath, 'waText': waText, 'utmSource': utmSource, 'utmMedium': utmMedium, 'utmCampaign': utmCampaign, 'utmContent': utmContent};
}

class DesignAiReport {
  final int days;
  final bool enabled;
  final int freeLimit;
  final bool canEdit;
  final DesignAiReportTotals totals;
  final DesignAiReportPeople people;
  final DesignAiReportPurchases purchases;
  final List<DesignAiReportByMode> byMode;
  final List<DesignAiReportByDay> byDay;
  final List<DesignAiReportUsers> users;

  const DesignAiReport({required this.days, required this.enabled, required this.freeLimit, required this.canEdit, required this.totals, required this.people, required this.purchases, required this.byMode, required this.byDay, required this.users});

  factory DesignAiReport.fromJson(Map<String, dynamic> json) => DesignAiReport(days: (json['days'] as num).toInt(), enabled: json['enabled'] as bool, freeLimit: (json['freeLimit'] as num).toInt(), canEdit: json['canEdit'] as bool, totals: DesignAiReportTotals.fromJson(json['totals'] as Map<String, dynamic>), people: DesignAiReportPeople.fromJson(json['people'] as Map<String, dynamic>), purchases: DesignAiReportPurchases.fromJson(json['purchases'] as Map<String, dynamic>), byMode: (json['byMode'] as List).map((e) => DesignAiReportByMode.fromJson(e as Map<String, dynamic>)).toList(), byDay: (json['byDay'] as List).map((e) => DesignAiReportByDay.fromJson(e as Map<String, dynamic>)).toList(), users: (json['users'] as List).map((e) => DesignAiReportUsers.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'days': days, 'enabled': enabled, 'freeLimit': freeLimit, 'canEdit': canEdit, 'totals': totals.toJson(), 'people': people.toJson(), 'purchases': purchases.toJson(), 'byMode': byMode.map((e) => e.toJson()).toList(), 'byDay': byDay.map((e) => e.toJson()).toList(), 'users': users.map((e) => e.toJson()).toList()};
}

class DesignAiReportTotals {
  final int ok;
  final int failed;
  final int users;
  final int free;
  final int credit;
  final double costUsd;
  final double? avgSeconds;

  const DesignAiReportTotals({required this.ok, required this.failed, required this.users, required this.free, required this.credit, required this.costUsd, this.avgSeconds});

  factory DesignAiReportTotals.fromJson(Map<String, dynamic> json) => DesignAiReportTotals(ok: (json['ok'] as num).toInt(), failed: (json['failed'] as num).toInt(), users: (json['users'] as num).toInt(), free: (json['free'] as num).toInt(), credit: (json['credit'] as num).toInt(), costUsd: (json['costUsd'] as num).toDouble(), avgSeconds: json['avgSeconds'] == null ? null : (json['avgSeconds'] as num).toDouble());

  Map<String, dynamic> toJson() => {'ok': ok, 'failed': failed, 'users': users, 'free': free, 'credit': credit, 'costUsd': costUsd, 'avgSeconds': avgSeconds};
}

class DesignAiReportPeople {
  final int used;
  final int hitLimit;
  final int withCredits;
  final int creditsLeft;

  const DesignAiReportPeople({required this.used, required this.hitLimit, required this.withCredits, required this.creditsLeft});

  factory DesignAiReportPeople.fromJson(Map<String, dynamic> json) => DesignAiReportPeople(used: (json['used'] as num).toInt(), hitLimit: (json['hitLimit'] as num).toInt(), withCredits: (json['withCredits'] as num).toInt(), creditsLeft: (json['creditsLeft'] as num).toInt());

  Map<String, dynamic> toJson() => {'used': used, 'hitLimit': hitLimit, 'withCredits': withCredits, 'creditsLeft': creditsLeft};
}

class DesignAiReportPurchases {
  final int paid;
  final int paidAmount;
  final int pending;
  final int pendingAmount;

  const DesignAiReportPurchases({required this.paid, required this.paidAmount, required this.pending, required this.pendingAmount});

  factory DesignAiReportPurchases.fromJson(Map<String, dynamic> json) => DesignAiReportPurchases(paid: (json['paid'] as num).toInt(), paidAmount: (json['paidAmount'] as num).toInt(), pending: (json['pending'] as num).toInt(), pendingAmount: (json['pendingAmount'] as num).toInt());

  Map<String, dynamic> toJson() => {'paid': paid, 'paidAmount': paidAmount, 'pending': pending, 'pendingAmount': pendingAmount};
}

class DesignAiReportByMode {
  final String key;
  final String label;
  final int requests;
  final double costUsd;

  const DesignAiReportByMode({required this.key, required this.label, required this.requests, required this.costUsd});

  factory DesignAiReportByMode.fromJson(Map<String, dynamic> json) => DesignAiReportByMode(key: json['key'] as String, label: json['label'] as String, requests: (json['requests'] as num).toInt(), costUsd: (json['costUsd'] as num).toDouble());

  Map<String, dynamic> toJson() => {'key': key, 'label': label, 'requests': requests, 'costUsd': costUsd};
}

class DesignAiReportByDay {
  final String day;
  final int requests;
  final int users;

  const DesignAiReportByDay({required this.day, required this.requests, required this.users});

  factory DesignAiReportByDay.fromJson(Map<String, dynamic> json) => DesignAiReportByDay(day: json['day'] as String, requests: (json['requests'] as num).toInt(), users: (json['users'] as num).toInt());

  Map<String, dynamic> toJson() => {'day': day, 'requests': requests, 'users': users};
}

class DesignAiReportUsers {
  final String userId;
  final String name;
  final String email;
  final int requests;
  final int free;
  final int credit;
  final int credits;
  final String lastLabel;

  const DesignAiReportUsers({required this.userId, required this.name, required this.email, required this.requests, required this.free, required this.credit, required this.credits, required this.lastLabel});

  factory DesignAiReportUsers.fromJson(Map<String, dynamic> json) => DesignAiReportUsers(userId: json['userId'] as String, name: json['name'] as String, email: json['email'] as String, requests: (json['requests'] as num).toInt(), free: (json['free'] as num).toInt(), credit: (json['credit'] as num).toInt(), credits: (json['credits'] as num).toInt(), lastLabel: json['lastLabel'] as String);

  Map<String, dynamic> toJson() => {'userId': userId, 'name': name, 'email': email, 'requests': requests, 'free': free, 'credit': credit, 'credits': credits, 'lastLabel': lastLabel};
}

class DesignAiGrantBody {
  final String userId;
  final int count;

  const DesignAiGrantBody({required this.userId, required this.count});

  factory DesignAiGrantBody.fromJson(Map<String, dynamic> json) => DesignAiGrantBody(userId: json['userId'] as String, count: (json['count'] as num).toInt());

  Map<String, dynamic> toJson() => {'userId': userId, 'count': count};
}

class DesignAiLimitBody {
  final int limit;

  const DesignAiLimitBody({required this.limit});

  factory DesignAiLimitBody.fromJson(Map<String, dynamic> json) => DesignAiLimitBody(limit: (json['limit'] as num).toInt());

  Map<String, dynamic> toJson() => {'limit': limit};
}

class ArchiveBody {
  final bool archived;

  const ArchiveBody({required this.archived});

  factory ArchiveBody.fromJson(Map<String, dynamic> json) => ArchiveBody(archived: json['archived'] as bool);

  Map<String, dynamic> toJson() => {'archived': archived};
}

class BookRow {
  final String bookId;
  final String title;
  final String line;
  final String ownerId;
  final String owner;
  final String status;
  final double progress;
  final String progressText;
  final int idleDays;
  final bool stale;
  final int photos;
  final String? occasion;
  final String? remindedLabel;
  final String? dealId;
  final int? dealNumber;

  const BookRow({required this.bookId, required this.title, required this.line, required this.ownerId, required this.owner, required this.status, required this.progress, required this.progressText, required this.idleDays, required this.stale, required this.photos, this.occasion, this.remindedLabel, this.dealId, this.dealNumber});

  factory BookRow.fromJson(Map<String, dynamic> json) => BookRow(bookId: json['bookId'] as String, title: json['title'] as String, line: json['line'] as String, ownerId: json['ownerId'] as String, owner: json['owner'] as String, status: json['status'] as String, progress: (json['progress'] as num).toDouble(), progressText: json['progressText'] as String, idleDays: (json['idleDays'] as num).toInt(), stale: json['stale'] as bool, photos: (json['photos'] as num).toInt(), occasion: json['occasion'] == null ? null : json['occasion'] as String, remindedLabel: json['remindedLabel'] == null ? null : json['remindedLabel'] as String, dealId: json['dealId'] == null ? null : json['dealId'] as String, dealNumber: json['dealNumber'] == null ? null : (json['dealNumber'] as num).toInt());

  Map<String, dynamic> toJson() => {'bookId': bookId, 'title': title, 'line': line, 'ownerId': ownerId, 'owner': owner, 'status': status, 'progress': progress, 'progressText': progressText, 'idleDays': idleDays, 'stale': stale, 'photos': photos, 'occasion': occasion, 'remindedLabel': remindedLabel, 'dealId': dealId, 'dealNumber': dealNumber};
}

class BooksList {
  final String filter;
  final List<Choice> filters;
  final List<Choice> themes;
  final List<BookRow> rows;
  final List<String> remindable;
  final bool canRemind;
  final int staleDays;

  const BooksList({required this.filter, required this.filters, required this.themes, required this.rows, required this.remindable, required this.canRemind, required this.staleDays});

  factory BooksList.fromJson(Map<String, dynamic> json) => BooksList(filter: json['filter'] as String, filters: (json['filters'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), themes: (json['themes'] as List).map((e) => Choice.fromJson(e as Map<String, dynamic>)).toList(), rows: (json['rows'] as List).map((e) => BookRow.fromJson(e as Map<String, dynamic>)).toList(), remindable: (json['remindable'] as List).map((e) => e as String).toList(), canRemind: json['canRemind'] as bool, staleDays: (json['staleDays'] as num).toInt());

  Map<String, dynamic> toJson() => {'filter': filter, 'filters': filters.map((e) => e.toJson()).toList(), 'themes': themes.map((e) => e.toJson()).toList(), 'rows': rows.map((e) => e.toJson()).toList(), 'remindable': remindable.map((e) => e).toList(), 'canRemind': canRemind, 'staleDays': staleDays};
}

class RemindBody {
  final List<String> clientIds;

  const RemindBody({required this.clientIds});

  factory RemindBody.fromJson(Map<String, dynamic> json) => RemindBody(clientIds: (json['clientIds'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'clientIds': clientIds.map((e) => e).toList()};
}

class RemindResult {
  final int sent;
  final int skipped;

  const RemindResult({required this.sent, required this.skipped});

  factory RemindResult.fromJson(Map<String, dynamic> json) => RemindResult(sent: (json['sent'] as num).toInt(), skipped: (json['skipped'] as num).toInt());

  Map<String, dynamic> toJson() => {'sent': sent, 'skipped': skipped};
}

class CatalogPhoto {
  final String url;
  final String src;

  const CatalogPhoto({required this.url, required this.src});

  factory CatalogPhoto.fromJson(Map<String, dynamic> json) => CatalogPhoto(url: json['url'] as String, src: json['src'] as String);

  Map<String, dynamic> toJson() => {'url': url, 'src': src};
}

class CatalogItem {
  final String id;
  final String name;
  final String description;
  final double? price;
  final String currency;
  final String retailerId;
  final String url;
  final bool hidden;
  final String review;
  final List<CatalogPhoto> photos;
  final String coverSrc;
  final int videos;

  const CatalogItem({required this.id, required this.name, required this.description, this.price, required this.currency, required this.retailerId, required this.url, required this.hidden, required this.review, required this.photos, required this.coverSrc, required this.videos});

  factory CatalogItem.fromJson(Map<String, dynamic> json) => CatalogItem(id: json['id'] as String, name: json['name'] as String, description: json['description'] as String, price: json['price'] == null ? null : (json['price'] as num).toDouble(), currency: json['currency'] as String, retailerId: json['retailerId'] as String, url: json['url'] as String, hidden: json['hidden'] as bool, review: json['review'] as String, photos: (json['photos'] as List).map((e) => CatalogPhoto.fromJson(e as Map<String, dynamic>)).toList(), coverSrc: json['coverSrc'] as String, videos: (json['videos'] as num).toInt());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'description': description, 'price': price, 'currency': currency, 'retailerId': retailerId, 'url': url, 'hidden': hidden, 'review': review, 'photos': photos.map((e) => e.toJson()).toList(), 'coverSrc': coverSrc, 'videos': videos};
}

class CatalogCollection {
  final String id;
  final String name;
  final List<String> productIds;

  const CatalogCollection({required this.id, required this.name, required this.productIds});

  factory CatalogCollection.fromJson(Map<String, dynamic> json) => CatalogCollection(id: json['id'] as String, name: json['name'] as String, productIds: (json['productIds'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'productIds': productIds.map((e) => e).toList()};
}

class Catalog {
  final List<CatalogItem> products;
  final List<CatalogCollection> collections;
  final String? collectionsError;
  final String? link;
  final String? problem;
  final String? syncedLabel;

  const Catalog({required this.products, required this.collections, this.collectionsError, this.link, this.problem, this.syncedLabel});

  factory Catalog.fromJson(Map<String, dynamic> json) => Catalog(products: (json['products'] as List).map((e) => CatalogItem.fromJson(e as Map<String, dynamic>)).toList(), collections: (json['collections'] as List).map((e) => CatalogCollection.fromJson(e as Map<String, dynamic>)).toList(), collectionsError: json['collectionsError'] == null ? null : json['collectionsError'] as String, link: json['link'] == null ? null : json['link'] as String, problem: json['problem'] == null ? null : json['problem'] as String, syncedLabel: json['syncedLabel'] == null ? null : json['syncedLabel'] as String);

  Map<String, dynamic> toJson() => {'products': products.map((e) => e.toJson()).toList(), 'collections': collections.map((e) => e.toJson()).toList(), 'collectionsError': collectionsError, 'link': link, 'problem': problem, 'syncedLabel': syncedLabel};
}

class CatalogUploads {
  final List<String> tokens;

  const CatalogUploads({required this.tokens});

  factory CatalogUploads.fromJson(Map<String, dynamic> json) => CatalogUploads(tokens: (json['tokens'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {'tokens': tokens.map((e) => e).toList()};
}

class CatalogProductBody {
  final String? id;
  final String name;
  final String description;
  final String price;
  final String currency;
  final String retailerId;
  final String url;
  final bool hidden;
  final List<String>? keep;
  final List<String> uploads;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CatalogProductBody({this.id, required this.name, required this.description, required this.price, required this.currency, required this.retailerId, required this.url, required this.hidden, this.keep, required this.uploads, this.nulls = const {}});

  factory CatalogProductBody.fromJson(Map<String, dynamic> json) => CatalogProductBody(id: json['id'] == null ? null : json['id'] as String, name: json['name'] as String, description: json['description'] as String, price: json['price'] as String, currency: json['currency'] as String, retailerId: json['retailerId'] as String, url: json['url'] as String, hidden: json['hidden'] as bool, keep: json['keep'] == null ? null : (json['keep'] as List).map((e) => e as String).toList(), uploads: (json['uploads'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {if (id != null || nulls.contains('id')) 'id': id, 'name': name, 'description': description, 'price': price, 'currency': currency, 'retailerId': retailerId, 'url': url, 'hidden': hidden, if (keep != null || nulls.contains('keep')) 'keep': keep == null ? null : keep!.map((e) => e).toList(), 'uploads': uploads.map((e) => e).toList()};
}

class CatalogCollectionBody {
  final String? id;
  final String name;
  final List<String> productIds;
  /// Поля, которые отправить как null (иначе пустое необязательное поле не отправляется).
  final Set<String> nulls;

  const CatalogCollectionBody({this.id, required this.name, required this.productIds, this.nulls = const {}});

  factory CatalogCollectionBody.fromJson(Map<String, dynamic> json) => CatalogCollectionBody(id: json['id'] == null ? null : json['id'] as String, name: json['name'] as String, productIds: (json['productIds'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {if (id != null || nulls.contains('id')) 'id': id, 'name': name, 'productIds': productIds.map((e) => e).toList()};
}

class HiddenBody {
  final bool hidden;

  const HiddenBody({required this.hidden});

  factory HiddenBody.fromJson(Map<String, dynamic> json) => HiddenBody(hidden: json['hidden'] as bool);

  Map<String, dynamic> toJson() => {'hidden': hidden};
}
