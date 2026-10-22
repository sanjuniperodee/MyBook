/**
 * Что прокручивает страницу CRM. В установленном приложении на телефоне прокручивается не окно, а оболочка `.crm-shell`
 * (так страница не «резинится» сверху и снизу — см. globals.css); в браузере и на широком экране — окно, как обычно.
 */
export function shell(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(".crm-shell");
  return el && document.documentElement.dataset.standalone && getComputedStyle(el).position === "fixed" ? el : null;
}

export function scrollTop(): number {
  return shell()?.scrollTop ?? window.scrollY;
}

export function scrollMax(): number {
  const s = shell();
  return s ? s.scrollHeight - s.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
}

export function scrollTo(top: number, behavior: ScrollBehavior = "instant") {
  const s = shell();
  if (s) s.scrollTo({ top, behavior });
  else window.scrollTo({ top, behavior });
}
