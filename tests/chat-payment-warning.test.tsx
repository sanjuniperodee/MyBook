import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Плашка «кассир Kaspi отключён» над полем ввода чата (план P0-2): видна в режиме ответа клиенту, сообщения при этом уходят.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/app/admin/ai-actions", () => ({ aiSuggestReplyAction: vi.fn() }));
vi.mock("@/app/admin/chats/actions", () => ({ deleteMessageAction: vi.fn(), editMessageAction: vi.fn(), markReadAction: vi.fn(), sendInternalNoteAction: vi.fn(), sendMessageAction: vi.fn(), sendOfferAction: vi.fn(), forwardMessageAction: vi.fn(), forwardTargetsAction: vi.fn() }));
vi.mock("@/app/admin/invoices/actions", () => ({ invoiceFormInfoAction: vi.fn(), issueInvoiceAction: vi.fn() }));
vi.mock("@/app/admin/deals/actions", () => ({ setDealAgreedPlanAction: vi.fn() }));

const { ChatPanel } = await import("@/components/admin/ChatPanel");

const panel = (paymentWarning?: string | null) =>
  renderToStaticMarkup(<ChatPanel conversationId="c1" messages={[]} canSend templates={[]} vars={{ name: "Айгерим", order: null, link: "https://mybook.kz", manager: "Марат" }} invoice={{ dealId: "d1" }} paymentWarning={paymentWarning} timeZone="Asia/Almaty" />);

describe("чат: плашка о кассире Kaspi", () => {
  it("кассир отключён — жёлтая плашка над полем ввода", () => {
    const out = panel("Кассир Kaspi отключён с 14:05 — оплаты Kaspi не подтверждаются сами");
    expect(out).toContain('data-testid="chat-payment-warning"');
    expect(out).toContain("Кассир Kaspi отключён с 14:05");
  });

  it("кассир работает — плашки нет", () => {
    expect(panel(null)).not.toContain("chat-payment-warning");
    expect(panel()).not.toContain("chat-payment-warning");
  });
});
