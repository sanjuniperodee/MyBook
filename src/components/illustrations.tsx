/**
 * Иллюстрации в едином стиле: тонкая линия цвета чернил, акценты винным и золотым,
 * мягкое пятно фона. Штрихи «прорисовываются» при появлении (класс .draw в globals.css).
 */
import { cn } from "@/lib/utils";

const INK = "#3b332e";
const WINE = "#7a1f2b";
const GOLD = "#b8915a";
const BLOB = "#f3e6df";

type Props = { className?: string };
const d = (len: number, delay = 0) => ({ "--len": len, "--d": delay }) as React.CSSProperties;

function Frame({ className, children, label }: Props & { children: React.ReactNode; label?: string }) {
  return (
    <svg viewBox="0 0 240 180" fill="none" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn("draw", className)}>
      {children}
    </svg>
  );
}

function Blob({ variant = 0 }: { variant?: number }) {
  const paths = [
    "M52 104c-8-38 22-70 64-74 44-4 86 16 90 56 4 42-30 72-78 74-44 2-68-18-76-56z",
    "M40 96c2-40 38-66 82-64 46 2 82 30 78 68-4 40-44 62-86 60-42-2-76-24-74-64z",
  ];
  return <path d={paths[variant % 2]} fill={BLOB} stroke="none" className="no-draw" />;
}

function Sparkle({ x, y, s = 1, color = GOLD, delay = 0 }: { x: number; y: number; s?: number; color?: string; delay?: number }) {
  return (
    <path
      d={`M${x} ${y - 7 * s} L${x + 1.6 * s} ${y - 1.6 * s} L${x + 7 * s} ${y} L${x + 1.6 * s} ${y + 1.6 * s} L${x} ${y + 7 * s} L${x - 1.6 * s} ${y + 1.6 * s} L${x - 7 * s} ${y} L${x - 1.6 * s} ${y - 1.6 * s} Z`}
      fill={color}
      stroke="none"
      className="origin-center animate-pop"
      style={{ animationDelay: `${600 + delay}ms`, transformBox: "fill-box" }}
    />
  );
}

/** Открытая книга с пером — «здесь будет ваша книга». */
export function OpenBookArt({ className }: Props) {
  return (
    <Frame className={className}>
      <Blob />
      <path d="M120 58c-18-10-40-12-62-8v78c22-4 44-2 62 8 18-10 40-12 62-8V50c-22-4-44-2-62 8z" fill="#fff" stroke={INK} strokeWidth="1.8" style={d(420)} />
      <path d="M120 58v78" stroke={INK} strokeWidth="1.6" style={d(80, 200)} />
      <path d="M70 68c12-2 24-1 36 3M70 80c12-2 24-1 36 3M70 92c10-2 20-1 30 2" stroke="#cfc3b6" strokeWidth="1.6" style={d(60, 400)} />
      <path d="M134 71c12-4 24-5 36-3M134 83c12-4 24-5 36-3" stroke="#cfc3b6" strokeWidth="1.6" style={d(60, 500)} />
      <path d="M150 112c4-6 10-6 12 0 2-6 8-6 12 0-3 7-12 11-12 11s-9-4-12-11z" fill={WINE} stroke="none" className="animate-pop" style={{ animationDelay: "900ms", transformBox: "fill-box", transformOrigin: "center" }} />
      <path d="M186 30 L150 96" stroke={INK} strokeWidth="1.8" style={d(90, 300)} />
      <path d="M186 30c6 2 8 8 4 12l-34 58-6 2 1-7 35-65z" fill={GOLD} fillOpacity="0.25" stroke={INK} strokeWidth="1.6" style={d(170, 300)} />
      <Sparkle x={58} y={40} s={0.9} />
      <Sparkle x={200} y={120} s={0.7} color={WINE} delay={200} />
    </Frame>
  );
}

/** Полароиды, приклеенные скотчем. */
export function PhotosArt({ className }: Props) {
  return (
    <Frame className={className}>
      <Blob variant={1} />
      <g transform="rotate(-8 92 92)">
        <rect x="56" y="50" width="72" height="84" rx="2" fill="#fff" stroke={INK} strokeWidth="1.8" style={d(320)} />
        <rect x="63" y="57" width="58" height="52" fill="#f1d9cf" stroke="none" className="no-draw" />
        <path d="M63 100l16-16 12 10 10-8 20 14v9H63z" fill="#c98e86" stroke="none" />
        <circle cx="106" cy="71" r="6" fill="#fff4e6" stroke="none" />
      </g>
      <g transform="rotate(7 150 90)">
        <rect x="114" y="46" width="72" height="84" rx="2" fill="#fff" stroke={INK} strokeWidth="1.8" style={d(320, 250)} />
        <rect x="121" y="53" width="58" height="52" fill="#e8dcc6" stroke="none" className="no-draw" />
        <path d="M121 96c10-12 20-16 30-10s18 4 28-6v25h-58z" fill={GOLD} fillOpacity="0.55" stroke="none" />
        <path d="M130 118c8 2 16 2 24 0" stroke={INK} strokeWidth="1.4" style={d(30, 700)} />
      </g>
      <rect x="138" y="36" width="26" height="10" rx="1.5" fill={WINE} fillOpacity="0.25" transform="rotate(12 150 41)" stroke="none" />
      <rect x="74" y="42" width="26" height="10" rx="1.5" fill={GOLD} fillOpacity="0.35" transform="rotate(-18 87 47)" stroke="none" />
      <Sparkle x={200} y={48} s={0.8} />
      <Sparkle x={44} y={128} s={0.6} color={WINE} delay={200} />
    </Frame>
  );
}

/** Конверт с сургучной печатью и выглядывающим письмом. */
export function LettersArt({ className }: Props) {
  return (
    <Frame className={className}>
      <Blob />
      <path d="M84 70h72v44H84z" fill="#fff" stroke={INK} strokeWidth="1.6" style={d(240)} />
      <path d="M94 82h40M94 92h52M94 102h30" stroke="#cfc3b6" strokeWidth="1.6" style={d(60, 300)} />
      <path d="M64 88l56 36 56-36v58H64z" fill="#fbf4ec" stroke={INK} strokeWidth="1.8" style={d(360, 150)} />
      <path d="M64 146l44-34M176 146l-44-34" stroke={INK} strokeWidth="1.6" style={d(60, 500)} />
      <circle cx="120" cy="124" r="11" fill={WINE} stroke="none" className="animate-pop" style={{ animationDelay: "800ms", transformBox: "fill-box", transformOrigin: "center" }} />
      <path d="M115 123c2-3 5-3 5 0 0-3 3-3 5 0-1 3-5 5-5 5s-4-2-5-5z" fill="#f4e4df" stroke="none" className="animate-pop" style={{ animationDelay: "950ms", transformBox: "fill-box", transformOrigin: "center" }} />
      <path d="M186 60c6-8 16-6 16 2 0 10-16 16-16 16s-16-6-16-16c0-8 10-10 16-2z" fill="none" stroke={WINE} strokeWidth="1.6" style={d(90, 700)} />
      <Sparkle x={52} y={60} s={0.8} />
    </Frame>
  );
}

/** Подарочная коробка с лентой. */
export function GiftArt({ className }: Props) {
  return (
    <Frame className={className}>
      <Blob variant={1} />
      <rect x="78" y="84" width="84" height="60" rx="3" fill="#fff" stroke={INK} strokeWidth="1.8" style={d(300)} />
      <rect x="72" y="70" width="96" height="18" rx="3" fill="#fbf4ec" stroke={INK} strokeWidth="1.8" style={d(240, 150)} />
      <path d="M120 70v74" stroke={WINE} strokeWidth="7" style={d(80, 400)} />
      <path d="M120 70c-10-18-34-20-32-6 2 10 20 8 32 6zM120 70c10-18 34-20 32-6-2 10-20 8-32 6z" fill={WINE} fillOpacity="0.15" stroke={WINE} strokeWidth="1.8" style={d(160, 600)} />
      <Sparkle x={60} y={58} s={0.9} />
      <Sparkle x={184} y={52} s={0.7} color={WINE} delay={150} />
      <Sparkle x={190} y={130} s={0.6} delay={300} />
    </Frame>
  );
}

/** Потерявшаяся страница — для 404. */
export function LostPageArt({ className, label }: Props & { label?: string }) {
  return (
    <Frame className={className} label={label}>
      <Blob />
      <path d="M120 64c-16-9-36-11-56-7v70c20-4 40-2 56 7 16-9 36-11 56-7V57c-20-4-40-2-56 7z" fill="#fff" stroke={INK} strokeWidth="1.8" style={d(400)} />
      <path d="M120 64v70" stroke={INK} strokeWidth="1.6" style={d(70, 200)} />
      <path d="M78 76c10-2 20-1 30 2M78 88c10-2 20-1 30 2" stroke="#cfc3b6" strokeWidth="1.6" style={d(40, 400)} />
      <path d="M146 80c0-8 16-8 16 0 0 6-8 6-8 13" stroke={WINE} strokeWidth="2" style={d(50, 700)} />
      <circle cx="154" cy="101" r="1.6" fill={WINE} stroke="none" />
      <g className="animate-float" style={{ transformBox: "fill-box" }}>
        <path d="M176 26l26 6-6 30-26-6z" fill="#fff" stroke={INK} strokeWidth="1.6" style={d(120, 500)} />
        <path d="M181 37l14 3M180 45l12 3" stroke="#cfc3b6" strokeWidth="1.4" style={d(20, 800)} />
      </g>
      <path d="M160 58c6-6 10-10 16-14" stroke={INK} strokeWidth="1.2" strokeDasharray="2 5" className="no-draw" />
      <Sparkle x={52} y={44} s={0.8} />
    </Frame>
  );
}

/** Надорванная страница — для ошибок. */
export function TornPageArt({ className }: Props) {
  return (
    <Frame className={className}>
      <Blob variant={1} />
      <path d="M80 40h56l20 20v34l-8 6 6 8-10 6 6 10H80z" fill="#fff" stroke={INK} strokeWidth="1.8" style={d(380)} />
      <path d="M136 40v20h20" stroke={INK} strokeWidth="1.6" style={d(50, 300)} />
      <path d="M92 64h32M92 76h40M92 88h30" stroke="#cfc3b6" strokeWidth="1.6" style={d(50, 500)} />
      <path d="M164 106l-6 8 10 6-6 10h22V100z" fill="#fbf4ec" stroke={INK} strokeWidth="1.6" transform="translate(8 6) rotate(8 170 116)" style={d(120, 700)} />
      <path d="M100 118c6-6 14-6 20 0" stroke={WINE} strokeWidth="1.8" style={d(30, 900)} />
    </Frame>
  );
}

/** Книга с сиянием — успех, оплата, готово. */
export function CelebrateArt({ className }: Props) {
  return (
    <Frame className={className}>
      <Blob />
      <path d="M92 50h58a6 6 0 016 6v80a6 6 0 01-6 6H92z" fill={WINE} stroke={INK} strokeWidth="1.8" style={d(320)} />
      <path d="M92 50c-6 0-10 4-10 10v76c0 4 4 6 10 6" fill="#f4e4df" stroke={INK} strokeWidth="1.6" style={d(120, 200)} />
      <rect x="104" y="72" width="40" height="26" rx="2" fill="#fbf4ec" stroke="none" className="no-draw" />
      <path d="M114 83c3-4 7-4 8 0 1-4 5-4 8 0-2 5-8 8-8 8s-6-3-8-8z" fill={WINE} stroke="none" className="animate-pop" style={{ animationDelay: "700ms", transformBox: "fill-box", transformOrigin: "center" }} />
      <path d="M64 70l-12-8M60 96H44M66 120l-12 8M178 70l12-8M182 96h16M176 120l12 8" stroke={GOLD} strokeWidth="2" style={d(20, 600)} />
      <Sparkle x={70} y={40} s={1} />
      <Sparkle x={176} y={40} s={0.8} color={WINE} delay={120} />
      <Sparkle x={186} y={146} s={0.7} delay={240} />
    </Frame>
  );
}

/** Пустое состояние: иллюстрация, заголовок, пояснение и действие. */
export function EmptyState({
  art: Art,
  title,
  text,
  action,
  className,
}: {
  art: (p: Props) => React.ReactElement;
  title: string;
  text?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <Art className="h-36 w-auto sm:h-44" />
      <h3 className="mt-4 font-serif text-2xl font-medium">{title}</h3>
      {text ? <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">{text}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
