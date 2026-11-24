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
    final res = await http.Response.fromStream(await _http.send(request));
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
    final json = await _send('GET', '/api/v1/books/${Uri.encodeComponent(bookId)}/editor');
    return BookEditor.fromJson(json as Map<String, dynamic>);
  }

  /// Автосохранение ответа и заголовка раздела (только изменённые поля)
  Future<Saved> questionSave({required String bookId, required String questionId, required QuestionPatch body}) async {
    final json = await _send('PATCH', '/api/v1/books/${Uri.encodeComponent(bookId)}/questions/${Uri.encodeComponent(questionId)}', body: body.toJson());
    return Saved.fromJson(json as Map<String, dynamic>);
  }

  /// Полка «Мои книги» — как на сайте: книги в работе первыми, прогресс, срок к празднику, заказ, обложка
  Future<CabinetShelf> cabinetShelf() async {
    final json = await _send('GET', '/api/v1/cabinet/shelf');
    return CabinetShelf.fromJson(json as Map<String, dynamic>);
  }
}

class ApiError {
  final String error;
  final String? code;

  const ApiError({required this.error, this.code});

  factory ApiError.fromJson(Map<String, dynamic> json) => ApiError(error: json['error'] as String, code: json['code'] == null ? null : json['code'] as String);

  Map<String, dynamic> toJson() => {'error': error, if (code != null) 'code': code == null ? null : code!};
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

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'email': email, if (phone != null) 'phone': phone == null ? null : phone!, 'locale': locale, 'isStaff': isStaff};
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

  Map<String, dynamic> toJson() => {if (session != null) 'session': session == null ? null : session!.toJson(), if (secondFactorTicket != null) 'secondFactorTicket': secondFactorTicket == null ? null : secondFactorTicket!};
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

  Map<String, dynamic> toJson() => {'id': id, 'kind': kind, 'recipient': recipient, 'name': name, 'short': short, 'description': description, 'emoji': emoji, if (recipientLabel != null) 'recipientLabel': recipientLabel == null ? null : recipientLabel!, if (recipientPlaceholder != null) 'recipientPlaceholder': recipientPlaceholder == null ? null : recipientPlaceholder!, if (recipientGender != null) 'recipientGender': recipientGender == null ? null : recipientGender!, 'recipientGenderChoice': recipientGenderChoice, 'defaultRecipientGender': defaultRecipientGender, 'titleSuggestions': titleSuggestions.map((e) => e).toList()};
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

  Map<String, dynamic> toJson() => {'theme': theme, 'language': language, 'authorName': authorName, 'authorGender': authorGender, if (recipientName != null) 'recipientName': recipientName == null ? null : recipientName!, if (recipientGender != null) 'recipientGender': recipientGender == null ? null : recipientGender!, if (recordedBy != null) 'recordedBy': recordedBy == null ? null : recordedBy!, if (firstChapterTitle != null) 'firstChapterTitle': firstChapterTitle == null ? null : firstChapterTitle!, if (dedication != null) 'dedication': dedication == null ? null : dedication!, if (title != null) 'title': title == null ? null : title!, if (occasion != null) 'occasion': occasion == null ? null : occasion!, if (occasionDate != null) 'occasionDate': occasionDate == null ? null : occasionDate!};
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

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'theme': theme, 'status': status, 'authorName': authorName, 'recipientName': recipientName, 'updatedAt': updatedAt, 'answered': answered, 'total': total, 'words': words, 'photos': photos, 'coverTemplate': coverTemplate, if (coverPhotoUrl != null) 'coverPhotoUrl': coverPhotoUrl == null ? null : coverPhotoUrl!, if (order != null) 'order': order == null ? null : order!.toJson()};
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

  Map<String, dynamic> toJson() => {'id': id, 'kind': kind, 'url': url, if (fileId != null) 'fileId': fileId == null ? null : fileId!, 'title': title, if (anchor != null) 'anchor': anchor == null ? null : anchor!};
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

  Map<String, dynamic> toJson() => {'id': id, 'chapter': chapter, 'chapterTitle': chapterTitle, 'prompt': prompt, if (hint != null) 'hint': hint == null ? null : hint!, 'defaultTitle': defaultTitle, if (displayText != null) 'displayText': displayText == null ? null : displayText!, 'hideHeading': hideHeading, 'answer': answer, 'media': media.map((e) => e.toJson()).toList(), 'isCustom': isCustom, 'pageBreak': pageBreak};
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

  Map<String, dynamic> toJson() => {'id': id, 'width': width, 'height': height, 'caption': caption, 'layout': layout, if (questionId != null) 'questionId': questionId == null ? null : questionId!, 'thumbUrl': thumbUrl, 'url': url};
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

  const QuestionPatch({this.answer, this.displayText, this.hideHeading, this.pageBreak, this.media, this.title, this.prompt});

  factory QuestionPatch.fromJson(Map<String, dynamic> json) => QuestionPatch(answer: json['answer'] == null ? null : json['answer'] as String, displayText: json['displayText'] == null ? null : json['displayText'] as String, hideHeading: json['hideHeading'] == null ? null : json['hideHeading'] as bool, pageBreak: json['pageBreak'] == null ? null : json['pageBreak'] as bool, media: json['media'] == null ? null : (json['media'] as List).map((e) => AnswerMedia.fromJson(e as Map<String, dynamic>)).toList(), title: json['title'] == null ? null : json['title'] as String, prompt: json['prompt'] == null ? null : json['prompt'] as String);

  Map<String, dynamic> toJson() => {if (answer != null) 'answer': answer == null ? null : answer!, if (displayText != null) 'displayText': displayText == null ? null : displayText!, if (hideHeading != null) 'hideHeading': hideHeading == null ? null : hideHeading!, if (pageBreak != null) 'pageBreak': pageBreak == null ? null : pageBreak!, if (media != null) 'media': media == null ? null : media!.map((e) => e.toJson()).toList(), if (title != null) 'title': title == null ? null : title!, if (prompt != null) 'prompt': prompt == null ? null : prompt!};
}

class Saved {
  final bool ok;
  final String updatedAt;

  const Saved({required this.ok, required this.updatedAt});

  factory Saved.fromJson(Map<String, dynamic> json) => Saved(ok: json['ok'] as bool, updatedAt: json['updatedAt'] as String);

  Map<String, dynamic> toJson() => {'ok': ok, 'updatedAt': updatedAt};
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

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'subtitle': subtitle, 'kind': kind, 'blank': blank, 'ordered': ordered, 'progress': progress, 'progressLabel': progressLabel, 'counts': counts, 'updated': updated, if (deadline != null) 'deadline': deadline == null ? null : deadline!.toJson(), if (order != null) 'order': order == null ? null : order!.toJson(), 'started': started, if (writeSectionId != null) 'writeSectionId': writeSectionId == null ? null : writeSectionId!, 'coverUrl': coverUrl, 'coverThumbUrl': coverThumbUrl};
}

class CabinetShelf {
  final List<ShelfItem> books;

  const CabinetShelf({required this.books});

  factory CabinetShelf.fromJson(Map<String, dynamic> json) => CabinetShelf(books: (json['books'] as List).map((e) => ShelfItem.fromJson(e as Map<String, dynamic>)).toList());

  Map<String, dynamic> toJson() => {'books': books.map((e) => e.toJson()).toList()};
}
