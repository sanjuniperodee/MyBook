import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble, hasCaption, type Msg } from "@/components/admin/chat/MessageBubble";

/**
 * Время и галочки в пузыре чата: с текстом — на его последней строке (место зарезервировано), без текста — своей строкой.
 * Иначе у голосового они наезжали на «расшифровать» и «скачать».
 */
const msg = (over: Partial<Msg>): Msg => ({ id: "m1", direction: "out", type: "text", text: "Здравствуйте", mediaUrl: null, status: "read", error: null, author: "Айгерим", at: "2026-10-18T06:00:00.000Z", ...over });

const render = (m: Msg) =>
  renderToStaticMarkup(
    <MessageBubble m={m} me="staff-1" now={Date.parse("2026-10-18T06:01:00Z")} timeZone="Asia/Almaty" conversationId="c1" canSend highlighted={false} onAction={() => {}} onOpenMedia={() => {}} onJump={() => {}} onVoiceEnded={() => {}} />,
  );

/** Строка со временем «11:00» — её классы. */
function timeRow(html: string) {
  const at = html.indexOf(">11:00<");
  const open = html.lastIndexOf("<div", at);
  return html.slice(open, html.indexOf(">", open));
}

describe("время и галочки в пузыре чата", () => {
  it("голосовое: подпись-заглушка не текст — время отдельной строкой под плеером, не поверх «расшифровать»", () => {
    const voice = msg({ type: "audio", text: "🎤 Голосовое сообщение", mediaUrl: "/api/admin/whatsapp/media?path=statics%2Fmedia%2Fa.ogg", gateway: true });
    expect(hasCaption(voice)).toBe(false);
    const html = render(voice);
    expect(html).toContain("расшифровать");
    expect(timeRow(html)).not.toContain("-mt-3.5");
    expect(timeRow(html)).not.toContain("float-right");
  });

  it("текст и фото с настоящей подписью — время на последней строке, как в WhatsApp", () => {
    expect(timeRow(render(msg({})))).toContain("float-right");
    const photo = msg({ type: "image", text: "Вот обложка", mediaUrl: "/api/admin/whatsapp/media?path=statics%2Fmedia%2Fa.jpg", gateway: true });
    expect(hasCaption(photo)).toBe(true);
    expect(timeRow(render(photo))).toContain("float-right");
  });

  it("фото без подписи и удалённое — время своей строкой", () => {
    expect(hasCaption(msg({ type: "image", text: "📷 Фото" }))).toBe(false);
    expect(hasCaption(msg({ deleted: true }))).toBe(false);
    expect(timeRow(render(msg({ deleted: true })))).not.toContain("float-right");
  });
});
