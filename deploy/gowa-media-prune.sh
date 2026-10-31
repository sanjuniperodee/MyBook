#!/usr/bin/env bash
# Раз в сутки удаляет из каталога вложений шлюзов WhatsApp (MyBooks, DoseWear, MyStudy) крупные файлы старше 14 дней.
# CRM сама скачивает их заново при открытии (MessageMedia.open: «файла нет — скачать по id сообщения»), пока WhatsApp
# хранит вложение. Мелкое (голосовые, фото до 1 МБ) не трогаем.
set -u
DAYS=${DAYS:-14}
for p in mybook dosewear mystudy; do
  m="$HOME/$p-sidecars/gowa/statics/media"
  [ -d "$m" ] || continue
  n=$(find "$m" -type f -size +1M -mtime +"$DAYS" -print -delete | wc -l)
  echo "$(date '+%F %T') $p: удалено $n"
done
