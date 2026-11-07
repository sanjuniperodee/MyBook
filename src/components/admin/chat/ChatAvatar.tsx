import { Camera, Globe, Mail, Send, UserRound } from "lucide-react";
import { cn } from "@/lib/class-names";
import { WaIcon } from "../WhatsappCall";

/** Значок канала на аватаре: белый кружок со знаком канала его цветом-токеном (без фирменных заливок — одна палитра). */
const CHANNEL_BADGE: Record<string, { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; tone: string; label: string }> = {
  whatsapp: { icon: WaIcon, tone: "text-success", label: "WhatsApp" },
  instagram: { icon: Camera, tone: "text-wine", label: "Instagram" },
  telegram: { icon: Send, tone: "text-info", label: "Telegram" },
  site: { icon: Globe, tone: "text-wine", label: "Сайт" },
  email: { icon: Mail, tone: "text-ink-soft", label: "Почта" },
};

/**
 * Аватар без фото — буква на тонированной подложке. Тон стабилен по имени (собеседников легче различать в списке) и
 * берётся из статусных пар токенов: в тёмной теме они сами становятся тёмными.
 */
const TONES = ["bg-rose text-wine", "bg-success-bg text-success", "bg-info-bg text-info", "bg-warning-bg text-warning", "bg-sunken text-ink-soft"];
const toneOf = (name: string) => TONES[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length];

const SIZES = {
  40: { box: "size-10 text-sm", badge: "size-4", icon: "size-2.5" },
  44: { box: "size-11 text-[15px]", badge: "size-[18px]", icon: "size-3" },
  48: { box: "size-12 text-base", badge: "size-[18px]", icon: "size-3" },
  56: { box: "size-14 text-lg", badge: "size-5", icon: "size-3" },
  72: { box: "size-[72px] text-2xl", badge: "size-6", icon: "size-3.5" },
} as const;

export function ChatAvatar({ name, url, channel, size = 44 }: { name: string; url: string | null; channel?: string; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  const badge = channel ? CHANNEL_BADGE[channel] : undefined;
  // Первая буква имени; у номера телефона букв нет — значок человека.
  const letter = /\p{L}/u.exec(name)?.[0] ?? null;
  return (
    <span className={cn("relative inline-block shrink-0", s.box)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={cn("rounded-full object-cover", s.box)} loading="lazy" />
      ) : (
        <span className={cn("flex items-center justify-center rounded-full font-semibold uppercase", s.box, toneOf(name))} aria-hidden>
          {letter ?? <UserRound className="size-[45%]" strokeWidth={1.8} />}
        </span>
      )}
      {badge ? (
        <span className={cn("absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-white ring-2 ring-white", s.badge, badge.tone)} title={badge.label}>
          <badge.icon className={s.icon} strokeWidth={2.4} />
        </span>
      ) : null}
    </span>
  );
}
