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
    final json = await _send('GET', '/api/v1/orders/${Uri.encodeComponent(orderId)}/review');
    return ReviewView.fromJson(json as Map<String, dynamic>);
  }

  /// Оставить или поправить отзыв (фото не трогает)
  Future<Review> reviewSubmit({required String orderId, required ReviewBody body}) async {
    final json = await _send('PUT', '/api/v1/orders/${Uri.encodeComponent(orderId)}/review', body: body.toJson());
    return Review.fromJson(json as Map<String, dynamic>);
  }

  /// Фото к отзыву (multipart, поле photo; до 15 МБ) — после reviewSubmit
  Future<Review> reviewPhotoSet({required String orderId, required List<http.MultipartFile> files}) async {
    final json = await _sendFiles('POST', '/api/v1/orders/${Uri.encodeComponent(orderId)}/review/photo', 'photo', files);
    return Review.fromJson(json as Map<String, dynamic>);
  }

  /// Убрать фото из отзыва
  Future<Review> reviewPhotoDelete({required String orderId}) async {
    final json = await _send('DELETE', '/api/v1/orders/${Uri.encodeComponent(orderId)}/review/photo');
    return Review.fromJson(json as Map<String, dynamic>);
  }

  /// Обложка книги и каталог шаблонов
  Future<CoverView> coverGet({required String bookId}) async {
    final json = await _send('GET', '/api/v1/books/${Uri.encodeComponent(bookId)}/cover');
    return CoverView.fromJson(json as Map<String, dynamic>);
  }

  /// Правка обложки (только изменённые поля): шаблон, линии, тексты, фото
  Future<CoverView> coverUpdate({required String bookId, required CoverPatch body}) async {
    final json = await _send('PATCH', '/api/v1/books/${Uri.encodeComponent(bookId)}/cover', body: body.toJson());
    return CoverView.fromJson(json as Map<String, dynamic>);
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
    final json = await _send('GET', '/api/v1/cabinet/books/${Uri.encodeComponent(bookId)}/checkout');
    return CabinetCheckout.fromJson(json as Map<String, dynamic>);
  }

  /// Итог по выбранному: строки чека и «К оплате» (правила цены сервера), проверка промокода
  Future<CheckoutQuote> cabinetCheckoutQuote({required String bookId, required CheckoutQuoteBody body}) async {
    final json = await _send('POST', '/api/v1/cabinet/books/${Uri.encodeComponent(bookId)}/checkout/quote', body: body.toJson());
    return CheckoutQuote.fromJson(json as Map<String, dynamic>);
  }

  /// Оформить заказ (те же проверки, что у формы сайта)
  Future<OrderPlaced> cabinetOrderPlace({required String bookId, required OrderPlaceBody body}) async {
    final json = await _send('POST', '/api/v1/cabinet/books/${Uri.encodeComponent(bookId)}/orders', body: body.toJson());
    return OrderPlaced.fromJson(json as Map<String, dynamic>);
  }

  /// Мои заказы
  Future<CabinetOrders> cabinetOrders() async {
    final json = await _send('GET', '/api/v1/cabinet/orders');
    return CabinetOrders.fromJson(json as Map<String, dynamic>);
  }

  /// Заказ — как на сайте: что сейчас, этапы, детали, чек, оплата
  Future<CabinetOrder> cabinetOrder({required String orderId}) async {
    final json = await _send('GET', '/api/v1/cabinet/orders/${Uri.encodeComponent(orderId)}');
    return CabinetOrder.fromJson(json as Map<String, dynamic>);
  }

  /// Оплата через Kaspi: счёт в приложение Kaspi по номеру или QR-код
  Future<KaspiInvoiceResult> cabinetOrderKaspi({required String orderId, required KaspiPayBody body}) async {
    final json = await _send('POST', '/api/v1/cabinet/orders/${Uri.encodeComponent(orderId)}/kaspi', body: body.toJson());
    return KaspiInvoiceResult.fromJson(json as Map<String, dynamic>);
  }

  /// Состояние счёта Kaspi (опрос, пока клиент платит)
  Future<KaspiInvoiceResult> cabinetOrderKaspiStatus({required String orderId, required String invoiceId}) async {
    final json = await _send('GET', '/api/v1/cabinet/orders/${Uri.encodeComponent(orderId)}/kaspi/${Uri.encodeComponent(invoiceId)}');
    return KaspiInvoiceResult.fromJson(json as Map<String, dynamic>);
  }

  /// «Я оплатил(а)» переводом
  Future<OkResult> cabinetOrderClaim({required String orderId}) async {
    final json = await _send('POST', '/api/v1/cabinet/orders/${Uri.encodeComponent(orderId)}/claim');
    return OkResult.fromJson(json as Map<String, dynamic>);
  }

  /// Отменить заказ — книга снова открыта для правок
  Future<OkResult> cabinetOrderCancel({required String orderId}) async {
    final json = await _send('POST', '/api/v1/cabinet/orders/${Uri.encodeComponent(orderId)}/cancel');
    return OkResult.fromJson(json as Map<String, dynamic>);
  }

  /// Сделка для правки: поля, свои поля, договорённость
  Future<DealForm> crmDealForm({required String dealId}) async {
    final json = await _send('GET', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}/form');
    return DealForm.fromJson(json as Map<String, dynamic>);
  }

  /// Правка сделки (только переданные поля)
  Future<Done> crmDealUpdate({required String dealId, required DealPatch body}) async {
    final json = await _send('PATCH', '/api/v1/crm/deals/${Uri.encodeComponent('$dealId')}', body: body.toJson());
    return Done.fromJson(json as Map<String, dynamic>);
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

  /// Правка клиента (только переданные поля)
  Future<Done> crmClientUpdate({required String clientId, required ClientPatch body}) async {
    final json = await _send('PATCH', '/api/v1/crm/clients/${Uri.encodeComponent('$clientId')}', body: body.toJson());
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

  /// Завести клиента с доступом в кабинет, сделкой и предоплатой (как форма «Новый клиент»)
  Future<NewClientResult> crmClientCreate({required NewClientBody body}) async {
    final json = await _send('POST', '/api/v1/crm/clients', body: body.toJson());
    return NewClientResult.fromJson(json as Map<String, dynamic>);
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

class LettersView {
  final List<Letter> letters;
  final LetterInvite invite;
  final int max;

  const LettersView({required this.letters, required this.invite, required this.max});

  factory LettersView.fromJson(Map<String, dynamic> json) => LettersView(letters: (json['letters'] as List).map((e) => Letter.fromJson(e as Map<String, dynamic>)).toList(), invite: LetterInvite.fromJson(json['invite'] as Map<String, dynamic>), max: (json['max'] as num).toInt());

  Map<String, dynamic> toJson() => {'letters': letters.map((e) => e.toJson()).toList(), 'invite': invite.toJson(), 'max': max};
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

class ReviewView {
  final bool canReview;
  final String defaultName;
  final Review? review;

  const ReviewView({required this.canReview, required this.defaultName, this.review});

  factory ReviewView.fromJson(Map<String, dynamic> json) => ReviewView(canReview: json['canReview'] as bool, defaultName: json['defaultName'] as String, review: json['review'] == null ? null : Review.fromJson(json['review'] as Map<String, dynamic>));

  Map<String, dynamic> toJson() => {'canReview': canReview, 'defaultName': defaultName, 'review': review == null ? null : review!.toJson()};
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

  const CoverPatch({this.title, this.subtitle, this.hideRecipientOnCover, this.namesOnCover, this.coverTemplate, this.coverLines, this.coverPhotoId, this.coverPhotoExtra, this.backText, this.backLayout, this.backPhotoId, this.backPhotoExtra, this.nulls = const {}});

  factory CoverPatch.fromJson(Map<String, dynamic> json) => CoverPatch(title: json['title'] == null ? null : json['title'] as String, subtitle: json['subtitle'] == null ? null : json['subtitle'] as String, hideRecipientOnCover: json['hideRecipientOnCover'] == null ? null : json['hideRecipientOnCover'] as bool, namesOnCover: json['namesOnCover'] == null ? null : json['namesOnCover'] as String, coverTemplate: json['coverTemplate'] == null ? null : json['coverTemplate'] as String, coverLines: json['coverLines'] == null ? null : json['coverLines'] as bool, coverPhotoId: json['coverPhotoId'] == null ? null : json['coverPhotoId'] as String, coverPhotoExtra: json['coverPhotoExtra'] == null ? null : (json['coverPhotoExtra'] as List).map((e) => e as String).toList(), backText: json['backText'] == null ? null : json['backText'] as String, backLayout: json['backLayout'] == null ? null : json['backLayout'] as String, backPhotoId: json['backPhotoId'] == null ? null : json['backPhotoId'] as String, backPhotoExtra: json['backPhotoExtra'] == null ? null : (json['backPhotoExtra'] as List).map((e) => e as String).toList());

  Map<String, dynamic> toJson() => {if (title != null) 'title': title!, if (subtitle != null) 'subtitle': subtitle!, if (hideRecipientOnCover != null) 'hideRecipientOnCover': hideRecipientOnCover!, if (namesOnCover != null) 'namesOnCover': namesOnCover!, if (coverTemplate != null) 'coverTemplate': coverTemplate!, if (coverLines != null) 'coverLines': coverLines!, if (coverPhotoId != null || nulls.contains('coverPhotoId')) 'coverPhotoId': coverPhotoId, if (coverPhotoExtra != null) 'coverPhotoExtra': coverPhotoExtra!.map((e) => e).toList(), if (backText != null) 'backText': backText!, if (backLayout != null) 'backLayout': backLayout!, if (backPhotoId != null || nulls.contains('backPhotoId')) 'backPhotoId': backPhotoId, if (backPhotoExtra != null) 'backPhotoExtra': backPhotoExtra!.map((e) => e).toList()};
}

class CoverTemplate {
  final String id;
  final String name;
  final String mood;
  final int photoSlots;
  final String previewUrl;

  const CoverTemplate({required this.id, required this.name, required this.mood, required this.photoSlots, required this.previewUrl});

  factory CoverTemplate.fromJson(Map<String, dynamic> json) => CoverTemplate(id: json['id'] as String, name: json['name'] as String, mood: json['mood'] as String, photoSlots: (json['photoSlots'] as num).toInt(), previewUrl: json['previewUrl'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'mood': mood, 'photoSlots': photoSlots, 'previewUrl': previewUrl};
}

class Cover {
  final String template;
  final bool lines;
  final String title;
  final String subtitle;
  final String namesOnCover;
  final bool hideRecipientOnCover;
  final List<String?> photoIds;
  final String backText;
  final String backLayout;
  final String? backPhotoId;
  final bool hasDesign;
  final String imageUrl;
  final bool editable;

  const Cover({required this.template, required this.lines, required this.title, required this.subtitle, required this.namesOnCover, required this.hideRecipientOnCover, required this.photoIds, required this.backText, required this.backLayout, this.backPhotoId, required this.hasDesign, required this.imageUrl, required this.editable});

  factory Cover.fromJson(Map<String, dynamic> json) => Cover(template: json['template'] as String, lines: json['lines'] as bool, title: json['title'] as String, subtitle: json['subtitle'] as String, namesOnCover: json['namesOnCover'] as String, hideRecipientOnCover: json['hideRecipientOnCover'] as bool, photoIds: (json['photoIds'] as List).map((e) => e == null ? null : e as String).toList(), backText: json['backText'] as String, backLayout: json['backLayout'] as String, backPhotoId: json['backPhotoId'] == null ? null : json['backPhotoId'] as String, hasDesign: json['hasDesign'] as bool, imageUrl: json['imageUrl'] as String, editable: json['editable'] as bool);

  Map<String, dynamic> toJson() => {'template': template, 'lines': lines, 'title': title, 'subtitle': subtitle, 'namesOnCover': namesOnCover, 'hideRecipientOnCover': hideRecipientOnCover, 'photoIds': photoIds.map((e) => e).toList(), 'backText': backText, 'backLayout': backLayout, 'backPhotoId': backPhotoId, 'hasDesign': hasDesign, 'imageUrl': imageUrl, 'editable': editable};
}

class CoverView {
  final Cover cover;
  final List<CoverTemplate> templates;

  const CoverView({required this.cover, required this.templates});

  factory CoverView.fromJson(Map<String, dynamic> json) => CoverView(cover: Cover.fromJson(json['cover'] as Map<String, dynamic>), templates: (json['templates'] as List).map((e) => CoverTemplate.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'cover': cover.toJson(), 'templates': templates.map((e) => e.toJson()).toList()};
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

  const CabinetShelf({required this.books});

  factory CabinetShelf.fromJson(Map<String, dynamic> json) => CabinetShelf(books: (json['books'] as List).map((e) => ShelfItem.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'books': books.map((e) => e.toJson()).toList()};
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

  const CabinetBook({required this.id, required this.title, required this.subtitle, required this.kind, required this.language, required this.blank, required this.editable, required this.coverUrl, required this.coverThumbUrl, this.card, this.deadline, required this.pathTitle, required this.steps, required this.needsTitle, required this.needsFix, required this.needs, required this.chaptersTitle, this.chaptersAside, required this.allChaptersLabel, required this.chapters, required this.letters, required this.help, required this.whereToStart, required this.tips, this.tipsNote});

  factory CabinetBook.fromJson(Map<String, dynamic> json) => CabinetBook(id: json['id'] as String, title: json['title'] as String, subtitle: json['subtitle'] as String, kind: json['kind'] as String, language: json['language'] as String, blank: json['blank'] as bool, editable: json['editable'] as bool, coverUrl: json['coverUrl'] as String, coverThumbUrl: json['coverThumbUrl'] as String, card: json['card'] == null ? null : HubCard.fromJson(json['card'] as Map<String, dynamic>), deadline: json['deadline'] == null ? null : HubDeadline.fromJson(json['deadline'] as Map<String, dynamic>), pathTitle: json['pathTitle'] as String, steps: (json['steps'] as List).map((e) => HubStep.fromJson(e as Map<String, dynamic>)).toList(), needsTitle: json['needsTitle'] as String, needsFix: json['needsFix'] as String, needs: (json['needs'] as List).map((e) => HubNeed.fromJson(e as Map<String, dynamic>)).toList(), chaptersTitle: json['chaptersTitle'] as String, chaptersAside: json['chaptersAside'] == null ? null : json['chaptersAside'] as String, allChaptersLabel: json['allChaptersLabel'] as String, chapters: (json['chapters'] as List).map((e) => HubChapter.fromJson(e as Map<String, dynamic>)).toList(), letters: CabinetBookLetters.fromJson(json['letters'] as Map<String, dynamic>), help: CabinetBookHelp.fromJson(json['help'] as Map<String, dynamic>), whereToStart: json['whereToStart'] as String, tips: (json['tips'] as List).map((e) => e as String).toList(), tipsNote: json['tipsNote'] == null ? null : json['tipsNote'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'subtitle': subtitle, 'kind': kind, 'language': language, 'blank': blank, 'editable': editable, 'coverUrl': coverUrl, 'coverThumbUrl': coverThumbUrl, 'card': card == null ? null : card!.toJson(), 'deadline': deadline == null ? null : deadline!.toJson(), 'pathTitle': pathTitle, 'steps': steps.map((e) => e.toJson()).toList(), 'needsTitle': needsTitle, 'needsFix': needsFix, 'needs': needs.map((e) => e.toJson()).toList(), 'chaptersTitle': chaptersTitle, 'chaptersAside': chaptersAside, 'allChaptersLabel': allChaptersLabel, 'chapters': chapters.map((e) => e.toJson()).toList(), 'letters': letters.toJson(), 'help': help.toJson(), 'whereToStart': whereToStart, 'tips': tips.map((e) => e).toList(), 'tipsNote': tipsNote};
}

class CabinetBookLetters {
  final String title;
  final String text;
  final String action;
  final String href;

  const CabinetBookLetters({required this.title, required this.text, required this.action, required this.href});

  factory CabinetBookLetters.fromJson(Map<String, dynamic> json) => CabinetBookLetters(title: json['title'] as String, text: json['text'] as String, action: json['action'] as String, href: json['href'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'text': text, 'action': action, 'href': href};
}

class CabinetBookHelp {
  final String title;
  final String text;
  final String url;

  const CabinetBookHelp({required this.title, required this.text, required this.url});

  factory CabinetBookHelp.fromJson(Map<String, dynamic> json) => CabinetBookHelp(title: json['title'] as String, text: json['text'] as String, url: json['url'] as String);

  Map<String, dynamic> toJson() => {'title': title, 'text': text, 'url': url};
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

  Map<String, dynamic> toJson() => {'channels': channels.map((e) => e.toJson()).toList(), 'locales': locales.map((e) => e.toJson()).toList(), 'plans': plans.map((e) => e.toJson()).toList(), 'payForms': payForms.map((e) => e).toList(), 'stages': stages.map((e) => e.toJson()).toList(), 'defaultStageId': defaultStageId == null ? null : defaultStageId!, 'managers': managers.map((e) => e.toJson()).toList(), 'me': me, 'canAssign': canAssign, 'canDeal': canDeal, 'maxDiscountPercent': maxDiscountPercent == null ? null : maxDiscountPercent!};
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

  Map<String, dynamic> toJson() => {'dealId': dealId, 'dealNumber': dealNumber, 'agreed': agreed, 'prepaid': prepaid, 'paymentId': paymentId == null ? null : paymentId!};
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

  Map<String, dynamic> toJson() => {'clientId': clientId, 'clientName': clientName, 'dealId': dealId == null ? null : dealId!, 'dealNumber': dealNumber == null ? null : dealNumber!, 'parts': parts.map((e) => e.toJson()).toList(), 'count': count, 'loginText': loginText, 'password': password, 'loginUrl': loginUrl, 'message': message, 'agreed': agreed, 'prepaid': prepaid, 'remainder': remainder, 'tasks': tasks};
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

  const OrderFiles({required this.canFiles, this.spec, required this.files, this.packageUrl, required this.progressUrl, required this.bookLocked, required this.canLock});

  factory OrderFiles.fromJson(Map<String, dynamic> json) => OrderFiles(canFiles: json['canFiles'] as bool, spec: json['spec'] == null ? null : OrderFilesSpec.fromJson(json['spec'] as Map<String, dynamic>), files: (json['files'] as List).map((e) => OrderFileLink.fromJson(e as Map<String, dynamic>)).toList(), packageUrl: json['packageUrl'] == null ? null : json['packageUrl'] as String, progressUrl: json['progressUrl'] as String, bookLocked: json['bookLocked'] as bool, canLock: json['canLock'] as bool);

  Map<String, dynamic> toJson() => {'canFiles': canFiles, 'spec': spec == null ? null : spec!.toJson(), 'files': files.map((e) => e.toJson()).toList(), 'packageUrl': packageUrl == null ? null : packageUrl!, 'progressUrl': progressUrl, 'bookLocked': bookLocked, 'canLock': canLock};
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

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'kind': kind, 'size': size, 'url': url, 'transcript': transcript == null ? null : transcript!, 'transcriptError': transcriptError == null ? null : transcriptError!};
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

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'status': status, 'statusLabel': statusLabel, 'statuses': statuses.map((e) => e.toJson()).toList(), 'kindLabel': kindLabel, 'urgent': urgent, 'summary': summary, 'description': description, 'place': place, 'expected': expected, 'reporter': reporter, 'createdAt': createdAt, 'files': files.map((e) => e.toJson()).toList(), 'chatId': chatId == null ? null : chatId!, 'chat': chat.map((e) => e.toJson()).toList(), 'resolution': resolution, 'devNote': devNote, 'commits': commits.map((e) => e.toJson()).toList(), 'history': history.map((e) => e.toJson()).toList(), 'notifiedAt': notifiedAt == null ? null : notifiedAt!, 'notifyError': notifyError == null ? null : notifyError!, 'canManage': canManage};
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
