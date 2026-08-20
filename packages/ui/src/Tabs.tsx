/**
 * The strip of tabs, and the keyboard that moves between them.
 *
 * One implementation, because there are two callers with nothing in common but
 * this: panels declared in a schema, and the relation managers drawn under a
 * form. A second strip would be a second set of ARIA attributes and a second
 * answer to what an arrow key does.
 */
import type { KeyboardEvent, ReactNode } from "react";

export interface TabHead {
  /** Ties the button to its panel. The panel carries `id` and this `${id}-tab`. */
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

export function TabStrip({
  tabs,
  at,
  choose,
}: {
  readonly tabs: readonly TabHead[];
  readonly at: number;
  readonly choose: (index: number) => void;
}): ReactNode {
  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const towards = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (towards === 0) return;
    event.preventDefault();
    const next = (at + towards + tabs.length) % tabs.length;
    choose(next);
    // Focus follows the choice: a tab that is selected and not focused leaves
    // the reader pressing arrows and hearing nothing.
    const list = event.currentTarget;
    (list.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="perch-tabs__list" role="tablist" onKeyDown={move}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${tab.id}-tab`}
          className="perch-tabs__tab"
          aria-selected={index === at}
          aria-controls={tab.id}
          // One stop for the whole strip: a reader tabs to it once and arrows
          // within, rather than tabbing through every panel there is.
          tabIndex={index === at ? 0 : -1}
          onClick={() => {
            choose(index);
          }}
        >
          {tab.icon === undefined ? null : (
            <span className="perch-tabs__icon" aria-hidden="true">
              {tab.icon}
            </span>
          )}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
