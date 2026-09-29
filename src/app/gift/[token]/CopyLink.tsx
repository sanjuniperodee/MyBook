"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

export function CopyLink({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Скопировано" : "Скопировать ссылку"}
      </button>
      <a className="btn btn-outline btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-4" /> Отправить в WhatsApp
      </a>
    </div>
  );
}
