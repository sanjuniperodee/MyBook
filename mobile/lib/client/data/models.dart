/// Модели клиентского приложения — та же форма, что у кабинета на сайте (src/lib/book/editor-model.ts): книга, главы,
/// вопросы с ответами и фото. Разбор JSON — здесь, чтобы при переходе на сгенерированный клиент контракта (/api/v1)
/// менялся только источник данных, а не экраны.
library;

class ClientUser {
  const ClientUser({required this.id, required this.name, required this.phone});
  final String id;
  final String name;
  final String phone;

  factory ClientUser.fromJson(Map<String, dynamic> j) => ClientUser(
    id: j['id'] as String,
    name: (j['name'] as String?) ?? '',
    phone: (j['phone'] as String?) ?? '',
  );
}

/// Книга на полке: что это, как далеко продвинулись и есть ли заказ.
class BookSummary {
  const BookSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.answered,
    required this.questions,
    required this.photos,
    this.coverUrl,
    this.orderStatus,
    this.updatedAt,
  });
  final String id;
  final String title;

  /// draft — пишется; ordered и дальше — заказана (правки закрыты).
  final String status;
  final int answered;
  final int questions;
  final int photos;
  final String? coverUrl;
  final String? orderStatus;
  final DateTime? updatedAt;

  bool get editable => status == 'draft';
  double get progress => questions == 0 ? 0 : answered / questions;

  factory BookSummary.fromJson(Map<String, dynamic> j) => BookSummary(
    id: j['id'] as String,
    title: (j['title'] as String?) ?? '',
    status: (j['status'] as String?) ?? 'draft',
    answered: (j['answered'] as num?)?.toInt() ?? 0,
    questions: (j['questions'] as num?)?.toInt() ?? 0,
    photos: (j['photos'] as num?)?.toInt() ?? 0,
    coverUrl: j['coverUrl'] as String?,
    orderStatus: j['orderStatus'] as String?,
    updatedAt: j['updatedAt'] == null
        ? null
        : DateTime.tryParse(j['updatedAt'] as String),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'status': status,
    'answered': answered,
    'questions': questions,
    'photos': photos,
    'coverUrl': coverUrl,
    'orderStatus': orderStatus,
    'updatedAt': updatedAt?.toIso8601String(),
  };
}

class Chapter {
  const Chapter({required this.key, required this.title});
  final String key;
  final String title;

  factory Chapter.fromJson(Map<String, dynamic> j) =>
      Chapter(key: j['key'] as String, title: (j['title'] as String?) ?? '');
  Map<String, dynamic> toJson() => {'key': key, 'title': title};
}

/// Вопрос книги (у своей книги — раздел): вопрос автору, подсказка и ответ.
class Question {
  Question({
    required this.id,
    required this.chapter,
    required this.prompt,
    required this.title,
    required this.answer,
    this.hint,
  });
  final String id;
  final String chapter;
  final String prompt;
  final String? hint;

  /// Заголовок в книге (у своего раздела — его название).
  final String title;
  String answer;

  bool get answered => answer.trim().isNotEmpty;

  factory Question.fromJson(Map<String, dynamic> j) => Question(
    id: j['id'] as String,
    chapter: (j['chapter'] as String?) ?? '',
    prompt: (j['prompt'] as String?) ?? '',
    hint: j['hint'] as String?,
    title: (j['defaultTitle'] as String?) ?? (j['title'] as String?) ?? '',
    answer: (j['answer'] as String?) ?? '',
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'chapter': chapter,
    'prompt': prompt,
    'hint': hint,
    'defaultTitle': title,
    'answer': answer,
  };
}

class BookPhoto {
  const BookPhoto({
    required this.id,
    required this.width,
    required this.height,
    required this.caption,
    this.questionId,
  });
  final String id;
  final int width;
  final int height;
  final String caption;

  /// Фото в ответе на этот вопрос; null — в альбоме или по правилу книги.
  final String? questionId;

  factory BookPhoto.fromJson(Map<String, dynamic> j) => BookPhoto(
    id: j['id'] as String,
    width: (j['width'] as num?)?.toInt() ?? 0,
    height: (j['height'] as num?)?.toInt() ?? 0,
    caption: (j['caption'] as String?) ?? '',
    questionId: j['questionId'] as String?,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'width': width,
    'height': height,
    'caption': caption,
    'questionId': questionId,
  };
}

/// Всё, что нужно для работы над книгой: как модель редактора кабинета.
class BookModel {
  BookModel({
    required this.id,
    required this.title,
    required this.status,
    required this.chapters,
    required this.questions,
    required this.photos,
    required this.maxPhotos,
  });
  final String id;
  final String title;
  final String status;
  final List<Chapter> chapters;
  final List<Question> questions;
  final List<BookPhoto> photos;
  final int maxPhotos;

  bool get editable => status == 'draft';
  int get answered => questions.where((q) => q.answered).length;
  List<Question> inChapter(String key) =>
      questions.where((q) => q.chapter == key).toList();

  factory BookModel.fromJson(Map<String, dynamic> j) => BookModel(
    id: j['id'] as String,
    title: (j['title'] as String?) ?? '',
    status: (j['status'] as String?) ?? 'draft',
    chapters: [
      for (final c in (j['chapters'] as List? ?? const []))
        Chapter.fromJson(c as Map<String, dynamic>),
    ],
    questions: [
      for (final q in (j['questions'] as List? ?? const []))
        Question.fromJson(q as Map<String, dynamic>),
    ],
    photos: [
      for (final p in (j['photos'] as List? ?? const []))
        BookPhoto.fromJson(p as Map<String, dynamic>),
    ],
    maxPhotos: (j['maxPhotos'] as num?)?.toInt() ?? 100,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'status': status,
    'chapters': [for (final c in chapters) c.toJson()],
    'questions': [for (final q in questions) q.toJson()],
    'photos': [for (final p in photos) p.toJson()],
    'maxPhotos': maxPhotos,
  };
}
