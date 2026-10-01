/** Объект-значение: неизменяемый, равенство по значениям. */
export abstract class ValueObject<TProps extends object> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  equals(other: ValueObject<TProps> | null | undefined): boolean {
    return !!other && other.constructor === this.constructor && JSON.stringify(other.props) === JSON.stringify(this.props);
  }

  toJSON(): Readonly<TProps> {
    return this.props;
  }
}
