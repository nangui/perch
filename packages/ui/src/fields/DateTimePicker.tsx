/**
 * `DateTimePicker` — ISO segments in the control, a calendar in a popover.
 *
 * The value is typed as ISO or picked, per the design. That is not a stylistic
 * choice: a free-text date field parsed by locale is the classic way to get
 * 03/04 meaning two different days on two desks. The segments are monospaced so
 * digits do not shift as they change.
 *
 * Commits at 0 ms, like every discrete field. The calendar's Apply button
 * exists for the time half only — picking a day commits immediately.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { IconMark } from "../icons.js";
import { MonthArrow } from "../marks.js";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface DateTimeValue {
  /** `YYYY-MM-DD`, or empty. Never a Date: a Date carries a zone it should not. */
  readonly date: string;
  /** `HH:MM`, or absent for a date-only field. */
  readonly time?: string;
}

export interface DateTimePickerProps {
  readonly value: DateTimeValue;
  readonly onChange: (value: DateTimeValue) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  /** Date only, no time segment. Inference sets this from the field name. */
  readonly dateOnly?: boolean;
  /** Displayed beside the time, never inferred from the browser. */
  readonly timeZone?: string;
  /** ISO dates; days outside the pair are not selectable. */
  readonly min?: string;
  readonly max?: string;
  readonly today?: string;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * The two marks this field draws, as shapes rather than as characters.
 *
 * A glyph is whatever the reader's font decided: `▦` is a hatched square on one
 * machine and a solid block on another, and neither is a calendar. Drawn here,
 * at the weight the rest of the panel uses.
 *
 * `currentColor`, so they follow the button they sit in — through a hover, a
 * disabled state and both ramps — rather than carrying a grey of their own.
 */
export function DateTimePicker({
  value,
  onChange,
  status,
  binding,
  dateOnly = false,
  timeZone,
  min,
  max,
  today,
}: DateTimePickerProps): ReactNode {
  const locked = isLocked(status);
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* The control is as wide as what it holds; the zone sits beside it. */}
      <div className="perch-datetime">
        <div className="perch-control" {...statusAttributes(status)}>
          <input
            {...binding}
            className="perch-control__input perch-datetime__segment"
            value={value.date}
            placeholder="YYYY-MM-DD"
            inputMode="numeric"
            style={{ flex: "0 0 auto", width: "10ch" }}
            onChange={(event) => {
              onChange({ ...value, date: event.target.value });
            }}
          />

          {dateOnly ? null : (
            <>
              <span className="perch-datetime__divider" aria-hidden="true" />
              <input
                className="perch-control__input perch-datetime__segment"
                value={value.time ?? ""}
                placeholder="HH:MM"
                inputMode="numeric"
                aria-label="Time"
                aria-describedby={binding["aria-describedby"]}
                disabled={binding.disabled}
                readOnly={binding.readOnly}
                style={{ flex: "0 0 auto", width: "6ch" }}
                onChange={(event) => {
                  onChange({ ...value, time: event.target.value });
                }}
              />
            </>
          )}

          <Popover.Trigger asChild>
            <button
              type="button"
              className="perch-control__affix perch-control__affix--button"
              aria-label="Open calendar"
              disabled={locked}
            >
              <IconMark name="calendar" className="perch-date__calendar" />
            </button>
          </Popover.Trigger>

          <StatusMark status={status} />
        </div>

        {timeZone === undefined ? null : (
          // Beside the control rather than inside it: a zone is something the
          // field is telling you, not a third thing you can type into.
          <span className="perch-datetime__zone">{timeZone}</span>
        )}
      </div>

      <Popover.Portal>
        <Popover.Content
          className="perch-popover perch-calendar"
          sideOffset={4}
          align="start"
        >
          <Calendar
            selected={value.date}
            {...(min === undefined ? {} : { min })}
            {...(max === undefined ? {} : { max })}
            {...(today === undefined ? {} : { today })}
            onSelect={(date) => {
              onChange({ ...value, date });
              if (dateOnly) setOpen(false);
            }}
          />
          {dateOnly ? null : (
            <div className="perch-calendar__footer">
              <div
                className="perch-control"
                style={{ height: "28px", flex: "0 0 auto" }}
              >
                <input
                  className="perch-control__input perch-datetime__segment"
                  value={value.time ?? ""}
                  aria-label="Time"
                  placeholder="HH:MM"
                  style={{ width: "6ch" }}
                  onChange={(event) => {
                    onChange({ ...value, time: event.target.value });
                  }}
                />
              </div>
              {timeZone === undefined ? null : (
                <span className="perch-datetime__zone">{timeZone}</span>
              )}
              <button
                type="button"
                className="perch-button perch-button--primary"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  setOpen(false);
                }}
              >
                Apply
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface CalendarProps {
  readonly selected: string;
  readonly onSelect: (date: string) => void;
  readonly min?: string;
  readonly max?: string;
  readonly today?: string;
}

/**
 * A month grid, keyboard-operable because each day is a real button. Leading and
 * trailing days come from the neighbouring months so the grid never reflows
 * between months — the same reason the help line is reserved.
 */
export function Calendar({
  selected,
  onSelect,
  min,
  max,
  today,
}: CalendarProps): ReactNode {
  const anchor = parseIso(selected) ?? parseIso(today ?? "") ?? { y: 2026, m: 1, d: 1 };
  const [view, setView] = useState({ y: anchor.y, m: anchor.m });

  const firstOfMonth = new Date(Date.UTC(view.y, view.m - 1, 1));
  // Monday-first: JS gives 0 for Sunday, so shift it to the end of the week.
  const leading = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const cells: { iso: string; label: string; outside: boolean }[] = [];

  for (let i = 0; i < leading; i += 1) {
    const d = new Date(Date.UTC(view.y, view.m - 1, 1 - (leading - i)));
    cells.push({ iso: toIso(d), label: String(d.getUTCDate()), outside: true });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ iso: iso(view.y, view.m, d), label: String(d), outside: false });
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(
      Date.UTC(view.y, view.m, cells.length - leading - daysInMonth + 1),
    );
    cells.push({ iso: toIso(d), label: String(d.getUTCDate()), outside: true });
  }

  const monthLabel = new Date(Date.UTC(view.y, view.m - 1, 1)).toLocaleDateString(
    "en-GB",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );

  return (
    <div>
      <div className="perch-calendar__head">
        <div>{monthLabel}</div>
        <div className="perch-calendar__nav">
          <button
            type="button"
            className="perch-calendar__nav-button"
            aria-label="Previous month"
            onClick={() => {
              setView(shiftMonth(view, -1));
            }}
          >
            <MonthArrow back />
          </button>
          <button
            type="button"
            className="perch-calendar__nav-button"
            aria-label="Next month"
            onClick={() => {
              setView(shiftMonth(view, 1));
            }}
          >
            <MonthArrow back={false} />
          </button>
        </div>
      </div>

      {/* Read aloud as "M T W T F S S". The weekday reaches that user through
          each day's own name instead. */}
      <div
        className="perch-calendar__grid"
        style={{ marginBottom: "4px" }}
        aria-hidden="true"
      >
        {WEEKDAYS.map((label, index) => (
          <div key={`${label}-${String(index)}`} className="perch-calendar__weekday">
            {label}
          </div>
        ))}
      </div>

      {/* A group, not a grid: `role="grid"` obliges `row` and `gridcell`
          descendants. The real fix is the APG date-grid pattern with a roving
          tabindex — an open decision, not done here. */}
      <div className="perch-calendar__grid" role="group" aria-label={monthLabel}>
        {cells.map((cell) => {
          const disabled =
            (min !== undefined && cell.iso < min) ||
            (max !== undefined && cell.iso > max);
          return (
            <button
              key={cell.iso}
              type="button"
              className="perch-calendar__day"
              data-outside={cell.outside ? "true" : "false"}
              data-selected={cell.iso === selected ? "true" : "false"}
              data-today={cell.iso === today ? "true" : "false"}
              aria-current={cell.iso === today ? "date" : undefined}
              // ISO is read as a run of digits and drops the weekday.
              aria-label={humanDate(cell.iso)}
              disabled={disabled}
              onClick={() => {
                onSelect(cell.iso);
              }}
            >
              {cell.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shiftMonth(
  view: { y: number; m: number },
  by: number,
): { y: number; m: number } {
  const m = view.m + by;
  if (m < 1) return { y: view.y - 1, m: 12 };
  if (m > 12) return { y: view.y + 1, m: 1 };
  return { y: view.y, m };
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Built once: `toLocaleDateString` rebuilds a formatter per call, 42 per render.
 * Locale is fixed here as it is for the month heading — a known gap, not a choice.
 */
const DAY_NAME = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A day's accessible name. Falls back to the ISO string rather than throwing. */
function humanDate(value: string): string {
  const parts = parseIso(value);
  if (parts === null) return value;
  return DAY_NAME.format(new Date(Date.UTC(parts.y, parts.m - 1, parts.d)));
}

function toIso(date: Date): string {
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  if (y === undefined || m === undefined || d === undefined) return null;
  return { y: Number(y), m: Number(m), d: Number(d) };
}
