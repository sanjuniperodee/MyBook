"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Copy, ExternalLink, Link2, MessageCircle, Globe } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { sourcePresets } from "@/modules/marketing/domain/links";
import { normalizeSlug } from "@/shared/domain/slug";
import { archiveLinkAction, createLinkAction, saveWhatsappNumberAction, type LinkState } from "./actions";

const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast("Скопировано"));

/** «Создать ссылку»: куда ведёт, где размещаете, метки и короткий код — одной колонкой, под боковую панель. */
export function LinkBuilder({ pages, baseUrl }: { pages: { path: string; label: string }[]; baseUrl: string }) {
  const [state, action] = useActionState<LinkState, FormData>(createLinkAction, {});
  const [kind, setKind] = useState<"site" | "whatsapp">("site");
  const [name, setName] = useState("");
  const [source, setSource] = useState("instagram");
  const [medium, setMedium] = useState("social");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [path, setPath] = useState("/");
  const [custom, setCustom] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const autoSlug = useMemo(() => normalizeSlug(`${source}-${campaign || name}`), [source, campaign, name]);
  const finalSlug = slugTouched ? normalizeSlug(slug) : autoSlug;
  const origin = baseUrl;
  const group = "space-y-2 border-t border-line pt-4";
  const first = "space-y-2";
  const heading = "text-xs font-semibold text-ink-soft";

  return (
    <form action={action} className="space-y-4" data-testid="link-builder">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="slug" value={finalSlug} />
      <input type="hidden" name="targetPath" value={path} />
      <div className={first}>
        <h3 className={heading}>Куда ведёт ссылка</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setKind("site")} aria-pressed={kind === "site"} className="chip">
            <Globe className="size-4" strokeWidth={1.8} aria-hidden /> На сайт
          </button>
          <button type="button" onClick={() => setKind("whatsapp")} aria-pressed={kind === "whatsapp"} className="chip">
            <MessageCircle className="size-4" strokeWidth={1.8} aria-hidden /> Сразу в WhatsApp
          </button>
        </div>
        <p className="text-xs text-muted">{kind === "whatsapp" ? "Откроет чат с готовым сообщением и кодом ссылки — заявка в CRM получит этот канал" : "Откроет страницу сайта с UTM-метками"}</p>
        <label className="block">
          <span className="label">Название (для себя)</span>
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Instagram — шапка профиля" className="input" />
        </label>
        {kind === "site" ? (
          <label className="block">
            <span className="label">Страница</span>
            {custom ? (
              <input value={path} onChange={(e) => setPath(e.target.value)} maxLength={200} placeholder="/kniga/kniga-mame" className="input font-mono" />
            ) : (
              <select value={path} onChange={(e) => (e.target.value === "__custom" ? setCustom(true) : setPath(e.target.value))} className="input" aria-label="Страница">
                {pages.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.label} ({p.path})
                  </option>
                ))}
                <option value="__custom">Свой адрес…</option>
              </select>
            )}
          </label>
        ) : (
          <label className="block">
            <span className="label">Текст первого сообщения</span>
            <input name="waText" maxLength={300} placeholder="Здравствуйте! Хочу заказать книгу" className="input" />
          </label>
        )}
      </div>

      <div className={group}>
        <h3 className={heading}>Где размещаете</h3>
        <div className="flex flex-wrap gap-1.5">
          {sourcePresets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setSource(p.source);
                setMedium(p.medium);
              }}
              aria-pressed={source === p.source && medium === p.medium}
              className="chip"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className={group}>
        <h3 className={heading}>Метки</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">utm_source</span>
            <input name="utmSource" value={source} onChange={(e) => setSource(e.target.value)} required maxLength={60} className="input font-mono text-xs" />
          </label>
          <label className="block">
            <span className="label">utm_medium</span>
            <input name="utmMedium" value={medium} onChange={(e) => setMedium(e.target.value)} maxLength={60} className="input font-mono text-xs" />
          </label>
          <label className="block">
            <span className="label">utm_campaign</span>
            <input name="utmCampaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} maxLength={60} placeholder="novyi-god" className="input font-mono text-xs" />
          </label>
          <label className="block">
            <span className="label">utm_content</span>
            <input name="utmContent" value={content} onChange={(e) => setContent(e.target.value)} maxLength={60} placeholder="stories-1" className="input font-mono text-xs" />
          </label>
        </div>
      </div>

      <div className={group}>
        <label className="block">
          <span className="label">Короткая ссылка</span>
          <span className="block min-w-0 space-y-1 font-mono text-sm">
            <span className="block truncate text-xs text-muted">{origin}/go/</span>
            <input
              value={finalSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              maxLength={40}
              className="input min-w-0 font-mono"
              aria-label="Код ссылки"
            />
          </span>
        </label>
        <SubmitButton className="btn-dark w-full">
          <Link2 className="size-4" strokeWidth={1.8} aria-hidden /> Создать ссылку
        </SubmitButton>
        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        {state.ok && state.slug ? (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-ctl)] bg-success-bg px-3 py-2 text-sm text-success">
            <span className="min-w-0 break-all">
              {state.ok}: <span className="font-mono">{origin}/go/{state.slug}</span>
            </span>
            <button type="button" className="inline-flex min-h-8 items-center gap-1 font-medium hover:underline" onClick={() => copy(`${origin}/go/${state.slug}`)}>
              <Copy className="size-3.5" aria-hidden /> Скопировать
            </button>
          </div>
        ) : null}
      </div>
    </form>
  );
}

export function LinkRowActions({ id, short, full, archived, canManage }: { id: string; short: string; full: string; archived: boolean; canManage: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1 whitespace-nowrap lg:justify-end">
      <button type="button" className="btn btn-outline btn-sm" onClick={() => copy(short)} title={`Скопировать короткую ссылку: ${short}`}>
        <Copy className="size-3.5" strokeWidth={1.8} aria-hidden /> Короткая
      </button>
      <button type="button" className="btn btn-ghost btn-sm px-2.5" onClick={() => copy(full)} title={`Скопировать полную ссылку с метками: ${full}`} aria-label="Скопировать полную ссылку">
        С метками
      </button>
      <a href={full} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon btn-sm" aria-label="Открыть" title="Открыть">
        <ExternalLink className="size-4" strokeWidth={1.8} />
      </a>
      {canManage ? (
        <button type="button" disabled={pending} className="btn btn-ghost btn-icon btn-sm" onClick={() => start(() => archiveLinkAction(id, !archived))} aria-label={archived ? "Вернуть из архива" : "В архив"} title={archived ? "Вернуть из архива" : "В архив (ссылка перестанет работать)"}>
          {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}

export function WhatsappNumberForm({ value }: { value: string }) {
  const [state, action] = useActionState<LinkState, FormData>(saveWhatsappNumberAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-x-3 gap-y-2 text-sm">
      <div>
        <label htmlFor="shop-whatsapp" className="label">
          WhatsApp магазина
        </label>
        <input id="shop-whatsapp" name="number" defaultValue={value} inputMode="tel" maxLength={20} aria-describedby="shop-whatsapp-hint" className="input w-52 max-w-full font-mono" />
      </div>
      <SubmitButton className="btn-outline">Сохранить</SubmitButton>
      {state.error ? (
        <span role="alert" className="pb-2 text-sm text-danger">
          {state.error}
        </span>
      ) : state.ok ? (
        <span role="status" className="pb-2 text-sm text-success">
          {state.ok}
        </span>
      ) : null}
      <span id="shop-whatsapp-hint" className="hint w-full">
        Сюда ведут ссылки «Сразу в WhatsApp»; этот же номер — в реквизитах на сайте.
      </span>
    </form>
  );
}
