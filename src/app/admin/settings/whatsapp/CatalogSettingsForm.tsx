"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import type { CatalogSettings } from "@/modules/messaging/domain/catalog";
import { checkCatalogAccessAction, saveCatalogDocsAction, saveCatalogSettingsAction } from "../../catalog/actions";
import { Actions, Field, Group, Note, Section } from "../ui";

/**
 * Каталог WhatsApp в чатах (docs/whatsapp-catalog.md): кнопка «Товар из каталога» в чате, тексты ссылки на весь каталог и
 * подписи под карточкой, валюта новых товаров, можно ли отправлять скрытые товары. Проверка доступа — получить у WhatsApp
 * токен для правки каталога.
 */
export function CatalogSettingsForm(props: { settings: CatalogSettings; products: number; gowa: boolean; link: string | null; docs: { key: string; label: string; value: string; fallback: string }[] }) {
  const [pending, start] = useTransition();
  const [checking, check] = useTransition();
  const [s, setS] = useState(props.settings);
  const set = <K extends keyof CatalogSettings>(k: K, v: CatalogSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const save = () =>
    start(async () => {
      const r = await saveCatalogSettingsAction(s);
      toast(r.ok ? "Сохранено" : r.error, r.ok ? "success" : "error");
    });
  const [docs, setDocs] = useState<Record<string, string>>(Object.fromEntries(props.docs.map((d) => [d.key, d.value])));
  const [savingDocs, startDocs] = useTransition();
  const saveDocs = () =>
    startDocs(async () => {
      const r = await saveCatalogDocsAction(docs);
      toast(r.ok ? "Документы WhatsApp сохранены" : r.error, r.ok ? "success" : "error");
    });
  const verify = () =>
    check(async () => {
      const r = await checkCatalogAccessAction();
      toast(r.ok ? "WhatsApp разрешает править каталог из CRM" : r.error, r.ok ? "success" : "error");
    });
  const status = !props.gowa ? { tone: "off" as const, label: "нужен свой шлюз WhatsApp" } : props.settings.enabled ? { tone: "ok" as const, label: `в чатах, товаров: ${props.products}` } : { tone: "off" as const, label: "выключен в чатах" };
  return (
    <Section id="wa-catalog" defaultOpen={false} title="Каталог WhatsApp" description="Товары WhatsApp Business: отправка из чата, ссылка на каталог, подписи" status={status}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Note>
          Товары ведутся в разделе <Link href="/admin/catalog" className="link">«Каталог WhatsApp»</Link> (право «Вести каталог товаров WhatsApp»), отправляют их из чата кнопкой «Товар из каталога» все, кто
          отвечает клиентам. Клиент получает карточку WhatsApp: фото, цену и кнопку «Написать продавцу»; корзина клиента приходит в чат карточкой.
          {props.link ? (
            <>
              {" "}
              Ссылка на весь каталог: <span className="font-mono">{props.link}</span>.
            </>
          ) : null}
        </Note>
        <Group title="В чатах">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Кнопка «Товар из каталога» в чате WhatsApp
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.sendHidden} onChange={(e) => set("sendHidden", e.target.checked)} /> Можно отправлять скрытые товары (клиент откроет карточку, но в каталоге товара не увидит)
          </label>
        </Group>
        <Group title="Карточка товара" hint="Подпись под карточкой в чате клиента; {name} — название, {price} — цена. Пусто — без подписи.">
          <Field label="Подпись">
            <textarea className="input min-h-20" value={s.productText} maxLength={1000} onChange={(e) => set("productText", e.target.value)} placeholder="{name} — {price}. Напишите, и мы оформим заказ" />
          </Field>
        </Group>
        <Group title="Ссылка на весь каталог" hint="Кнопка «Весь каталог» в чате: текст, затем ссылка с превью (обложка — фото первого товара).">
          <Field label="Текст сообщения">
            <textarea className="input min-h-16" value={s.linkText} maxLength={1000} onChange={(e) => set("linkText", e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Заголовок превью">
              <input className="input" value={s.linkTitle} maxLength={100} onChange={(e) => set("linkTitle", e.target.value)} />
            </Field>
            <Field label="Описание превью">
              <input className="input" value={s.linkDescription} maxLength={200} onChange={(e) => set("linkDescription", e.target.value)} />
            </Field>
          </div>
        </Group>
        <Group title="Новые товары">
          <Field label="Валюта по умолчанию" className="w-40">
            <input className="input uppercase" value={s.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </Field>
        </Group>
        <Group title="Документы WhatsApp" hint="Номера запросов WhatsApp Web (doc_id). WhatsApp иногда их меняет — тогда правки каталога вернут ошибку с названием запроса; новый номер вписывается сюда, без выкатки. Пусто — номер по умолчанию.">
          <details>
            <summary className="cursor-pointer text-sm text-ink-soft">Показать {Object.values(docs).filter(Boolean).length ? `(заменено: ${Object.values(docs).filter(Boolean).length})` : ""}</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {props.docs.map((d) => (
                <Field key={d.key} label={d.label}>
                  <input className="input font-mono text-xs" inputMode="numeric" value={docs[d.key] ?? ""} placeholder={d.fallback} onChange={(e) => setDocs((prev) => ({ ...prev, [d.key]: e.target.value.replace(/\D/g, "") }))} />
                </Field>
              ))}
            </div>
            <button type="button" className="btn btn-outline btn-sm mt-3" disabled={savingDocs} onClick={saveDocs}>
              {savingDocs ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить документы
            </button>
          </details>
        </Group>
        <Actions>
          <button className="btn btn-dark" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить
          </button>
          {props.gowa ? (
            <button type="button" className="btn btn-outline" disabled={checking} onClick={verify} title="Получить у WhatsApp доступ к правке каталога">
              {checking ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />} Проверить доступ к каталогу
            </button>
          ) : null}
        </Actions>
      </form>
    </Section>
  );
}
