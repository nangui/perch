/**
 * A choice the list itself offers: a filter, or how many rows a page holds.
 *
 * The same Radix Select a form's field is drawn with, so the list a reader opens
 * above the table is the list they open in the form below it. A native select
 * opened a menu the platform drew, at the platform's size and in its font, which
 * no stylesheet reaches — the one control on the page that looked like it came
 * from another product.
 *
 * Not the form's `Select`: that one is a field, carrying a lifecycle, a status
 * and the bindings its shell hands it, and none of those exists here. This holds
 * a value and a list, and is named by the label beside it.
 */
import type { ReactNode } from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { ChevronDown } from "./marks.js";

export interface ListSelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * What stands for "no choice" inside the control.
 *
 * Radix refuses an item whose value is the empty string, and the empty string is
 * exactly what a filter put back sends. So the control holds this and the
 * caller never sees it. NUL, because no value a server declares contains one.
 */
const NONE = "\u0000none";

export function ListSelect({
  value,
  options,
  onValueChange,
  labelledBy,
  none,
}: {
  /** The empty string when nothing is chosen. */
  readonly value: string;
  readonly options: readonly ListSelectOption[];
  readonly onValueChange: (value: string) => void;
  /** The id of the visible text naming the control. */
  readonly labelledBy: string;
  /** The label of the way back to no choice; absent, there is none. */
  readonly none?: string;
}): ReactNode {
  const held = value === "" && none !== undefined ? NONE : value;

  return (
    <RadixSelect.Root
      {...(held === "" ? {} : { value: held })}
      onValueChange={(next) => {
        onValueChange(next === NONE ? "" : next);
      }}
    >
      <RadixSelect.Trigger className="perch-control" aria-labelledby={labelledBy}>
        <RadixSelect.Value />
        <RadixSelect.Icon className="perch-select__chevron">
          <ChevronDown />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          className="perch-popover"
          position="popper"
          sideOffset={4}
          style={{ minWidth: "var(--radix-select-trigger-width)" }}
        >
          <RadixSelect.Viewport>
            {(none === undefined
              ? options
              : [{ value: NONE, label: none }, ...options]
            ).map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className="perch-option"
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <span className="perch-option__check" aria-hidden="true">
                  <RadixSelect.ItemIndicator>✓</RadixSelect.ItemIndicator>
                </span>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
