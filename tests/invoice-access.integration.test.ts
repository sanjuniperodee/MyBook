import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";

/**
 * Оплата счёта из чата → клиент заводится, сделка, чат, платёж и чек привязываются, доступ уходит в чат (с маской в CRM),
 * договорённость видна оформлению заказа (PostgreSQL, собранное приложение из container()).
 * Запуск: INTEGRATION=1 npx vitest run tests/invoice-access.integration.test.ts (база из DATABASE_URL, миграции до 0034).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `ia${Date.now()}`;
const phone = `77${String(Date.now()).slice(-9)}`;

run("после оплаты счёта: клиент, привязка, доступ (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const sent: string[] = [];
  let c: Awaited<ReturnType<typeof load>>;
  const load = async () => (await import("@/server/container")).container();

  beforeAll(async () => {
    c = await load();
    // Сообщения клиенту не уходят в сеть: канал доставки — двойник (хранение в CRM — настоящее).
    (c.messaging.chats as unknown as { transport: { send(conv: unknown, id: string, text: string): Promise<unknown> } }).transport = {
      send: async (_conv, _id, text) => (sent.push(text), { ok: true, externalId: null }),
    };
    const [mgr] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, role) values (${tag + "m@t.kz"}, 'x', 'Менеджер', 'admin') returning id`);
    const [open] = await q<{ id: string }>(sql`select s.id from crm_stages s join crm_pipelines p on p.id = s.pipeline_id where s.kind = 'open' order by p.position, p.created_at, s.position limit 1`);
    const [deal] = await q<{ id: string }>(sql`
      insert into crm_deals (title, stage_id, amount, source, assignee_id, contact_name, contact_phone)
      values (${tag + " Заявка из WhatsApp"}, ${open.id}, 0, 'whatsapp', ${mgr.id}, 'Айгерим', ${phone}) returning id`);
    const [conv] = await q<{ id: string }>(sql`
      insert into crm_conversations (channel, channel_id, chat_id, contact_name, deal_id, assignee_id)
      values ('whatsapp', ${tag}, ${phone}, 'Айгерим', ${deal.id}, ${mgr.id}) returning id`);
    // Чек, приложенный к сделке до клиента, — тоже должен перейти к клиенту.
    await q(sql`insert into crm_receipts (deal_id, storage_key, file_name, mime, size, amount) values (${deal.id}, ${"receipts/" + deal.id + "/x.pdf"}, 'чек.pdf', 'application/pdf', 1, 0)`);
    Object.assign(ids, { mgr: mgr.id, deal: deal.id, conv: conv.id, firstStage: open.id });
  });

  afterAll(async () => {
    await q(sql`delete from deal_invoices where deal_id = ${ids.deal}`);
    await q(sql`delete from crm_conversations where id = ${ids.conv}`);
    await q(sql`delete from crm_deals where id = ${ids.deal}`);
    await q(sql`delete from users where email like ${tag + "%"} or phone = ${phone}`);
    await pool.end();
  });

  const accessOf = async () => (await q<{ access_status: string; access_user_id: string | null; access_message_id: string | null }>(sql`select access_status, access_user_id, access_message_id from deal_invoices where id = ${ids.invoice}`))[0];
  const counts = async () =>
    (
      await q<{ notes: number; tasks: number; messages: number; users: number; links: number }>(sql`
        select (select count(*) from crm_notes where deal_id = ${ids.deal})::int as notes,
               (select count(*) from crm_tasks where deal_id = ${ids.deal})::int as tasks,
               (select count(*) from crm_messages where conversation_id = ${ids.conv})::int as messages,
               (select count(*) from users where phone = ${phone})::int as users,
               (select count(*) from password_resets r join users u on u.id = r.user_id where u.phone = ${phone})::int as links`)
    )[0];

  it("оплата Kaspi по счёту: клиент заведён по номеру чата, сделка/чат/платёж/чек привязаны, доступ в чате с маской", async () => {
    const { invoice } = await c.ordering.invoices.issue({
      dealId: ids.deal,
      conversationId: ids.conv,
      phone,
      clientName: "Айгерим Тестова",
      locale: "ru",
      channel: "instagram",
      plan: "hardcover",
      agreedTotal: 30000,
      amount: 15000,
      purpose: "prepayment",
      actor: { userId: ids.mgr, label: "m" },
      maxDiscountPercent: null,
    });
    ids.invoice = invoice.id;
    expect(await c.ordering.invoices.confirmOnline({ invoiceId: invoice.id, method: "kaspi", ref: tag, amount: 15000 })).toBe("paid");
    // Выдачу берёт быстрый путь после оплаты или проход планировщика — ждём итога.
    for (let i = 0; i < 100 && (await accessOf()).access_status === "due"; i++) {
      await c.invoiceAccess.run();
      await new Promise((r) => setTimeout(r, 50));
    }
    const access = await accessOf();
    expect(access.access_status).toBe("sent");

    const [client] = await q<{ id: string; email: string; role: string; locale: string; name: string; manager_id: string; source: Record<string, string> }>(sql`select id, email, role, locale, name, manager_id, source from users where phone = ${phone}`);
    expect(client).toMatchObject({ email: `${phone}@phone.invalid`, role: "user", locale: "ru", name: "Айгерим Тестова", manager_id: ids.mgr, source: { source: "instagram", medium: "manual" } });
    expect(access.access_user_id).toBe(client.id);
    ids.client = client.id;

    const [deal] = await q<{ client_id: string; amount: number; agreed_plan: string; stage: string; first: boolean }>(sql`select d.client_id, d.amount, d.agreed_plan, s.name as stage, s.id = ${ids.firstStage} as first from crm_deals d join crm_stages s on s.id = d.stage_id where d.id = ${ids.deal}`);
    expect(deal).toMatchObject({ client_id: client.id, amount: 30000, agreed_plan: "hardcover", first: false });
    expect((await q<{ client_id: string }>(sql`select client_id from crm_conversations where id = ${ids.conv}`))[0].client_id).toBe(client.id);
    expect(await q(sql`select client_id, method, external_ref, amount from crm_payments where deal_id = ${ids.deal}`)).toEqual([{ client_id: client.id, method: "kaspi", external_ref: tag, amount: 15000 }]);
    expect(await q(sql`select client_id from crm_receipts where deal_id = ${ids.deal}`)).toEqual([{ client_id: client.id }]);

    // Клиенту — ссылка целиком; в CRM (сообщение, превью) — с маской; ссылка — одна, назначения access, на 72 часа.
    const link = sent.find((t) => t.includes("/reset/"));
    expect(link).toMatch(/Задайте пароль и войдите: \S+\/reset\/[A-Za-z0-9_-]{43}/);
    const [msg] = await q<{ text: string }>(sql`select text from crm_messages where id = ${access.access_message_id}`);
    expect(msg.text).toContain("/reset/••••");
    expect(msg.text).not.toMatch(/\/reset\/[A-Za-z0-9_-]{8}/);
    const [conv] = await q<{ last_message_text: string }>(sql`select last_message_text from crm_conversations where id = ${ids.conv}`);
    expect(conv.last_message_text).not.toMatch(/\/reset\/[A-Za-z0-9_-]{8}/);
    const resets = await q<{ purpose: string; hours: number; used: boolean }>(sql`select purpose, round(extract(epoch from expires_at - created_at) / 3600)::int as hours, used_at is not null as used from password_resets where user_id = ${client.id}`);
    expect(resets).toEqual([{ purpose: "access", hours: 72, used: false }]);

    // Заметки и задачи — без ссылки; условия и задача «получить остаток» ответственному.
    const notes = (await q<{ text: string }>(sql`select text from crm_notes where deal_id = ${ids.deal}`)).map((n) => n.text.replace(/[\u00a0\u202f]/g, " "));
    expect(notes.join("\n")).not.toContain("/reset/");
    expect(notes.some((n) => n.startsWith(`Оплачен счёт ${invoice.label} — 15 000 ₸ (Kaspi, операция ${tag})`))).toBe(true);
    expect(notes.some((n) => n.includes("договорённость 30 000 ₸ за книгу, оплачено всего 15 000 ₸, остаток 15 000 ₸"))).toBe(true);
    const tasks = await q<{ title: string; assignee_id: string }>(sql`select title, assignee_id from crm_tasks where deal_id = ${ids.deal}`);
    expect(tasks.map((t) => [t.title.replace(/[\u00a0\u202f]/g, " ").startsWith("Получить остаток 15 000 ₸ по договорённости"), t.assignee_id])).toEqual([[true, ids.mgr]]);
  });

  it("договорённость видна оформлению заказа: цена, тариф и вычет внесённого; выручка не задваивается", async () => {
    expect(await c.sales.agreementFor(ids.client)).toMatchObject({ dealId: ids.deal, agreedTotal: 30000, prepaid: 15000, plan: "hardcover" });
    const [ltv] = await q<{ sum: number }>(sql`select coalesce(sum(amount), 0)::int as sum from revenue_events where client_id = ${ids.client}`);
    expect(ltv.sum).toBe(15000);
  });

  it("повтор прохода и события ничего не задваивает", async () => {
    const before = await counts();
    await c.invoiceAccess.run();
    await c.invoiceAccess.process(ids.invoice);
    const [e] = await q<{ payload: Record<string, unknown> }>(sql`select payload from outbox_events where type = 'ordering.deal_invoice_paid' and payload->>'invoiceId' = ${ids.invoice}`);
    await c.invoiceAccess.paidNote(e.payload as never);
    expect(await counts()).toEqual(before);
    expect(before).toMatchObject({ users: 1, links: 1 });
  });

  it("ссылка из сообщения: просмотр страницы её не тратит, пароль задаётся один раз, дальше — вход по телефону", async () => {
    const token = /\/reset\/([A-Za-z0-9_-]{43})/.exec(sent.find((t) => t.includes("/reset/"))!)![1];
    expect(await c.identity.auth.linkInfo(token)).toEqual({ purpose: "access", valid: true });
    expect(await c.identity.auth.linkInfo(token)).toEqual({ purpose: "access", valid: true });
    await expect(c.identity.auth.resetPassword(token, "Secret12345")).rejects.toMatchObject({ code: "resetExpired" });
    const r = await c.identity.auth.redeemAccessLink(token, "Secret12345");
    expect(r.user.id).toBe(ids.client);
    expect(await c.identity.auth.linkInfo(token)).toEqual({ purpose: "access", valid: false });
    await expect(c.identity.auth.redeemAccessLink(token, "Other12345")).rejects.toMatchObject({ code: "resetExpired" });
    expect((await c.identity.auth.login({ login: phone, password: "Secret12345", locale: "ru" })).kind).toBe("session");
    expect((await q<{ role: string }>(sql`select role from users where id = ${ids.client}`))[0].role).toBe("user");
  });
});
