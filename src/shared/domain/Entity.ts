/** Сущность: идентичность важнее значений полей. Состояние меняется только методами самой сущности. */
export abstract class Entity<TProps extends object, TId extends string | number = string> {
  protected constructor(
    readonly id: TId,
    protected props: TProps,
  ) {}

  equals(other: Entity<TProps, TId> | null | undefined): boolean {
    return !!other && other.constructor === this.constructor && other.id === this.id;
  }

  /** Снимок состояния для репозитория и read-моделей (копия — снаружи нельзя изменить сущность). */
  snapshot(): Readonly<TProps> & { id: TId } {
    return { ...structuredClone(this.props), id: this.id };
  }
}
