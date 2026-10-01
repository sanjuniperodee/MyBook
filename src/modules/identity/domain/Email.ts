import { ValueObject } from "@/shared/domain";
import { IdentityError } from "./errors";

/** Адрес почты: нормализован (нижний регистр, без пробелов) и проверен. */
export class Email extends ValueObject<{ value: string }> {
  static readonly PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  static parse(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (!Email.PATTERN.test(value) || value.length > 200) throw new IdentityError("email");
    return new Email({ value });
  }

  get value() {
    return this.props.value;
  }

  get localPart() {
    return this.props.value.split("@")[0];
  }

  toString() {
    return this.props.value;
  }
}
