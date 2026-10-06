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
 *
 * The grid itself is a dynamic import, so the machinery behind a date grid
 * lands in a chunk fetched when a reader opens the calendar and by nobody else.
 * What stays here is what the main bundle has to carry: the segments, which are
 * how most dates are entered anyway, and something to hold the popover's shape
 * while the chunk is on its way.
 */
import type { ReactNode } from "react";
import { lazy, Suspense, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { IconMark } from "../icons.js";
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

/**
 * Under its own name rather than a shorter one: the guard that asks who passes
 * a control's props reads the JSX for the control's name, so a local alias here
 * would make the grid's props look like props nobody feeds.
 */
const CalendarSurface = lazy(async () => {
  const module = await import("./CalendarSurface.js");
  return { default: module.CalendarSurface };
});

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
          <Suspense
            fallback={
              // The height six weeks and a heading take, so the popover does
              // not resize under the reader between the click and the grid.
              <div className="perch-calendar__waiting" aria-busy="true">
                <span className="perch-visually-hidden">Loading the calendar</span>
              </div>
            }
          >
            <CalendarSurface
              selected={value.date}
              {...(min === undefined ? {} : { min })}
              {...(max === undefined ? {} : { max })}
              {...(today === undefined ? {} : { today })}
              {...(timeZone === undefined ? {} : { timeZone })}
              onSelect={(date) => {
                onChange({ ...value, date });
                if (dateOnly) setOpen(false);
              }}
            />
          </Suspense>

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
