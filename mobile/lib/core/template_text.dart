import 'package:flutter/material.dart';

/// Подстановки быстрых ответов: что CRM подставит из диалога. Подписи — человеческие, сама подстановка — в key.
const templateVars = <({String key, String label})>[
  (key: '{имя}', label: 'Имя клиента'),
  (key: '{заказ}', label: 'Номер заказа'),
  (key: '{ссылка}', label: 'Ссылка'),
  (key: '{менеджер}', label: 'Моё имя'),
  (key: '{повод}', label: 'Повод'),
  (key: '{дата}', label: 'Дата события'),
  (key: '{получатель}', label: 'Кому книга'),
];

final _known = {for (final v in templateVars) v.key};
final _varRe = RegExp(r'\{[^{}\n]{1,40}\}');

/// Готовые заготовки для нового шаблона.
const templateStarters = <({String title, String text})>[
  (title: 'Приветствие', text: 'Здравствуйте, {имя}! 👋\nМеня зовут {менеджер}. Расскажите, для кого хотите книгу — подскажу лучший вариант.'),
  (title: 'Как оплатить', text: '{имя}, оплатить можно по ссылке:\n{ссылка}\nПосле оплаты пришлём подтверждение 🙂'),
  (title: 'Сроки', text: 'Печать и доставка занимают 5–7 рабочих дней после утверждения макета.'),
  (title: 'Спасибо за заказ', text: 'Спасибо за заказ №{заказ}, {имя}! 💛\nКак только книга будет готова — сразу напишем.'),
  (title: 'Напоминание', text: '{имя}, добрый день! Подскажите, получилось ли посмотреть наше предложение? Если остались вопросы — с радостью отвечу 🙂'),
];

const templateEmoji = ['😊', '👍', '🙏', '💛', '🎁', '📖', '✅', '📦', '🔥', '👋'];

/// Название по умолчанию — первая «живая» фраза текста без подстановок и разметки (как на сайте).
String titleFromText(String text) {
  final clean = text.replaceAll(RegExp(r'\{[^{}]*\}'), '').replaceAll(RegExp(r'[*_~]'), '');
  final parts = clean.split(RegExp(r'[.!?\n]+')).map((x) => x.replaceFirst(RegExp(r'^[\s,:;—-]+'), '').replaceAll(RegExp(r'\s+'), ' ').trim()).where((x) => x.isNotEmpty).toList();
  if (parts.isEmpty) return '';
  final phrase = parts.firstWhere((x) => x.split(' ').length >= 3, orElse: () => parts.first);
  final words = phrase.split(' ').where((w) => RegExp(r'\p{L}', unicode: true).hasMatch(w)).take(4).toList();
  while (words.length > 1 && words.last.replaceAll(RegExp(r'[^\p{L}]', unicode: true), '').length <= 2) {
    words.removeLast();
  }
  final t = words.join(' ');
  return t.length > 40 ? '${t.substring(0, 39)}…' : t;
}

/// Незнакомые подстановки в тексте (своё поле сделки тоже бывает «незнакомым» — предупреждение мягкое).
List<String> unknownVars(String text) => {
  for (final m in _varRe.allMatches(text))
    if (!_known.contains(m.group(0))) m.group(0)!,
}.toList();

/// Поле ввода шаблона: подстановки подсвечены прямо в тексте (известные — акцентом, незнакомые — жёлтым).
class TemplateTextController extends TextEditingController {
  TemplateTextController({super.text, required this.known, required this.unknown});
  final Color known;
  final Color unknown;

  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in _varRe.allMatches(text)) {
      if (m.start > last) spans.add(TextSpan(text: text.substring(last, m.start)));
      spans.add(
        TextSpan(
          text: m.group(0),
          style: TextStyle(backgroundColor: (_known.contains(m.group(0)) ? known : unknown).withValues(alpha: 0.2), fontWeight: FontWeight.w600),
        ),
      );
      last = m.end;
    }
    if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
    return TextSpan(style: style, children: spans);
  }
}

/// Разметка WhatsApp: *жирный*, _курсив_, ~зачёркнутый~ — как её увидит клиент.
List<InlineSpan> whatsappSpans(String text) {
  final re = RegExp(r'(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)');
  final out = <InlineSpan>[];
  var last = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > last) out.add(TextSpan(text: text.substring(last, m.start)));
    final p = m.group(0)!;
    final inner = p.substring(1, p.length - 1);
    out.add(
      TextSpan(
        text: inner,
        style: p[0] == '*'
            ? const TextStyle(fontWeight: FontWeight.w700)
            : p[0] == '_'
            ? const TextStyle(fontStyle: FontStyle.italic)
            : const TextStyle(decoration: TextDecoration.lineThrough),
      ),
    );
    last = m.end;
  }
  if (last < text.length) out.add(TextSpan(text: text.substring(last)));
  return out;
}

/// Подстановка условных данных для предпросмотра.
String previewTemplate(String text, String manager) => text
    .replaceAll('{имя}', 'Айдана')
    .replaceAll('{заказ}', '1042')
    .replaceAll('{ссылка}', 'https://mybooks.kz/pay/…')
    .replaceAll('{менеджер}', manager)
    .replaceAll('{повод}', 'День рождения')
    .replaceAll('{дата}', '14 ноября')
    .replaceAll('{получатель}', 'маме');
