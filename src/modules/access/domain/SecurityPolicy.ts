import { ValueObject } from "@/shared/domain";
import { AccessError } from "./errors";
import { ipAllowed, parseAllowlist, type AllowRule } from "./ip";

/** Что мешает сотруднику работать: вход не из разрешённой сети или не настроена обязательная 2FA. */
export type StaffGate = "ip" | "2fa" | null;

/** Правила безопасности CRM для всей команды. */
export class SecurityPolicy extends ValueObject<{ rules: AllowRule[]; require2fa: boolean }> {
  static fromSettings(allowlist: string, require2fa: boolean) {
    return new SecurityPolicy({ rules: parseAllowlist(allowlist).rules, require2fa });
  }

  /**
   * Новые правила от руководителя. Защита от самоблокировки: без своего текущего адреса
   * и без своей 2FA (если она становится обязательной) сохранить нельзя.
   */
  static define(input: { allowlist: string; require2fa: boolean; editorIp: string; editorHasTwoFactor: boolean }) {
    const { rules, invalid } = parseAllowlist(input.allowlist.slice(0, 4000));
    if (invalid.length) throw new AccessError("invalidIpRules", `Не похоже на IP-адрес или подсеть: ${invalid.slice(0, 3).join(", ")}`);
    if (rules.length && !ipAllowed(input.editorIp, rules)) throw new AccessError("selfLockout", `Ваш текущий адрес ${input.editorIp} не входит в список — после сохранения вы потеряете доступ к CRM. Добавьте его.`);
    if (input.require2fa && !input.editorHasTwoFactor) throw new AccessError("twoFactorFirst", "Сначала включите 2FA себе — иначе после сохранения вы сами не сможете работать.");
    return new SecurityPolicy({ rules, require2fa: input.require2fa });
  }

  get require2fa() {
    return this.props.require2fa;
  }

  /** Текст для хранения в настройках (по правилу в строке). */
  get allowlistText() {
    return this.props.rules.map((r) => r.raw).join("\n");
  }

  gate(ip: string, hasTwoFactor: boolean): StaffGate {
    if (this.props.rules.length && !ipAllowed(ip, this.props.rules)) return "ip";
    if (this.props.require2fa && !hasTwoFactor) return "2fa";
    return null;
  }
}
