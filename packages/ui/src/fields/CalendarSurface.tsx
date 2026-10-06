/**
 * The month grid, as a real date grid.
 *
 * In a chunk of its own, fetched when a reader opens the calendar and by nobody
 * else. The state machine behind a date grid is larger than the field holding
 * it, and a form with a date on it should not pay for the grid until the button
 * is pressed.
 *
 * The grid is no longer ours, and that is the point. Arrow keys across a month,
 * Home and End to the month's own ends, Page Up and Page Down between months,
 * and one tab stop for the whole grid instead of one per day. The grid this
 * replaces was thirty-one buttons under a group: reachable, never navigable.
 *
 * What stays ours is the value. ISO in, ISO out, never a `Date` — the segment
 * above this one is free text, so what arrives here is as often half a date as
 * a whole one, and a half date is not a day.
 */
import type { ReactNode } from "react";
import type { DateValue } from "@ark-ui/react/date-picker";
import { DatePicker, parseDate } from "@ark-ui/react/date-picker";
import { MonthArrow } from "../marks.js";

export interface CalendarSurfaceProps {
  /** `YYYY-MM-DD`, or anything at all: the reader is typing into it. */
  readonly selected: string;
  readonly onSelect: (date: string) => void;
  /** ISO bounds. Days outside the pair are not selectable. */
  readonly min?: string;
  readonly max?: string;
  /** Which month to open on when nothing is selected yet. */
  readonly today?: string;
  /**
   * The zone the field declared, so that today is the panel's today.
   *
   * Without it the grid marks the day the reader's own machine is having, which
   * is a day out either way for a good part of the planet — the misreading this
   * whole field exists to prevent, re-entering through the one date nobody
   * typed.
   */
  readonly timeZone?: string;
}

/** Monday. Zag counts from Sunday at 0. */
const MONDAY = 1;

/**
 * Fixed, as the heading it replaced was, and for the same reason: a grid whose
 * weekday letters follow the reader's machine while the month beside them does
 * not is worse than one that is consistently wrong. A known gap, not a choice.
 */
const LOCALE = "en-GB";

export function CalendarSurface({
  selected,
  onSelect,
  min,
  max,
  today,
  timeZone,
}: CalendarSurfaceProps): ReactNode {
  const picked = asDay(selected);
  const floor = asDay(min);
  const ceiling = asDay(max);
  const zone = usableZone(timeZone);
  // The month to show when no day is held. Left to the grid otherwise, which
  // opens on its own today — where this used to open on January 2026 for ever,
  // a fallback written as a placeholder and never revisited.
  const anchor = picked ?? asDay(today);

  return (
    <DatePicker.Root
      // No positioner and no content: the popover around this already decides
      // where the grid goes and when it is there.
      inline
      // Six weeks always, so the grid does not change height between months.
      // The same promise the field shell makes about its help line.
      fixedWeeks
      startOfWeek={MONDAY}
      locale={LOCALE}
      selectionMode="single"
      value={picked === undefined ? [] : [picked]}
      {...(anchor === undefined ? {} : { defaultFocusedValue: anchor })}
      {...(zone === undefined ? {} : { timeZone: zone })}
      {...(floor === undefined ? {} : { min: floor })}
      {...(ceiling === undefined ? {} : { max: ceiling })}
      onValueChange={(details) => {
        const first = details.value[0];
        // An empty list is a day being cleared from inside the grid, which this
        // field does not offer: clearing is what the segment above is for.
        if (first !== undefined) onSelect(first.toString());
      }}
    >
      <DatePicker.View view="day">
        <DatePicker.Context>
          {(api) => (
            <>
              <div className="perch-calendar__head">
                <DatePicker.RangeText />
                <div className="perch-calendar__nav">
                  {/* Labelled here rather than left to the grid's own wording,
                      so the two buttons are addressable by a name this project
                      chose and a test can hold. */}
                  <DatePicker.PrevTrigger
                    className="perch-calendar__nav-button"
                    aria-label="Previous month"
                  >
                    <MonthArrow back />
                  </DatePicker.PrevTrigger>
                  <DatePicker.NextTrigger
                    className="perch-calendar__nav-button"
                    aria-label="Next month"
                  >
                    <MonthArrow back={false} />
                  </DatePicker.NextTrigger>
                </div>
              </div>

              <DatePicker.Table className="perch-calendar__table">
                <DatePicker.TableHead>
                  <DatePicker.TableRow>
                    {api.weekDays.map((weekDay) => (
                      <DatePicker.TableHeader
                        key={weekDay.long}
                        className="perch-calendar__weekday"
                      >
                        {/* A letter, and nothing said aloud: the grid hides
                            this whole row from assistive technology, which is
                            the decision the strip it replaces had already
                            taken. "M T W T F S S" read on the way past a
                            month is noise, and every day below carries its own
                            written-out date. */}
                        {weekDay.narrow}
                      </DatePicker.TableHeader>
                    ))}
                  </DatePicker.TableRow>
                </DatePicker.TableHead>

                <DatePicker.TableBody>
                  {api.weeks.map((week) => (
                    <DatePicker.TableRow key={week[0]?.toString() ?? ""}>
                      {week.map((day) => (
                        <DatePicker.TableCell
                          key={day.toString()}
                          value={day}
                          className="perch-calendar__cell"
                        >
                          <DatePicker.TableCellTrigger className="perch-calendar__day">
                            {day.day}
                          </DatePicker.TableCellTrigger>
                        </DatePicker.TableCell>
                      ))}
                    </DatePicker.TableRow>
                  ))}
                </DatePicker.TableBody>
              </DatePicker.Table>
            </>
          )}
        </DatePicker.Context>
      </DatePicker.View>
    </DatePicker.Root>
  );
}

/**
 * A day, or nothing.
 *
 * Two refusals rather than one, because they are different failures: a string
 * that is not shaped like a date, and a string that is but names no day. The
 * segment above accepts every keystroke on the way to a date, so both arrive
 * here on an ordinary afternoon of typing, and `parseDate` answers either with
 * a throw.
 *
 * Annotated rather than inferred, because `parseDate` is overloaded — one day
 * from a string, a list of them from a list — and the inferred return is the
 * last overload's, which is the list. That compiles here and is wrong one line
 * later.
 */
function asDay(value: string | undefined): DateValue | undefined {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try {
    return parseDate(value);
  } catch {
    return undefined;
  }
}

/**
 * The zone, if it is one.
 *
 * It arrives from a column's own `dateTime({ timezone })`, which is a free
 * string nothing validates, and it reaches a date library that throws on a name
 * it does not know. `Europe/Pariss` throws. So does the empty string, which a
 * declaration can hold without anybody noticing.
 *
 * Until the grid, a zone was a label drawn beside the control, so a typo in one
 * was a word spelled wrong. Handing it to something that computes with it is
 * what made the same typo a form that will not draw, and this is the line that
 * keeps it a word spelled wrong.
 *
 * Dropped rather than substituted: with no zone the grid marks today by the
 * reader's own, which is at worst a day out on a hint. The day they pick is the
 * day they clicked either way.
 */
function usableZone(zone: string | undefined): string | undefined {
  if (zone === undefined) return undefined;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}
