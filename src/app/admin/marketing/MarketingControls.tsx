"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Copy, ExternalLink, Link2, MessageCircle, Globe } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { normalizeSlug, sourcePresets } from "@/modules/marketing/domain/channels";
import { cn } from "@/lib/utils";
import { archiveLinkAction, createLinkAction, saveWhatsappNumberAction, type LinkState } from "./actions";

const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast("Скопировано"));

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

  return (
    <form action={action} className="space-y-4 rounded-xl border border-dashed border-line bg-[#fbf9f5] p-4" data-testid="link-builder">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="slug" value={finalSlug} />
      <input type="hidden" name="targetPath" value={path} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => setKind("site")} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5", kind === "site" ? "bg-ink text-white" : "bg-white text-ink-soft")}>
          <Globe className="size-4" /> На сайт
        </button>
        <button type="button" onClick={() => setKind("whatsapp")} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5", kind === "whatsapp" ? "bg-emerald-600 text-white" : "bg-white text-ink-soft")}>
          <MessageCircle className="size-4" /> Сразу в WhatsApp
        </button>
        <span className="text-xs text-muted">{kind === "whatsapp" ? "Откроет чат с готовым сообщением и кодом ссылки — заявка в CRM получит этот канал" : "Откроет страницу сайта с UTM-метками"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Название (для себя)</span>
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Instagram — шапка профиля" className="input h-10 text-sm" />
        </label>
        {kind === "site" ? (
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Страница</span>
            {custom ? (
              <input value={path} onChange={(e) => setPath(e.target.value)} maxLength={200} placeholder="/kniga/kniga-mame" className="input h-10 font-mono text-sm" />
            ) : (
              <select value={path} onChange={(e) => (e.target.value === "__custom" ? setCustom(true) : setPath(e.target.value))} className="input h-10 text-sm" aria-label="Страница">
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
            <span className="mb-1 block text-xs text-muted">Текст первого сообщения</span>
            <input name="waText" maxLength={300} placeholder="Здравствуйте! Хочу заказать книгу" className="input h-10 text-sm" />
          </label>
        )}
      </div>
      <div>
        <span className="mb-1.5 block text-xs text-muted">Где размещаете</span>
        <div className="flex flex-wrap gap-1.5">
          {sourcePresets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setSource(p.source);
                setMedium(p.medium);
              }}
              className={cn("rounded-full border px-3 py-1 text-xs", source === p.source && medium === p.medium ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-cream")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">utm_source</span>
          <input name="utmSource" value={source} onChange={(e) => setSource(e.target.value)} required maxLength={60} className="input h-9 font-mono text-xs" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">utm_medium</span>
          <input name="utmMedium" value={medium} onChange={(e) => setMedium(e.target.value)} maxLength={60} className="input h-9 font-mono text-xs" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">utm_campaign</span>
          <input name="utmCampaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} maxLength={60} placeholder="novyi-god" className="input h-9 font-mono text-xs" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">utm_content</span>
          <input name="utmContent" value={content} onChange={(e) => setContent(e.target.value)} maxLength={60} placeholder="stories-1" className="input h-9 font-mono text-xs" />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Короткая ссылка</span>
          <span className="flex items-center gap-1 font-mono text-sm">
            <span className="text-muted">{origin}/go/</span>
            <input
              value={finalSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              maxLength={40}
              className="input h-9 w-52 font-mono text-sm"
              aria-label="Код ссылки"
            />
          </span>
        </label>
        <SubmitButton className="btn-sm h-9">
          <Link2 className="size-4" /> Создать ссылку
        </SubmitButton>
        {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
        {state.ok && state.slug ? (
          <button type="button" className="flex items-center gap-1 text-xs text-emerald-700 hover:underline" onClick={() => copy(`${origin}/go/${state.slug}`)}>
            {state.ok}: {origin}/go/{state.slug} <Copy className="size-3.5" />
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function LinkRowActions({ id, short, full, archived, canManage }: { id: string; short: string; full: string; archived: boolean; canManage: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
      <button type="button" className="btn btn-outline btn-sm h-8" onClick={() => copy(short)} title={short}>
        <Copy className="size-3.5" /> Короткая
      </button>
      <button type="button" className="btn btn-ghost btn-sm h-8 px-2" onClick={() => copy(full)} title={`Полная ссылка с метками: ${full}`} aria-label="Скопировать полную ссылку">
        UTM
      </button>
      <a href={full} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-ink" aria-label="Открыть">
        <ExternalLink className="size-4" />
      </a>
      {canManage ? (
        <button type="button" disabled={pending} className="text-muted hover:text-ink" onClick={() => start(() => archiveLinkAction(id, !archived))} aria-label={archived ? "Вернуть из архива" : "В архив"} title={archived ? "Вернуть из архива" : "В архив (ссылка перестанет работать)"}>
          {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}

export function WhatsappNumberForm({ value }: { value: string }) {
  const [state, action] = useActionState<LinkState, FormData>(saveWhatsappNumberAction, {});
  return (
    <form action={action} className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Номер WhatsApp для ссылок «Сразу в WhatsApp»</span>
        <input name="number" defaultValue={value} inputMode="tel" maxLength={20} className="input h-9 w-52 font-mono text-sm" />
      </label>
      <SubmitButton className="btn-outline btn-sm h-9">Сохранить</SubmitButton>
      {state.error ? <span className="text-xs text-red-700">{state.error}</span> : state.ok ? <span className="text-xs text-emerald-700">{state.ok}</span> : null}
    </form>
  );
}
