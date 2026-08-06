# PRD 06 — Forms: field catalog

**Tier:** v0.1 → v0.3 · **Depends on:** PRD 02, 03

## 1. Objective

The field catalog is what the user touches 90% of the time. Filament offers around twenty fields plus a custom field API. Every field has to be **complete** — a half-finished field is worse than a missing one, because it pushes people to fork.

## 2. Cross-cutting API (inherited by every field)

These methods apply to **all** fields. They matter more than the catalog itself.

| Method | Role | Tier |
|---|---|---|
| `.required()` | validation + asterisk | v0.1 |
| `.default(v \| Resolver)` | initial value on create | v0.1 |
| `.label()` / `.helperText()` / `.placeholder()` | labels (accept a `Resolver`) | v0.1 |
| `.hint()` / `.hintIcon()` / `.hintAction()` | hint to the right of the label | v0.2 |
| `.visible()` / `.hidden()` / `.disabled()` | conditional, **evaluated on the server** | v0.1 |
| `.readOnly()` | displayed, not editable, not persisted | v0.1 |
| `.live()` | triggers a round trip on change | v0.1 |
| `.live({ onBlur: true })` / `.live({ debounce: 500 })` | trigger granularity | v0.1 |
| `.afterStateUpdated(fn)` | server-side effect (may `set()` other fields) | v0.1 |
| `.dehydrated(false)` | present in the form, excluded from persistence | v0.1 |
| `.dehydrateStateUsing(fn)` / `.formatStateUsing(fn)` | transform on write / on read | v0.1 |
| `.rule(fn)` / `.rules([...])` | custom validation | v0.1 |
| `.validationMessages({})` | custom messages | v0.2 |
| `.columnSpan()` | layout | v0.1 |
| `.prefix()` / `.suffix()` / `.prefixIcon()` | affixes | v0.2 |
| `.autofocus()` / `.extraAttributes()` | miscellaneous | v0.2 |
| `.extend(fn)` / `.configureUsing(fn)` | global or local extension (PRD 11) | v0.1 |

**Invariant**: `.dehydrated(false)` and `.visible(false)` must both guarantee **non-persistence**. That is a security invariant, and it is tested.

## 3. Catalog

### 3.1 Tier v0.1 — the 10 essentials

| Field | Expected specifics |
|---|---|
| `TextInput` | `.email()` `.url()` `.password()` `.numeric()` `.tel()` `.minLength()` `.maxLength()` `.unique(ignoreRecord)` `.mask()` (v0.2) |
| `Textarea` | `.rows()` `.autosize()` `.maxLength()` with a counter |
| `Select` | `.options(v \| Resolver)` · **`.relationship(name, labelField)`** · `.searchable()` (**server-side** search, not client filtering) · `.multiple()` · `.preload()` · `.createOptionForm()` (v0.2) · `.optionsLimit()` |
| `Checkbox` | `.inline()` |
| `Toggle` | `.onIcon()` `.offIcon()` `.onColor()` |
| `Radio` | `.options()` `.inline()` · *(note: Filament v4 separated "inline buttons" from "inline label" — take up that distinction)* |
| `DateTimePicker` | `.date()` `.time()` `.minDate()` `.maxDate()` `.timezone()` `.format()` · **explicit timezone handling** |
| `FileUpload` | `.disk()` `.directory()` `.image()` `.maxSize()` `.acceptedFileTypes()` `.multiple()` `.imageEditor()` (v0.3) |
| `Hidden` | — |
| `Placeholder` | displays a computed, non-editable value |

**`Select.relationship()` is the most important field in the catalog.** It is the one that carries the promise: `Select.make('authorId').relationship('author', 'name')` has to load, search on the server, paginate and persist the foreign key, with no configuration.

**`.searchable()` has to be server-side.** Filtering 10,000 options on the client is the classic bug. A `searchable` search issues a paginated query.

### 3.2 Tier v0.2

| Field | Notes |
|---|---|
| `Repeater` | `.relationship()` · `.schema([])` · `.minItems()` `.maxItems()` · `.reorderable()` · `.collapsible()` · `.itemLabel(Resolver)` · `.cloneable()` · `.deleteAction()`. **The project's hard case (A3).** |
| `CheckboxList` | `.options()` `.relationship()` `.searchable()` `.bulkToggleable()` `.columns()` |
| `TagsInput` | `.separator()` `.suggestions()` `.nestedRecursiveRules()` |
| `KeyValue` | `.keyLabel()` `.valueLabel()` `.reorderable()` · for `Json` fields |
| `RichEditor` | **TipTap**, not Trix — Filament v4 made that switch. Configurable toolbar, image upload, variable placeholders |
| `MarkdownEditor` | preview, toolbar |
| `ColorPicker` | hex / rgb / hsl |
| `ToggleButtons` | a visual alternative to Radio, `.inline()` `.grouped()` |

### 3.3 Tier v0.3

| Field | Notes |
|---|---|
| `Builder` | reorderable polymorphic blocks — the "page builder" field. High complexity, high value. |
| `Slider` | min/max/step |
| `CodeEditor` | syntax highlighting, configurable language |
| `Wizard` (layout) | steps, per-step validation, conditional navigation |

### 3.4 Custom fields (v0.2) — PRD 11

A two-part contract: a server class extending `Field`, and a React component registered in the registry. Documented as a first-class path, not as a hack.

## 4. Layouts (schema components)

| Component | Tier | Notes |
|---|---|---|
| `Schema` (root) | v0.1 | `.columns(n \| Responsive)` |
| `Grid` | v0.1 | responsive grid |
| `Section` | v0.1 | `.description()` `.icon()` `.collapsible()` `.collapsed()` `.aside()` |
| `Fieldset` | v0.2 | light grouping |
| `Tabs` | v0.2 | `.persistTab()` in the URL |
| `Callout` | v0.2 | info/warning/danger box |
| `Prime` (Text/Image/Icon) | v0.2 | static content inside a schema |
| `EmptyState` | v0.2 | — |
| `Wizard` | v0.3 | — |
| `Split` | v0.3 | — |

## 5. Acceptance criteria

1. The 10 v0.1 fields pass a shared test matrix: rendering, input, validation, conditional behavior, persistence, reload.
2. `Select.relationship()` on a table of 50,000 options: opening < 200 ms, server-side search < 200 ms, no N+1 query.
3. `.visible(false)` and `.dehydrated(false)` both guarantee non-persistence — an explicit test for each.
4. `DateTimePicker`: a date entered in UTC+2 is persisted in UTC and displayed again in UTC+2 with no drift (tested across a daylight-saving change).
5. `FileUpload`: an interrupted upload leaves neither an orphan file nor a partial row.
6. **A3** — Repeater: adding, editing, reordering and deleting rows in a single transaction, with a complete rollback on failure.
7. Every field is keyboard-navigable and announced correctly by a screen reader.

## 6. Out of scope

- Geolocation / map fields (plugin candidate).
- Handwritten signature (plugin candidate).
- WYSIWYG table editor.
- Payment fields.
- i18n of labels in v0.1.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Too many half-finished fields | **High** | a shared test matrix mandatory before shipping a field; 10 finished fields beat 20 approximate ones |
| Timezones (the classic admin trap) | High | an explicit policy: store UTC, display in the user's zone, tests across DST |
| `Repeater` and `Builder` eat the whole budget | Medium | `Repeater` in v0.2 because A3 requires it; `Builder` pushed to v0.3 |
| `RichEditor` (TipTap) weighs down the bundle | Medium | lazy-load the field, outside the main bundle |
