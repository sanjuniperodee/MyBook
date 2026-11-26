import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, GitCommitHorizontal, MessageCircle, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionHead } from "@/components/admin/SectionHead";
import { Badge } from "@/components/ui/Badge";
import { Facts } from "@/components/ui/Facts";
import { formatDate } from "@/lib/dates";
import { can, requireStaff } from "@/web/access";
import { env } from "@/config/env";
import { chatMessageText, notificationText, ticketLabel } from "@/modules/support/domain";
import { SUPPORT_KIND_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_STATUSES, type SupportAttachment, type SupportStatus } from "@/shared/domain/support";
import { phoneLabel, RESOLUTION_SLOT, STATUS_TONE } from "../labels";
import { canOpenTicket, seesAllTickets } from "@/web/support-access";
import { CopyButton, TicketControls } from "./TicketControls";
import { TicketChatPicker } from "../ChatPicker";
import { crmRead } from "@/web/crm";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Обращение №${(await params).number}` };
}

const ENGINE: Record<string, string> = { gemini: "Gemini", whisper: "Whisper — на казахском и смешанной речи может ошибаться" };

function Attachment({ ticketId, a, index }: { ticketId: string; a: SupportAttachment; index: number }) {
  const src = `/api/admin/support/${ticketId}/files/${a.id}`;
  const size = `${(a.size / 1024 / 1024).toFixed(1)} МБ`;
  return (
    <li className="space-y-2 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">
          {index + 1}. {a.recorded ? "Голосовое, записано в форме" : a.name}
        </span>
        <a href={`${src}?download=1`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <Download className="size-3.5" aria-hidden /> {size}
        </a>
      </div>
      {a.kind === "image" ? (
        <a href={src} target="_blank" rel="noreferrer" className="block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- вложение отдаёт свой роут с проверкой прав */}
          <img src={src} alt={a.name} className="max-h-96 max-w-full rounded-[8px] ring-1 ring-line" loading="lazy" />
        </a>
      ) : a.kind === "video" ? (
        <video src={src} controls preload="metadata" className="max-h-[28rem] max-w-full rounded-[8px] bg-ink" />
      ) : a.kind === "audio" ? (
        <audio src={src} controls preload="metadata" className="w-full max-w-md" />
      ) : (
        <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm underline">
          <FileText className="size-4" aria-hidden /> Открыть файл
        </a>
      )}
      {a.kind === "audio" || a.kind === "video" ? (
        a.transcript ? (
          <div className="rounded-[10px] bg-sunken px-3 py-2.5">
            <div className="text-xs text-muted">Расшифровка · {ENGINE[a.transcriptBy ?? ""] ?? a.transcriptBy}</div>
            <p className="mt-1 text-sm whitespace-pre-wrap">{a.transcript}</p>
          </div>
        ) : (
          <p className="text-xs text-muted">{a.transcriptError ? `Не расшифровано: ${a.transcriptError}` : "Расшифровываем…"}</p>
        )
      ) : null}
    </li>
  );
}

/** Карточка обращения: суть от AI, описание, вложения с расшифровками, статус и уведомление, коммиты и история. */
export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  const staff = await requireStaff();
  const n = Number((await params).number);
  const t = Number.isSafeInteger(n) && n > 0 ? await crmRead("pages.supportTicket", { number: n }) : null;
  if (!t || !canOpenTicket(staff, t)) notFound();
  const canEdit = seesAllTickets(staff);
  const notifyPreview = Object.fromEntries(SUPPORT_STATUSES.map((s) => [s, notificationText({ ...t, status: s, resolution: RESOLUTION_SLOT }, env.appUrl)])) as Record<SupportStatus, string>;
  const listening = t.attachments.some((a) => (a.kind === "audio" || a.kind === "video") && !a.transcript && !a.transcriptError);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/admin/support", label: "Обращения" }}
        title={ticketLabel(t.number)}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[t.status]} dot>
              {SUPPORT_STATUS_LABELS[t.status]}
            </Badge>
            {t.urgency === "urgent" ? <Badge tone="danger">срочно</Badge> : null}
            <span className="text-sm text-muted">
              {SUPPORT_KIND_LABELS[t.kind]} · {formatDate(t.createdAt, true)}
            </span>
          </span>
        }
        actions={canEdit ? <CopyButton text={ticketLabel(t.number)} label="Номер для Claude" /> : undefined}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Суть</h2>
              <span className="text-xs text-muted">AI по описанию и расшифровкам</span>
            </div>
            <div className="panel-body text-sm whitespace-pre-wrap">{t.summary || (listening || !t.processedAt ? "Разбираем вложения — обновите страницу через минуту." : "AI-помощник не ответил — смотрите описание и вложения.")}</div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Как написали</h2>
            </div>
            <div className="panel-body space-y-4">
              <p className="text-sm whitespace-pre-wrap">{t.description || <span className="text-muted">Текста нет — всё во вложениях.</span>}</p>
              <Facts
                items={[
                  { label: "Где", value: t.place, hidden: !t.place },
                  { label: "Как должно быть", value: t.expected, hidden: !t.expected },
                  { label: "Устройство", value: [t.device, t.userAgent].filter(Boolean).join(" · "), hidden: !t.device && !t.userAgent },
                ]}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Переписка с клиентом</h2>
              {t.chat ? (
                <Link href={`/admin/chats?c=${t.chat.conversationId}`} className="text-xs text-muted underline">
                  открыть чат
                </Link>
              ) : null}
            </div>
            <div className="panel-body space-y-4">
              {t.chat ? (
                <ol className="space-y-2">
                  {t.chat.messages.map((m) => (
                    <li key={m.id} className={m.direction === "in" ? "rounded-[10px] bg-sunken px-3 py-2" : "rounded-[10px] border border-line px-3 py-2"}>
                      <span className="text-xs text-muted">
                        {m.direction === "in" ? t.chat?.contact || "клиент" : "магазин"} · {formatDate(m.at, true)}
                        {m.type === "audio" && m.transcriptBy ? ` · расшифровка ${ENGINE[m.transcriptBy] ?? m.transcriptBy}` : ""}
                      </span>
                      <span className="block text-sm whitespace-pre-wrap">{chatMessageText(m)}</span>
                      {m.transcriptError && !m.transcript ? <span className="block text-xs text-danger">Не расшифровано: {m.transcriptError}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">Если обращение пришло из чата клиента — выберите чат и сообщения: AI сверит просьбу с тем, что писал клиент, а голосовые расшифруются.</p>
              )}
              {can(staff, "chats.view") ? <TicketChatPicker ticketId={t.id} number={t.number} initialQuery={t.clientPhone || t.chat?.chatId || ""} linked={t.chat ? { chat: { id: t.chat.conversationId, contact: t.chat.contact, chatId: t.chat.chatId, channel: "whatsapp", last: "", lastAt: null }, ids: t.chat.messages.map((m) => m.id) } : null} /> : null}
            </div>
          </section>

          {t.attachments.length ? (
            <section aria-labelledby="att-h" className="space-y-3">
              <SectionHead id="att-h" title={`Вложения · ${t.attachments.length}`} />
              <ul className="panel divide-y divide-line overflow-hidden">
                {t.attachments.map((a, i) => (
                  <Attachment key={a.id} ticketId={t.id} a={a} index={i} />
                ))}
              </ul>
            </section>
          ) : null}

          {t.commits.length ? (
            <section aria-labelledby="commits-h" className="space-y-3">
              <SectionHead id="commits-h" title="Выкачено" />
              <ul className="panel divide-y divide-line overflow-hidden text-sm">
                {t.commits.map((c) => (
                  <li key={c.sha} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
                    <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <code className="text-xs">{c.sha.slice(0, 7)}</code> {c.subject}
                      <span className="block text-xs text-muted">
                        {c.release} · {formatDate(c.at, true)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Кто и куда писать</h2>
            </div>
            <div className="panel-body">
              <Facts
                items={[
                  { label: "Написал", value: t.reporterName || "—" },
                  {
                    label: "Уведомление",
                    value: t.notifyPhone ? (
                      <span className="space-y-0.5">
                        <a href={`https://wa.me/${t.notifyPhone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                          <MessageCircle className="size-3.5" aria-hidden /> {phoneLabel(t.notifyPhone)}
                        </a>
                        {t.notifiedAt ? <span className="block text-xs text-muted">отправлено {formatDate(t.notifiedAt, true)}</span> : null}
                        {t.notifyError ? <span className="block text-xs text-danger">{t.notifyError}</span> : null}
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: "Клиент",
                    value: (
                      <Link href={`/admin/search?q=${t.clientPhone}`} className="inline-flex items-center gap-1 underline">
                        <Search className="size-3.5" aria-hidden /> {phoneLabel(t.clientPhone)}
                      </Link>
                    ),
                    hidden: !t.clientPhone,
                  },
                ]}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Работа</h2>
            </div>
            <div className="panel-body">
              <TicketControls id={t.id} number={t.number} status={t.status} resolution={t.resolution} devNote={t.devNote} notifyPhone={t.notifyPhone} canEdit={canEdit} notifyPreview={notifyPreview} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">История</h2>
            </div>
            <ol className="panel-body space-y-2 text-sm">
              {[...t.history].reverse().map((e, i) => (
                <li key={i}>
                  <span className="text-xs text-muted">
                    {formatDate(e.at, true)} · {e.by}
                  </span>
                  <span className="block">{e.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
