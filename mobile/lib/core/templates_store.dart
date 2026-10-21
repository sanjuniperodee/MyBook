import 'package:flutter/foundation.dart';

import '../models/chat.dart';
import 'api.dart';

/// Шаблоны ответов сотрудника: свои (с порядком) и общие компании. Свои создаются, меняются и удаляются здесь же.
class TemplatesStore extends ChangeNotifier {
  TemplatesStore(this.api);
  final ApiClient api;

  List<Template> mine = [];
  List<Template> shared = [];
  bool loaded = false;
  String? error;

  Future<void> load() async {
    try {
      final r = await api.get('/api/mobile/templates') as Map<String, dynamic>;
      mine = [
        for (final t in (r['mine'] as List)) Template.fromJson({...(t as Map<String, dynamic>), 'own': true}),
      ];
      shared = [for (final t in (r['shared'] as List)) Template.fromJson(t as Map<String, dynamic>)];
      error = null;
      loaded = true;
    } on ApiException catch (e) {
      error = e.message;
    }
    notifyListeners();
  }

  /// Создать (id == null) или изменить свой шаблон. Возвращает текст ошибки.
  Future<String?> save({String? id, required String title, required String text}) async {
    try {
      await api.post('/api/mobile/templates', body: {'id': ?id, 'title': title, 'text': text});
      await load();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> remove(Template t) async {
    mine = mine.where((x) => x.id != t.id).toList();
    notifyListeners();
    try {
      await api.delete('/api/mobile/templates/${t.id}');
      return null;
    } on ApiException catch (e) {
      await load();
      return e.message;
    }
  }

  Future<String?> duplicate(Template t) async {
    try {
      await api.post('/api/mobile/templates/${t.id}/duplicate');
      await load();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Перетащили: новый порядок сразу на экране, сервер запоминает следом.
  Future<void> reorder(int from, int to) async {
    final list = [...mine];
    final item = list.removeAt(from);
    list.insert(to, item);
    mine = list;
    notifyListeners();
    try {
      await api.post(
        '/api/mobile/templates/reorder',
        body: {
          'ids': [for (final t in list) t.id],
        },
      );
    } on ApiException {
      await load();
    }
  }
}
