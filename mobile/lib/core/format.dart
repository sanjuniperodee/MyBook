import 'package:intl/intl.dart';

String two(int n) => n.toString().padLeft(2, '0');

String hhmm(DateTime d) => '${two(d.hour)}:${two(d.minute)}';

bool sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// Время в списке чатов, как в WhatsApp: сегодня — время, вчера — «Вчера», на неделе — день недели, раньше — дата.
String listTime(DateTime? d) {
  if (d == null) return '';
  final now = DateTime.now();
  if (sameDay(d, now)) return hhmm(d);
  if (sameDay(d, now.subtract(const Duration(days: 1)))) return 'Вчера';
  if (now.difference(d).inDays < 7) return DateFormat.E('ru').format(d);
  return '${two(d.day)}.${two(d.month)}.${d.year % 100}';
}

/// Заголовок группы сообщений за день.
String dayLabel(DateTime d) {
  final now = DateTime.now();
  if (sameDay(d, now)) return 'Сегодня';
  if (sameDay(d, now.subtract(const Duration(days: 1)))) return 'Вчера';
  final f = d.year == now.year ? DateFormat('d MMMM', 'ru') : DateFormat('d MMMM y', 'ru');
  return f.format(d);
}

String money(num v) {
  final s = NumberFormat.decimalPattern('ru').format(v);
  return '$s ₸';
}

String duration(Duration d) => '${d.inMinutes}:${two(d.inSeconds % 60)}';
