/**
 * The built-in renderers, registered under the same keys the server sends.
 *
 * Each one adapts a `SchemaNode` to a component that already existed and knows
 * nothing about the protocol. That direction matters: the components stay
 * substitutable, which is what a plugin needs to replace one.
 */
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import type { Option, SchemaNode } from "@perchjs/core";
import { FieldShell } from "./FieldShell.js";
import { IconMark } from "./icons.js";
import { CaretMark } from "./marks.js";
import type { TabHead } from "./Tabs.js";
import { TabStrip } from "./Tabs.js";
import type { FieldStatus } from "./field-state.js";
import { isLocked } from "./field-state.js";
import type { StateRequest, StateResponse } from "./transport.js";
import { CreateOption } from "./fields/CreateOption.js";
import { Select } from "./fields/Select.js";
import { Checkbox } from "./fields/Checkbox.js";
import { CheckboxList } from "./fields/CheckboxList.js";
import type { Tool as MarkdownTool } from "./fields/MarkdownEditor.js";
import { MarkdownEditor, TOOLS as MARKDOWN_TOOLS } from "./fields/MarkdownEditor.js";
import { RichEditor } from "./fields/RichEditor.js";
import type { RichDocument, Tool } from "./fields/rich-document.js";
import { TOOLS } from "./fields/rich-document.js";
import { ColorPicker } from "./fields/ColorPicker.js";
import { ToggleButtons } from "./fields/ToggleButtons.js";
import type { Pair } from "./fields/KeyValue.js";
import { KeyValue } from "./fields/KeyValue.js";
import { TagsInput } from "./fields/TagsInput.js";
import { DateTimePicker } from "./fields/DateTimePicker.js";
import { FileUpload } from "./fields/FileUpload.js";
import { Placeholder } from "./fields/Placeholder.js";
import type { RepeaterItem } from "./fields/Repeater.js";
import { Repeater } from "./fields/Repeater.js";
import { Radio } from "./fields/Radio.js";
import { Textarea } from "./fields/Textarea.js";
import { Toggle } from "./fields/Toggle.js";
import { MultiSelect } from "./fields/MultiSelect.js";
import { SearchableSelect } from "./fields/SearchableSelect.js";
import { TextInput } from "./fields/TextInput.js";
import { TextEntry } from "./entries/TextEntry.js";
import { IconEntry } from "./entries/IconEntry.js";
import { ImageEntry } from "./entries/ImageEntry.js";
import type { TextFlavour } from "./fields/TextInput.js";
import type { NodeProps, SearchedOption } from "./node-props.js";
import { registerComponent } from "./registry.js";

/**
 * What a field asked to sit inside its frame.
 *
 * The control has drawn these since it was written and nothing ever passed
 * them: declared, drawn, and fed by no one.
 */
function affixesOf(node: SchemaNode): {
  prefix?: string;
  suffix?: string;
  prefixIcon?: string;
  suffixIcon?: string;
} {
  const said = (name: string): string | undefined => {
    const value = node.props?.[name];
    return typeof value === "string" ? value : undefined;
  };
  const affixes: Record<string, string> = {};
  for (const name of ["prefix", "suffix", "prefixIcon", "suffixIcon"]) {
    const value = said(name);
    if (value !== undefined) affixes[name] = value;
  }
  return affixes;
}

/**
 * What a field says about itself that surrounds the control rather than being
 * in it: the word beside the label, and the attributes it asked to carry.
 *
 * Spread rather than passed one by one, so a field that declared none of them
 * sends nothing at all and the shell has one thing to check instead of four.
 */
function hintOf(node: SchemaNode): {
  hint?: string;
  hintIcon?: string;
  extraAttributes?: Readonly<Record<string, string>>;
  autofocus?: boolean;
} {
  return {
    ...(node.hint === undefined ? {} : { hint: node.hint }),
    ...(node.hintIcon === undefined ? {} : { hintIcon: node.hintIcon }),
    ...(node.extraAttributes === undefined
      ? {}
      : { extraAttributes: node.extraAttributes }),
    ...(node.autofocus === undefined ? {} : { autofocus: node.autofocus }),
  };
}

function statusOf(
  node: SchemaNode,
  error?: string,
  pending?: boolean,
  inFlight?: boolean,
): FieldStatus {
  return {
    lifecycle: inFlight === true ? "inFlight" : pending === true ? "draft" : "rest",
    error,
    disabled: node.disabled,
    readOnly: node.readOnly,
  };
}

/** A select value is a scalar on the wire; anything else is not one. */
function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * A multiple select holds a list.
 *
 * A scalar becomes a list of one rather than nothing: a field switched to
 * multiple after a row was written holds what it held, and dropping it would
 * lose a value on the next save without saying so.
 */
function list(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return (value as readonly unknown[])
      .map(scalar)
      .filter((held): held is string => held !== null);
  }
  const only = scalar(value);
  return only === null ? [] : [only];
}

/** `columns` reaches the CSS as a variable, so the grid stays in the stylesheet. */
function columnsStyle(node: SchemaNode): Record<string, string> | undefined {
  const columns = node.props?.["columns"];
  if (typeof columns !== "number") return undefined;
  return { "--perch-columns": String(columns) };
}

function LayoutRenderer({ node, renderChild }: NodeProps): ReactNode {
  const collapsible = node.props?.["collapsible"] === true;
  // Where it starts, not where it stays: after that it is the reader's.
  const [folded, setFolded] = useState(node.props?.["collapsed"] === true);
  // Blank as well as absent: a heading with nothing in it takes a line of the
  // page and names nothing on it.
  const title = empty(node.label) ? undefined : node.label;
  // Decoration beside the title, never instead of it: hidden from a screen
  // reader, which already has the words.
  const icon =
    typeof node.props?.["icon"] === "string" ? node.props["icon"] : undefined;
  const mark = <IconMark name={icon} className="perch-layout__icon" />;

  // Unknown names fall back rather than becoming a class the stylesheet has not
  // got: a box with no background reads as a rendering fault.
  const tone = toneOf(node);

  return (
    <div
      className={`perch-layout perch-layout--${node.type.toLowerCase()}`}
      {...(tone === undefined ? {} : { "data-tone": tone })}
    >
      {title === undefined ? null : collapsible ? (
        // The whole heading is the control, because a title beside a small
        // arrow is a target most people aim at and miss.
        <button
          type="button"
          className="perch-layout__title perch-layout__title--folds"
          aria-expanded={!folded}
          aria-controls={`${node.id}-body`}
          onClick={() => {
            setFolded((was) => !was);
          }}
        >
          <CaretMark folded={folded} />
          {mark}
          {title}
        </button>
      ) : (
        <div className="perch-layout__title">
          {mark}
          {title}
        </div>
      )}
      {/* The layout's own line of prose, under its title and above what it
          holds. Declared since the first section and never drawn: the value is
          resolvable, and the payload carried only static props until the cycle
          resolved this one. */}
      <Description
        {...(node.description === undefined ? {} : { text: node.description })}
      />
      {/* Hidden rather than unmounted: a folded field is still a field, still
          filled in and still saved, and unmounting would lose what is in it. */}
      <div
        id={`${node.id}-body`}
        className="perch-layout__body"
        style={columnsStyle(node)}
        hidden={collapsible && folded}
      >
        {(node.children ?? []).map(renderChild)}
      </div>
    </div>
  );
}

/**
 * A group of fields with a name, drawn as the element the browser has for it.
 *
 * Not the layout renderer with different padding: `<fieldset>` and `<legend>`
 * are announced as a group on the way in, and a `div` with a heading over it is
 * a heading followed by some fields. The grouping is the whole point of the
 * component, so it is the part that has to be real.
 */
function FieldsetRenderer({ node, renderChild }: NodeProps): ReactNode {
  const icon =
    typeof node.props?.["icon"] === "string" ? node.props["icon"] : undefined;

  return (
    // The element's own attribute, which takes every control inside out of
    // reach and out of the tab order. The fields each arrive disabled too now
    // that a layout's flags reach them, so this is the group saying it rather
    // than the only thing saying it.
    <fieldset
      className="perch-layout perch-layout--fieldset"
      disabled={node.disabled === true}
    >
      {empty(node.label) ? null : (
        <legend className="perch-layout__legend">
          {/* Decoration beside the name, never instead of it. */}
          <IconMark name={icon} className="perch-layout__icon" />
          {node.label}
        </legend>
      )}
      <Description
        {...(node.description === undefined ? {} : { text: node.description })}
      />
      <div className="perch-layout__body" style={columnsStyle(node)}>
        {(node.children ?? []).map(renderChild)}
      </div>
    </fieldset>
  );
}

/** The panel's four, which a callout and a badge both choose from. */
const TONES = new Set(["neutral", "success", "warning", "danger"]);

/**
 * Nothing to draw, whether it never arrived or came back blank.
 *
 * An empty paragraph takes a line of the page and says nothing on it, an empty
 * `src` is a request for the page itself, and an empty legend names a group
 * with nothing.
 */
function empty(content: string | undefined): boolean {
  return content === undefined || content === "";
}

/**
 * A layout's own line of prose, under its name and above what it holds.
 *
 * One component rather than the same three lines in each renderer that draws a
 * layout. There were three, and the last time there were two, one of them was
 * missed: a tab's description crossed the wire and reached nothing, because the
 * renderer that draws a tab panel maps its children itself.
 */
function Description({ text }: { readonly text?: string }): ReactNode {
  if (empty(text)) return null;
  return <p className="perch-layout__description">{text}</p>;
}

/** The tone the server chose, or none, rather than a class that does not exist. */
function toneOf(node: NodeProps["node"]): string | undefined {
  const tone = node.props?.["tone"];
  return typeof tone === "string" && TONES.has(tone) ? tone : undefined;
}

/**
 * Static content in a schema: a paragraph, a picture, a mark.
 *
 * No `FieldShell` around any of them. A shell puts a label above and help
 * below, which is right for a control and wrong for a sentence between two
 * sections — a paragraph with a heading over it reads as a field nobody can
 * fill in.
 */
function TextRenderer({ node }: NodeProps): ReactNode {
  if (empty(node.content)) return null;
  const tone = toneOf(node);

  return (
    <p
      className="perch-prime perch-prime--text"
      {...(tone === undefined ? {} : { "data-tone": tone })}
    >
      {node.content}
    </p>
  );
}

function ImageRenderer({ node }: NodeProps): ReactNode {
  // Empty as well as absent. A browser resolves `src=""` against the document
  // and fetches the page again, so a source that came back blank — a column
  // nobody filled, an address the server would not vouch for — is no image.
  if (empty(node.content)) return null;
  const alt = node.props?.["alt"];

  // An empty `alt` is a real answer and the reason it is asked for on the way
  // in: it says the picture is decoration. Missing is not the same thing, and
  // a picture nobody described is one a reader is not told about — so it is
  // treated as decoration rather than announced as an unnamed image.
  return (
    <img
      className="perch-prime perch-prime--image"
      src={node.content}
      alt={typeof alt === "string" ? alt : ""}
    />
  );
}

function IconRenderer({ node }: NodeProps): ReactNode {
  // Under `icon`, where the boot reads it. What rode under `content` was a
  // character nothing could refuse, and a name nothing can draw draws nothing —
  // the mark is decoration, and there is no sentence it takes the place of.
  const name =
    typeof node.props?.["icon"] === "string" ? node.props["icon"] : undefined;

  return (
    <IconMark
      name={name}
      className="perch-prime perch-prime--icon"
      tone={toneOf(node)}
    />
  );
}

function TextInputRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const flavour = (node.props?.["flavour"] as TextFlavour | undefined) ?? "text";
  /**
   * Whether the reader has asked to see what they typed.
   *
   * Here and not on the server: it is about this browser, this moment, and
   * nothing else — sending it would be asking the server to remember whether
   * somebody is looking at their own password.
   */
  const [revealed, setRevealed] = useState(false);
  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <TextInput
          value={scalar(value) ?? ""}
          onChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          status={status}
          binding={binding}
          flavour={flavour}
          {...(flavour === "password"
            ? {
                revealed,
                onRevealToggle: () => {
                  setRevealed(!revealed);
                },
              }
            : {})}
          {...(typeof node.props?.["maxLength"] === "number"
            ? { maxLength: node.props["maxLength"] }
            : {})}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
          {...affixesOf(node)}
          {...(typeof node.props?.["mask"] === "string"
            ? { mask: node.props["mask"] }
            : {})}
        />
      )}
    </FieldShell>
  );
}

/** A choice as every control here draws one: what it is worth saying about it. */
interface Choice {
  readonly value: string;
  readonly label: string;
  readonly meta?: string;
  readonly disabled?: boolean;
}

/**
 * The options the server sent, kept whole.
 *
 * A choice is more than a word. `disabled` is the server saying it will not
 * take that value, and `meta` is the annotation beside it — both were sent,
 * and a mapping that kept only the label meant every control drew a set the
 * reader could pick anything from and no annotation at all.
 *
 * A value nothing can stand for is dropped rather than drawn: a choice with no
 * value is one that cannot be chosen.
 */
function choices(
  options: readonly SearchedOption[] | readonly Option[] | undefined,
): readonly Choice[] {
  return (options ?? []).flatMap((option) => {
    const value = scalar(option.value);
    if (value === null) return [];
    return [
      {
        value,
        label: option.label,
        ...(option.meta === undefined ? {} : { meta: option.meta }),
        ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
      },
    ];
  });
}

function SelectRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
  searchOptions,
  optionForm,
  createOption,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const options = choices(node.options);

  const label = node.label ?? node.path ?? "";
  const path = node.path;

  const [creating, setCreating] = useState(false);
  // Declared by the field and possible for this host. A button the host cannot
  // answer is a button that opens on a failure.
  const creatable =
    node.props?.["createsOption"] === true &&
    optionForm !== undefined &&
    createOption !== undefined &&
    path !== undefined &&
    !isLocked(status);

  const askForm = useCallback(async () => {
    if (optionForm === undefined || path === undefined) throw new Error("no form");
    return await optionForm(path, {});
  }, [optionForm, path]);

  // The dialog's own round trips, which are the same route asked again with
  // what has been typed into it. A second channel would be a second resolution
  // of the same schema, and the two would drift.
  const resolveDialog = useCallback(
    async (request: StateRequest): Promise<StateResponse> => {
      if (optionForm === undefined || path === undefined) throw new Error("no form");
      return { payload: await optionForm(path, request.state) };
    },
    [optionForm, path],
  );

  const submitOption = useCallback(
    async (data: Record<string, unknown>) => {
      if (createOption === undefined || path === undefined) throw new Error("no route");
      return await createOption(path, data);
    },
    [createOption, path],
  );

  // Stable, or the effect that runs it fires on every render of the form.
  const search = useCallback(
    async (term: string) => {
      if (searchOptions === undefined || path === undefined) return [];
      const answer = await searchOptions(path, term);
      return choices(answer);
    },
    [searchOptions, path],
  );

  // A field the host cannot ask about is not searchable, whatever it declared:
  // a search box that answers nothing is worse than none.
  const searchable = node.props?.["searchable"] === true && searchOptions !== undefined;
  const multiple = node.props?.["multiple"] === true;

  const dialog = creatable ? (
    <CreateOption
      label={label}
      open={creating}
      onClose={() => {
        setCreating(false);
      }}
      askForm={askForm}
      resolve={resolveDialog}
      submit={submitOption}
    />
  ) : null;

  // On the control's own line rather than around the whole field: a field is a
  // label row, a control and a reserved line for the error, and a button placed
  // around all three can only align to the bottom of the last one.
  const adder = (
    <button
      type="button"
      className="perch-select-create"
      onClick={() => {
        setCreating(true);
      }}
      // The field's label is the only thing that says which list this adds to,
      // and a bare `+` on a form with four selects says nothing.
      aria-label={`Create a new ${label.toLowerCase()}`}
    >
      +
    </button>
  );

  const control = (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
      {...(creatable ? { beside: adder } : {})}
    >
      {(binding) =>
        multiple ? (
          <MultiSelect
            value={list(value)}
            onValueChange={(next) => {
              if (path !== undefined) onChange(path, next);
            }}
            options={options}
            status={status}
            binding={binding}
            label={label}
            {...(node.placeholder === undefined
              ? {}
              : { placeholder: node.placeholder })}
          />
        ) : searchable ? (
          <SearchableSelect
            value={scalar(value)}
            onValueChange={(next) => {
              if (path !== undefined) onChange(path, next);
            }}
            options={options}
            status={status}
            binding={binding}
            label={label}
            search={search}
            {...(node.placeholder === undefined
              ? {}
              : { placeholder: node.placeholder })}
          />
        ) : (
          <Select
            value={scalar(value)}
            onValueChange={(next) => {
              if (node.path !== undefined) onChange(node.path, next);
            }}
            options={options}
            status={status}
            binding={binding}
            {...(node.placeholder === undefined
              ? {}
              : { placeholder: node.placeholder })}
          />
        )
      }
    </FieldShell>
  );

  return creatable ? (
    <>
      {control}
      {dialog}
    </>
  ) : (
    control
  );
}

/** One colour. Hex on the wire, whatever the column keeps it in. */
function ColorPickerRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <ColorPicker
          value={typeof value === "string" && value !== "" ? value : null}
          onValueChange={(next) => {
            onChange(node.path ?? "", next);
          }}
          status={status}
          binding={binding}
          label={label}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
        />
      )}
    </FieldShell>
  );
}

/** The pairs in a `Json` column. Ordered rows above, an object underneath. */
function KeyValueRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";
  // Anything that is not a list of pairs reads as no rows. The server refuses
  // the shape at the boundary; drawing it is not the place to argue about it.
  const rows = Array.isArray(value)
    ? value.flatMap((one): Pair[] =>
        Array.isArray(one) &&
        one.length === 2 &&
        typeof one[0] === "string" &&
        typeof one[1] === "string"
          ? [[one[0], one[1]]]
          : [],
      )
    : [];

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <KeyValue
          value={rows}
          onValueChange={(next) => {
            onChange(node.path ?? "", next);
          }}
          status={status}
          binding={binding}
          label={label}
          {...(typeof node.props?.["keyLabel"] === "string"
            ? { keyLabel: node.props["keyLabel"] }
            : {})}
          {...(typeof node.props?.["valueLabel"] === "string"
            ? { valueLabel: node.props["valueLabel"] }
            : {})}
        />
      )}
    </FieldShell>
  );
}

/** A list the reader writes. Open, so there is no set to measure against. */
function TagsInputRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";
  // Anything that is not a list of text reads as no tags. The server refuses
  // the shape at the boundary; drawing it is not the place to argue about it.
  const tags = Array.isArray(value)
    ? value.filter((one): one is string => typeof one === "string")
    : [];
  const suggestions = node.props?.["suggestions"];

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <TagsInput
          value={tags}
          onValueChange={(next) => {
            onChange(node.path ?? "", next);
          }}
          status={status}
          binding={binding}
          label={label}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
          {...(typeof node.props?.["separator"] === "string"
            ? { separator: node.props["separator"] }
            : {})}
          {...(Array.isArray(suggestions)
            ? {
                suggestions: suggestions.filter(
                  (one): one is string => typeof one === "string",
                ),
              }
            : {})}
        />
      )}
    </FieldShell>
  );
}

/** Several of a few, all of them visible. A list on the wire, always. */
function CheckboxListRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";
  const options = choices(node.options);

  // Anything that is not a list reads as nothing ticked. The server refuses
  // the shape at the boundary; drawing it is not the place to argue about it.
  const ticked = Array.isArray(value)
    ? value.flatMap((one) => {
        const text = scalar(one);
        return text === null ? [] : [text];
      })
    : [];

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <CheckboxList
          value={ticked}
          onValueChange={(next) => {
            onChange(node.path ?? "", next);
          }}
          options={options}
          status={status}
          binding={binding}
          label={label}
          {...(typeof node.props?.["columns"] === "number"
            ? { columns: node.props["columns"] }
            : {})}
          bulkToggleable={node.props?.["bulkToggleable"] === true}
        />
      )}
    </FieldShell>
  );
}

/** Text that is already what it means, and what it will look like. */
function MarkdownEditorRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";
  const declared = node.props?.["toolbar"];
  const toolbar = (Array.isArray(declared) ? declared : []).filter(
    (one): one is MarkdownTool =>
      typeof one === "string" && (MARKDOWN_TOOLS as readonly string[]).includes(one),
  );

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <MarkdownEditor
          value={typeof value === "string" ? value : ""}
          onValueChange={(next) => {
            onChange(node.path ?? "", next);
          }}
          toolbar={toolbar}
          status={status}
          binding={binding}
          label={label}
          {...(typeof node.props?.["rows"] === "number"
            ? { rows: node.props["rows"] }
            : {})}
          {...(typeof node.props?.["maxLength"] === "number"
            ? { maxLength: node.props["maxLength"] }
            : {})}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
        />
      )}
    </FieldShell>
  );
}

/** A document the reader writes. The editor arrives in its own chunk. */
function RichEditorRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";
  const declared = node.props?.["toolbar"];
  // Whatever the wire says, drawn only where a button exists for it. The
  // server refuses what its own toolbar cannot make, so a name this does not
  // know would be a button that writes what the boundary turns away.
  const toolbar = (Array.isArray(declared) ? declared : []).filter(
    (one): one is Tool =>
      typeof one === "string" && (TOOLS as readonly string[]).includes(one),
  );

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <RichEditor
          value={isDocument(value) ? value : null}
          onValueChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          toolbar={toolbar}
          status={status}
          binding={binding}
          label={label}
        />
      )}
    </FieldShell>
  );
}

/** A document, or something else the column held. */
function isDocument(value: unknown): value is RichDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "doc"
  );
}

/** The same choice a radio group offers, in clothes a thumb can hit. */
function ToggleButtonsRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";
  const options = choices(node.options);

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <ToggleButtons
          value={scalar(value)}
          onValueChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          options={options}
          status={status}
          binding={binding}
          label={label}
          inline={node.props?.["inline"] === true}
          grouped={node.props?.["grouped"] === true}
        />
      )}
    </FieldShell>
  );
}

function RadioRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const label = node.label ?? node.path ?? "";
  const options = choices(node.options);

  return (
    <FieldShell
      label={label}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <Radio
          value={scalar(value)}
          onValueChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          options={options}
          status={status}
          binding={binding}
          label={label}
          inline={node.props?.["inline"] === true}
        />
      )}
    </FieldShell>
  );
}

function CheckboxRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <Checkbox
          // Anything but `true` is unticked. A column that has never been
          // written holds null, and a box cannot be half on.
          checked={value === true}
          onCheckedChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          status={status}
          binding={binding}
        />
      )}
    </FieldShell>
  );
}

function ToggleRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const props = node.props ?? {};

  // No `FieldShell`: this control carries its own label and its own reserved
  // help line, because the design puts the label beside the switch rather than
  // above it. Wrapping it would give the row two labels and two help lines.
  return (
    <Toggle
      // Anything but `true` is off. A column never written holds null, and a
      // switch cannot be half on.
      checked={value === true}
      onCheckedChange={(next) => {
        if (node.path !== undefined) onChange(node.path, next);
      }}
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
      {...(typeof props["onIcon"] === "string" ? { onIcon: props["onIcon"] } : {})}
      {...(typeof props["offIcon"] === "string" ? { offIcon: props["offIcon"] } : {})}
      {...(typeof props["onColor"] === "string" ? { onColor: props["onColor"] } : {})}
    />
  );
}

function TextareaRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const props = node.props ?? {};
  const rows = props["rows"];
  const maxLength = props["maxLength"];

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(next) => {
            if (node.path !== undefined) onChange(node.path, next);
          }}
          status={status}
          binding={binding}
          autosize={props["autosize"] === true}
          {...(typeof rows === "number" ? { rows } : {})}
          {...(typeof maxLength === "number" ? { maxLength } : {})}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
        />
      )}
    </FieldShell>
  );
}

/** The presentation rule the server declared, off `props` and typed on the way. */
function entryFormat(node: SchemaNode): {
  format?: string;
  timezone?: string;
  currency?: string;
  decimals?: number;
} {
  const props = node.props ?? {};
  const out: {
    format?: string;
    timezone?: string;
    currency?: string;
    decimals?: number;
    badge?: boolean;
    copyable?: boolean;
    limit?: number;
  } = {};

  for (const key of ["format", "timezone", "currency"] as const) {
    const value = props[key];
    if (typeof value === "string") out[key] = value;
  }
  if (typeof props["decimals"] === "number") out.decimals = props["decimals"];
  if (typeof props["limit"] === "number") out.limit = props["limit"];
  if (props["badge"] === true) out.badge = true;
  if (props["copyable"] === true) out.copyable = true;
  return out;
}

/**
 * The rows of a to-many relation.
 *
 * Each child is one row, already a group, so this stacks them and does not have
 * to know what is inside one. Nothing to add, nothing to reorder, nothing to
 * delete: those belong to the repeater, which is a control.
 */
function RepeatableEntryRenderer({ node, renderChild }: NodeProps): ReactNode {
  const rows = node.children ?? [];

  return (
    <section
      className="perch-rows"
      // Named only when there is a name. An empty one leaves a region with no
      // accessible name, which is worse than a plain group.
      {...(node.label === undefined ? {} : { "aria-label": node.label })}
    >
      {node.label === undefined ? null : (
        <h3 className="perch-rows__title">{node.label}</h3>
      )}
      {/* Said rather than left as an empty box, which reads as a page that
          failed to load rather than as a relation with nothing in it. */}
      {rows.length === 0 ? (
        <p className="perch-rows__empty">Nothing yet</p>
      ) : (
        rows.map((row) => (
          <div className="perch-rows__row" key={row.id}>
            {renderChild(row)}
          </div>
        ))
      )}
    </section>
  );
}

/**
 * Panels, one at a time.
 *
 * A tablist as the pattern describes it: the tabs are buttons, the arrows move
 * between them, and only the chosen one is in the tab order — so the keyboard
 * reaches the set in one press and moves inside it with the arrows, rather than
 * tabbing through every panel's worth of controls to get past.
 *
 * Hidden rather than unmounted, like a folded section: a field in a tab nobody
 * is looking at is still a field, still filled in and still saved.
 */
/**
 * Which panel an address names, for the tab set that asked to be remembered.
 *
 * Keyed by the set's own id, so a page holding two of them remembers both
 * rather than one overwriting the other.
 */
function tabInAddress(id: string): string | undefined {
  if (typeof globalThis.location === "undefined") return undefined;
  const found = new URLSearchParams(globalThis.location.search).get(`tab.${id}`);
  return found === null ? undefined : found;
}

/**
 * Writes it there, without adding to the history.
 *
 * `replaceState`, because moving between tabs is not navigation: a reader who
 * looked at four panels and then pressed Back expects the page they came from,
 * not the third panel of the one they are on.
 */
function rememberTab(id: string, panel: string): void {
  if (typeof globalThis.history === "undefined") return;
  const url = new URL(globalThis.location.href);
  url.searchParams.set(`tab.${id}`, panel);
  globalThis.history.replaceState(globalThis.history.state, "", url);
}

function TabsRenderer({ node, renderChild }: NodeProps): ReactNode {
  const panels = node.children ?? [];
  // Named by the panel rather than by its position: an index in an address
  // points at whatever is third today, and a link sent last week opens the
  // wrong panel the day somebody reorders them.
  const remembers = node.props?.["persistTab"] === true;
  const named = remembers ? tabInAddress(node.id) : undefined;
  const opened = panels.findIndex((panel) => panel.id === named);
  const [chosen, setChosen] = useState(opened === -1 ? 0 : opened);
  const at = Math.min(chosen, Math.max(panels.length - 1, 0));
  if (panels.length === 0) return null;

  const choose = (index: number): void => {
    setChosen(index);
    if (!remembers) return;
    const panel = panels[index];
    if (panel !== undefined) rememberTab(node.id, panel.id);
  };

  return (
    <div className={`perch-layout perch-layout--${node.type.toLowerCase()}`}>
      <TabStrip tabs={panels.map(head)} at={at} choose={choose} />
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          id={panel.id}
          role="tabpanel"
          aria-labelledby={`${panel.id}-tab`}
          className="perch-layout__body"
          style={columnsStyle(panel)}
          hidden={index !== at}
        >
          {/* Drawn here too, because this file maps a panel's children itself
              rather than handing the panel to the layout renderer — so a
              description on a tab crossed the wire and reached nothing. */}
          <Description
            {...(panel.description === undefined ? {} : { text: panel.description })}
          />
          {(panel.children ?? []).map(renderChild)}
        </div>
      ))}
    </div>
  );
}

function TextEntryRenderer({ node }: NodeProps): ReactNode {
  // No status: an entry is never disabled, never in flight and never in error.
  // Passing a resting one would say those states exist for it.
  return (
    <FieldShell
      label={node.label ?? ""}
      status={{ lifecycle: "rest" }}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <TextEntry
          value={node.value}
          describedBy={binding.id}
          {...(node.label === undefined ? {} : { label: node.label })}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
          {...(node.tone === undefined ? {} : { tone: node.tone })}
          {...(node.href === undefined ? {} : { href: node.href })}
          {...entryFormat(node)}
        />
      )}
    </FieldShell>
  );
}

function IconEntryRenderer({ node }: NodeProps): ReactNode {
  // No status, for the reason the text entry gives: an entry is never disabled,
  // never in flight and never in error.
  return (
    <FieldShell
      label={node.label ?? ""}
      status={{ lifecycle: "rest" }}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <IconEntry
          describedBy={binding.id}
          {...(node.mark === undefined ? {} : { mark: node.mark })}
          {...(node.tone === undefined ? {} : { tone: node.tone })}
          {...(node.label === undefined ? {} : { label: node.label })}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
        />
      )}
    </FieldShell>
  );
}

function ImageEntryRenderer({ node }: NodeProps): ReactNode {
  return (
    <FieldShell
      label={node.label ?? ""}
      status={{ lifecycle: "rest" }}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <ImageEntry
          describedBy={binding.id}
          {...(node.pictures === undefined ? {} : { pictures: node.pictures })}
          {...(node.props?.["circular"] === true ? { circular: true } : {})}
          {...(node.props?.["stacked"] === true ? { stacked: true } : {})}
          {...(typeof node.props?.["size"] === "number"
            ? { size: node.props["size"] }
            : {})}
          {...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })}
        />
      )}
    </FieldShell>
  );
}

function PlaceholderRenderer({ node, error, pending, inFlight }: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <Placeholder
          status={status}
          describedBy={binding.id}
          {...(node.content === undefined ? {} : { content: node.content })}
        />
      )}
    </FieldShell>
  );
}

/**
 * A field the reader never sees draws nothing at all.
 *
 * Registered rather than left out: an unregistered type shows the marker meant
 * for a component nobody wrote, and a hidden field is not a gap in the panel.
 * Its value travels in the payload's state, which is all it needs to survive a
 * round trip it is never allowed to change.
 */
function HiddenRenderer(): ReactNode {
  return null;
}

/**
 * The field carries one wall clock; the control works in two segments.
 *
 * `2026-03-29T02:30` splits on the `T` and joins back on it. No `Date` is built
 * on either side — a `Date` carries a zone, and the whole point of the string is
 * that it carries none.
 */
function splitWall(value: unknown, withTime: boolean): { date: string; time?: string } {
  if (typeof value !== "string") return { date: "" };
  const [date = "", time] = value.split("T");
  return withTime && time !== undefined ? { date, time } : { date };
}

function DateTimePickerRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const props = node.props ?? {};
  const withTime = props["withTime"] !== false;
  const zone = props["timezone"];
  const min = props["minDate"];
  const max = props["maxDate"];

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <DateTimePicker
          value={splitWall(value, withTime)}
          onChange={(next) => {
            if (node.path === undefined) return;
            // An empty date is a cleared field, not a half-written one: sending
            // `T14:30` would be a wall clock the boundary refuses and a value
            // the reader cannot see was rejected.
            const joined =
              next.date === ""
                ? ""
                : withTime && next.time !== undefined && next.time !== ""
                  ? `${next.date}T${next.time}`
                  : next.date;
            onChange(node.path, joined);
          }}
          status={status}
          binding={binding}
          dateOnly={!withTime}
          {...(typeof zone === "string" ? { timeZone: zone } : {})}
          {...(typeof min === "string" ? { min } : {})}
          {...(typeof max === "string" ? { max } : {})}
        />
      )}
    </FieldShell>
  );
}

function FileUploadRenderer({
  node,
  value,
  error,
  pending,
  inFlight,
  onChange,
  uploadFile,
}: NodeProps): ReactNode {
  const status = statusOf(node, error, pending, inFlight);
  const props = node.props ?? {};
  const path = node.path;
  const types = props["acceptedFileTypes"];
  const maxSize = props["maxSize"];
  // Where the stored file can be fetched. The adapter decides what a key
  // resolves to, so the server is the only side that can say.
  const previewUrl = props["previewUrl"];

  // Stable per path, so the control does not see a new function each render.
  const send = useCallback(
    async (file: File) => {
      if (uploadFile === undefined || path === undefined) {
        throw new Error("Uploading is not available here.");
      }
      return await uploadFile(path, file);
    },
    [uploadFile, path],
  );

  return (
    <FieldShell
      label={node.label ?? node.path ?? ""}
      status={status}
      required={node.required === true}
      inline={node.inlineLabel === true}
      {...(node.helperText === undefined ? {} : { help: node.helperText })}
      {...hintOf(node)}
    >
      {(binding) => (
        <FileUpload
          value={typeof value === "string" ? value : ""}
          onValueChange={(key) => {
            if (path !== undefined) onChange(path, key);
          }}
          status={status}
          binding={binding}
          {...(uploadFile === undefined || path === undefined ? {} : { upload: send })}
          {...(Array.isArray(types) ? { accept: types.join(",") } : {})}
          {...(typeof maxSize === "number" ? { maxSize } : {})}
          {...(typeof previewUrl === "string" && previewUrl !== ""
            ? { previewUrl }
            : {})}
        />
      )}
    </FieldShell>
  );
}

/**
 * Called once at module load. A plugin adds its own with the same function
 * (extension point E3) — there is no privileged path for the built-ins.
 */
/**
 * A repeater, and its rows.
 *
 * The payload's children are flat — every field of every row — because the
 * server addresses them that way. Grouping them back is this file's job, and
 * the key is read off the path rather than tracked: the server already put it
 * there, and anything this remembered could disagree with what came back.
 *
 * The value is the ordered list of keys. Adding, removing and reordering are
 * all writes to that one path, which is why none of them needs a route of its
 * own.
 */
function RepeaterRenderer({
  node,
  value,
  error,
  onChange,
  renderChild,
  valueAt,
  errorAt,
}: NodeProps): ReactNode {
  const path = node.path;
  const keys = Array.isArray(value) ? value.filter(isKey) : [];
  const max = node.props?.["maxItems"];

  const rows = new Map<string, SchemaNode[]>();
  for (const child of node.children ?? []) {
    const key = rowKeyOf(path, child.path);
    if (key === undefined) continue;
    const group = rows.get(key);
    if (group === undefined) rows.set(key, [child]);
    else group.push(child);
  }

  // In the order the value gives, not the order the payload arrived in: the
  // list is what says where a row sits.
  //
  // A row with nothing in any of its fields is marked pending, because that is
  // what the server does with it: it is not written until something is filled
  // in. Saying so is the difference between a row that will be saved and one
  // that looks identical and will not.
  const labels = node.props?.["itemLabels"];
  const items: RepeaterItem[] = keys.map((key) => {
    const named = labelOf(labels, key);
    // The row carries what its fields were refused. A folded row would
    // otherwise hide the reason a form will not save.
    const refused = firstError(rows.get(key), errorAt);
    return {
      id: key,
      ...(isBlankRow(rows.get(key), valueAt) ? { pending: true } : {}),
      ...(named === undefined ? {} : { label: named }),
      ...(refused === undefined ? {} : { error: refused }),
    };
  });

  return (
    <div className="perch-field" data-error={error !== undefined}>
      <Repeater
        title={node.label ?? path ?? ""}
        items={items}
        {...(typeof max === "number" ? { max } : {})}
        {...(node.props?.["collapsible"] === true ? { collapsible: true } : {})}
        onAdd={() => {
          if (path !== undefined) onChange(path, [...keys, newRowKey()]);
        }}
        onRemove={(id) => {
          if (path !== undefined)
            onChange(
              path,
              keys.filter((key) => key !== id),
            );
        }}
        onReorder={(ids) => {
          // Trusted only as far as it names what is already there: a reorder
          // moves rows, it does not invent or drop them.
          if (path === undefined) return;
          const known = ids.filter((id) => keys.includes(id));
          if (known.length === keys.length) onChange(path, known);
        }}
      >
        {(item) => (rows.get(item.id) ?? []).map(renderChild)}
      </Repeater>
      <div className="perch-field__help" data-error={error !== undefined} role="status">
        {error ?? ""}
      </div>
    </div>
  );
}

/** What the server called this row, if the field said how to name one. */
function labelOf(labels: unknown, key: string): string | undefined {
  if (typeof labels !== "object" || labels === null) return undefined;
  const held = (labels as Record<string, unknown>)[key];
  return typeof held === "string" ? held : undefined;
}

/**
 * What the server refused in this row, if it refused anything.
 *
 * The first one: a row is a line, and a line has room for one message. The
 * fields carry their own underneath once the row is open.
 */
function firstError(
  fields: readonly SchemaNode[] | undefined,
  errorAt: (path: string) => string | undefined,
): string | undefined {
  for (const node of fields ?? []) {
    const said = node.path === undefined ? undefined : errorAt(node.path);
    if (said !== undefined) return said;
  }
  return undefined;
}

/** Nothing typed in any of the row's fields, which is what "pending" means. */
function isBlankRow(
  fields: readonly SchemaNode[] | undefined,
  valueAt: (path: string) => unknown,
): boolean {
  return (fields ?? []).every((node) => {
    const held = node.path === undefined ? undefined : valueAt(node.path);
    return held === undefined || held === null || held === "";
  });
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** `items.r1.label` under `items` is `r1`. */
function rowKeyOf(
  parent: string | undefined,
  path: string | undefined,
): string | undefined {
  if (parent === undefined || path === undefined) return undefined;
  if (!path.startsWith(`${parent}.`)) return undefined;
  const rest = path.slice(parent.length + 1);
  const dot = rest.indexOf(".");
  return dot === -1 ? undefined : rest.slice(0, dot);
}

/**
 * A name for a row that has just been added.
 *
 * It only has to be unlike every other key in this list — the server decides
 * what it means, and a key it has never seen is a create whatever it looks
 * like. `randomUUID` where the platform has it, and something unique enough
 * where it does not.
 */
function newRowKey(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return (
    crypto?.randomUUID?.() ??
    `new-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
}

/** A panel's tab, named by its label and given the icon it declared. */
function head(panel: SchemaNode): TabHead {
  const icon = panel.props?.["icon"];
  return {
    id: panel.id,
    label: panel.label ?? "",
    ...(typeof icon === "string" ? { icon } : {}),
  };
}

export function registerBuiltInComponents(): void {
  registerComponent("Schema", LayoutRenderer);
  registerComponent("Section", LayoutRenderer);
  registerComponent("Grid", LayoutRenderer);
  registerComponent("Tabs", TabsRenderer);
  // A box that says something, and holds whatever it is about.
  registerComponent("Callout", LayoutRenderer);
  // Its own, because the grouping it names is a thing the browser can announce.
  registerComponent("Fieldset", FieldsetRenderer);
  // Static content: what the reader looks at rather than a reading of a record.
  registerComponent("Text", TextRenderer);
  registerComponent("Image", ImageRenderer);
  registerComponent("Icon", IconRenderer);
  // A tab outside a `Tabs` is a box with a heading, which is what a layout is.
  registerComponent("Tab", LayoutRenderer);
  registerComponent("TextInput", TextInputRenderer);
  registerComponent("Select", SelectRenderer);
  registerComponent("Checkbox", CheckboxRenderer);
  registerComponent("Radio", RadioRenderer);
  registerComponent("CheckboxList", CheckboxListRenderer);
  registerComponent("TagsInput", TagsInputRenderer);
  registerComponent("KeyValue", KeyValueRenderer);
  registerComponent("ColorPicker", ColorPickerRenderer);
  registerComponent("ToggleButtons", ToggleButtonsRenderer);
  registerComponent("RichEditor", RichEditorRenderer);
  registerComponent("MarkdownEditor", MarkdownEditorRenderer);
  registerComponent("DateTimePicker", DateTimePickerRenderer);
  registerComponent("FileUpload", FileUploadRenderer);
  registerComponent("Placeholder", PlaceholderRenderer);
  registerComponent("Hidden", HiddenRenderer);
  registerComponent("Toggle", ToggleRenderer);
  registerComponent("Textarea", TextareaRenderer);
  registerComponent("Repeater", RepeaterRenderer);
  registerComponent("TextEntry", TextEntryRenderer);
  registerComponent("IconEntry", IconEntryRenderer);
  registerComponent("ImageEntry", ImageEntryRenderer);
  registerComponent("RepeatableEntry", RepeatableEntryRenderer);
}
