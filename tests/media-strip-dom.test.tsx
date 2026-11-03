import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaStrip } from "@/components/editor/questions/MediaStrip";
import { MediaCard } from "@/components/interior/entry";
import { pageKit } from "@/components/interior/kit";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import type { AnswerMedia } from "@/lib/book/answer-media";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";

// QR-коды в редакторе и на HTML-странице книги (renderToStaticMarkup, как в остальных DOM-тестах).

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const media: AnswerMedia[] = [
  { id: "a", kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", title: "Пожелание от бабушки", anchor: null },
  { id: "b", kind: "music", url: "https://www.instagram.com/reel/abc/", title: "", anchor: 0 },
];
const noop = () => {};

describe("редактор: видео и музыка", () => {
  it("без кодов и без формы — блока нет", () => {
    expect(html(<MediaStrip bookId="b1" media={[]} answer="" editable adding={false} onAdding={noop} update={noop} />)).toBe("");
  });

  it("форма ссылки с подсказкой про доступ «по ссылке»", () => {
    const out = html(<MediaStrip bookId="b1" media={[]} answer="" editable adding onAdding={noop} update={noop} />, kk);
    expect(out).toContain(kk.editor.media.howTo);
    expect(out).toContain('type="url"');
  });

  it("карточки: обложка ролика YouTube, QR-код, подпись, место в тексте, площадка", () => {
    const out = html(<MediaStrip bookId="b1" media={media} answer={"Первый абзац\nВторой"} editable adding={false} onAdding={noop} update={noop} />);
    expect(out.match(/data-testid="answer-media-item"/g)).toHaveLength(2);
    expect(out).toContain("i.ytimg.com/vi/dQw4w9WgXcQ");
    expect(out).toContain('value="Пожелание от бабушки"');
    expect(out).toContain(ru.editor.media.captionPlaceholder.music);
    expect(out).toContain("Instagram");
    expect(out).toContain(ru.editor.inspector.beforeText);
  });

  it("форма: загрузка своего видео или аудио, подсказка про длительность, затем — ссылка", () => {
    const out = html(<MediaStrip bookId="b1" media={[]} answer="" editable adding onAdding={noop} update={noop} />);
    expect(out).toContain(ru.editor.media.upload.button);
    expect(out).toContain('type="file"');
    expect(out).toContain(ru.editor.media.upload.hint(10, 30));
    expect(out.indexOf('type="file"')).toBeLessThan(out.indexOf('type="url"'));
  });

  it("свой файл: ссылка на страницу файла; у аудио выбор «Аудио» / «Музыка», у видео — без выбора", () => {
    const own: AnswerMedia[] = [
      { id: "v", kind: "video", url: "https://mybooks.kz/v/Ab3dE9xK2m", title: "", anchor: null, fileId: "00000000-0000-4000-8000-000000000001" },
      { id: "a", kind: "audio", url: "https://mybooks.kz/v/Zz3dE9xK2m", title: "", anchor: null, fileId: "00000000-0000-4000-8000-000000000002" },
    ];
    const out = html(<MediaStrip bookId="b1" media={own} answer="" editable adding={false} onAdding={noop} update={noop} />, kk);
    expect(out.match(new RegExp(kk.editor.media.file.open, "g"))?.length).toBeGreaterThanOrEqual(2);
    expect(out).toContain(kk.editor.media.kinds.audio);
    expect(out).toContain(kk.editor.media.captionPlaceholder.audio);
    // Переключатель вида — только у аудио: «Бейне» как вариант выбора не предлагается.
    expect(out.match(/role="radio"/g)).toHaveLength(2);
  });

  it("только просмотр: без кнопок «убрать», подпись не правится", () => {
    const out = html(<MediaStrip bookId="b1" media={media} answer="" editable={false} adding onAdding={noop} update={noop} />);
    expect(out).not.toContain(ru.editor.media.remove);
    expect(out).toContain("readOnly");
    expect(out).not.toContain('type="url"');
  });
});

describe("страница книги: карточка QR-кода", () => {
  const kit = pageKit(getInteriorDesign("classic"), getFormat("a5"), { pt: (v: number) => `${v}px`, mm: (v: number) => `${v}mm` }, "kk");
  it("подписи на языке книги, ссылка — только по запросу", () => {
    const card = html(<MediaCard kit={kit} media={media[0]} />);
    expect(card).toContain(kk.book.media.video);
    expect(card).toContain(kk.book.media.scan.video);
    expect(card).toContain("YouTube");
    expect(card).not.toContain("<a ");
    expect(html(<MediaCard kit={kit} media={media[0]} href={media[0].url} />)).toContain('href="https://youtu.be/dQw4w9WgXcQ"');
  });
});
