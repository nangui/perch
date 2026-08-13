/**
 * `DateTimePicker` — a wall clock in the form, an instant in the column.
 *
 * The zone is declared, never inferred. A panel is read by people in several
 * places and written to one database, so "the browser's zone" would mean a row
 * showing a different hour to each of them, and "the server's zone" would mean
 * a deployment moving every date in the table. `.timezone()` names the one the
 * business keeps its hours in.
 *
 * The form carries `2026-03-29T02:30` — no `Z`, no offset — because that is
 * what a reader sees on their own wall. The conversion happens on the server,
 * once on the way in and once on the way out, and `zoned.ts` holds the two
 * hours a year that have no single answer.
 *
 * `.format()` is not here and will not be. The control shows ISO segments on
 * purpose: a free-text date parsed by locale is how `03/04` comes to mean two
 * different days on two desks, and a formatting option is an invitation to
 * reintroduce exactly that.
 */
import { configured } from "../component.js";
import type { FieldState, ValidationRule, ValueRefusal } from "../field.js";
import { baseFieldState, Field, isUnset } from "../field.js";
import { isWallClock, toInstant, toWallClock } from "../zoned.js";

export interface DateTimePickerState extends FieldState {
  /** IANA, and required: a date with no zone is a date with an opinion. */
  readonly timezone: string;
  /** Whether the field carries a time of day at all. */
  readonly withTime: boolean;
  /** Wall clocks, in the field's own zone. */
  readonly minDate?: string;
  readonly maxDate?: string;
}

const DEFAULT_ZONE = "UTC";

export class DateTimePicker extends Field {
  declare readonly state: DateTimePickerState;

  override get type(): string {
    return "DateTimePicker";
  }

  protected override with(patch: Partial<DateTimePickerState>): this {
    return super.with(patch);
  }

  /** Picking a day is a decision, not typing. */
  protected override get defaultDebounce(): number {
    return 0;
  }

  static make(name: string): DateTimePicker {
    const state: DateTimePickerState = {
      ...baseFieldState(name),
      timezone: DEFAULT_ZONE,
      withTime: true,
    };
    return configured(new DateTimePicker(state));
  }

  /** The zone the business keeps its hours in. IANA, like `Europe/Paris`. */
  timezone(zone: string): this {
    return this.with({ timezone: zone });
  }

  /** A day, with no time of day. Midnight in the field's zone. */
  date(): this {
    return this.with({ withTime: false });
  }

  minDate(wall: string): this {
    return this.with({ minDate: wall });
  }

  maxDate(wall: string): this {
    return this.with({ maxDate: wall });
  }

  /** Shaped like a wall clock, and nothing else. */
  override admits(value: unknown): ValueRefusal | undefined {
    if (isUnset(value)) return undefined;
    return isWallClock(value, this.state.withTime) ? undefined : "wrong-shape";
  }

  override get declaredRules(): readonly ValidationRule[] {
    const { minDate, maxDate } = this.state;
    const rules: ValidationRule[] = [];
    // Compared as text, which is what ISO ordering is for: `2026-03-29` sorts
    // before `2026-10-25` as a string exactly as it does as a day.
    if (minDate !== undefined) {
      rules.push((value) =>
        typeof value !== "string" || value >= minDate
          ? true
          : `Must be on or after ${minDate}.`,
      );
    }
    if (maxDate !== undefined) {
      rules.push((value) =>
        typeof value !== "string" || value <= maxDate
          ? true
          : `Must be on or before ${maxDate}.`,
      );
    }
    return rules;
  }

  /** A column holds an instant; this turns it into what a reader would see. */
  override fromStorage(value: unknown): unknown {
    if (isWallClock(value, this.state.withTime)) return value;
    if (value instanceof Date)
      return toWallClock(value, this.state.timezone, this.state.withTime);
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return toWallClock(parsed, this.state.timezone, this.state.withTime);
      }
    }
    return value;
  }

  override toStorage(value: unknown): unknown {
    if (!isWallClock(value, this.state.withTime)) return value;
    return toInstant(value, this.state.timezone) ?? value;
  }
}
