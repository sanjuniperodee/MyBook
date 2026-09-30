"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { useMessages } from "@/i18n/client";

export function CopyLink({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const t = useMessages().gift.copy;
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
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? t.copied : t.copy}
      </button>
      <a className="btn btn-outline btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-4" /> {t.whatsapp}
      </a>
    </div>
  );
}
