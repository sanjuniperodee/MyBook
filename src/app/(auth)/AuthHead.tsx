/** Заголовок экрана входа: название шрифтом книги и одна строка пояснения. Один на все экраны (вход, регистрация, пароль). */
export function AuthHead({ title, text, className }: { title: string; text?: string; className?: string }) {
  return (
    <div className={className ?? "mb-8"}>
      <h1 className="font-serif text-[36px] leading-tight font-medium text-balance sm:text-4xl">{title}</h1>
      {text ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p> : null}
    </div>
  );
}
