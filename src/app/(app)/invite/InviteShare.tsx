"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Send, Share2 } from "lucide-react";
import { useMessages } from "@/i18n/client";

/** navigator.share есть на телефонах — там «Поделиться» открывает системное меню с любыми мессенджерами. */
const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/** Ссылка-приглашение: скопировать, отправить в WhatsApp или Telegram, системное «Поделиться». */
export function InviteShare({ link, code, message }: { link: string; code: string; message: string }) {
  const t = useMessages().invite;
  const [copied, setCopied] = useState(false);
  const native = useSyncExternalStore(
    () => () => {},
    canShare,
    () => false,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const btn = "btn btn-outline min-w-0 flex-1 sm:flex-none";
  return (
    <div>
      <div className="text-sm font-medium text-muted">{t.yourLink}</div>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        {/* Без https:// — на телефоне так видно код целиком; копируется полная ссылка. */}
        <div className="min-w-0 flex-1 truncate rounded-xl border border-line bg-white px-4 py-3 font-mono text-sm select-all sm:text-[15px]" data-testid="invite-link" data-link={link}>
          {link.replace(/^https?:\/\//, "")}
        </div>
        <button type="button" className="btn btn-primary shrink-0" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? t.copied : t.copy}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <a className={btn} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon /> {t.whatsapp}
        </a>
        <a className={btn} href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message.replace(link, "").trim())}`} target="_blank" rel="noopener noreferrer">
          <Send className="size-4" /> {t.telegram}
        </a>
        {native ? (
          <button type="button" className={btn} onClick={() => navigator.share({ text: message }).catch(() => undefined)}>
            <Share2 className="size-4" /> {t.share}
          </button>
        ) : null}
      </div>
      <p className="mt-4 text-sm text-muted">{t.yourCode(code)}</p>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-[#25D366]" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
