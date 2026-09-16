/**
 * The guide's shape, in one place.
 *
 * Out of the VitePress config because two readers need it. The site draws it
 * as a sidebar; `llms.ts` turns it into the index an agent reads. A second
 * list written for the second reader is a list that would drift, and the one
 * that drifted would be the one no human ever looks at.
 */

/**
 * Where the guide is published.
 *
 * The one line to change when a domain is bought. Until then it is the
 * markdown in the repository, which is real, stable, and already the clean
 * markdown the llms.txt proposal asks a site to serve: what the guide is
 * written in is what a reader fetching these addresses receives.
 */
export const SITE = "https://github.com/nangui/perch/blob/main/docs/guide";

/** How an address is built from a sidebar link. `/` is the guide's index. */
export function addressOf(link: string): string {
  return `${SITE}${link === "/" ? "/index" : link}.md`;
}

export interface SidebarLink {
  readonly text: string;
  readonly link: string;
}

export interface SidebarSection {
  readonly text: string;
  readonly collapsed?: boolean;
  readonly items: readonly SidebarLink[];
}

/**
 * Sections an agent may skip when it is short of room.
 *
 * The reference: one page per field, per column, per action. Somebody asking
 * how to declare a resource does not need eleven column pages, and will fetch
 * the one they need when they need it. This is what `## Optional` means in the
 * llms.txt proposal, and it is the only hierarchy that format has.
 */
export const OPTIONAL_SECTIONS: readonly string[] = ["Fields", "Columns", "Actions"];

export const SIDEBAR: readonly SidebarSection[] = [
  {
    text: "Getting started",
    items: [
      { text: "Introduction", link: "/" },
      { text: "Installation", link: "/installation" },
      { text: "How the pieces fit", link: "/how-it-fits" },
      { text: "AI-assisted development", link: "/ai-assisted" },
    ],
  },
  {
    text: "Building a panel",
    items: [
      { text: "Resources", link: "/resources" },
      { text: "Schemas", link: "/schemas" },
      { text: "Forms", link: "/forms" },
      { text: "Tables", link: "/tables" },
      { text: "Infolists", link: "/infolists" },
      { text: "Configuration", link: "/configuration" },
      { text: "Styling", link: "/styling" },
      { text: "Advanced", link: "/advanced" },
      { text: "Navigation", link: "/navigation" },
      { text: "Users", link: "/users" },
      { text: "Auth recipes", link: "/auth-recipes" },
      { text: "Actions", link: "/actions" },
      { text: "Notifications", link: "/notifications" },
      { text: "Testing", link: "/testing" },
      { text: "Plugins", link: "/plugins" },
    ],
  },
  {
    text: "Fields",
    collapsed: false,
    items: [
      { text: "TextInput", link: "/fields/text-input" },
      { text: "Textarea", link: "/fields/textarea" },
      { text: "Select", link: "/fields/select" },
      { text: "Checkbox", link: "/fields/checkbox" },
      { text: "Toggle", link: "/fields/toggle" },
      { text: "Radio", link: "/fields/radio" },
      { text: "CheckboxList", link: "/fields/checkbox-list" },
      { text: "ToggleButtons", link: "/fields/toggle-buttons" },
      { text: "DateTimePicker", link: "/fields/date-time-picker" },
      { text: "FileUpload", link: "/fields/file-upload" },
      { text: "Repeater", link: "/fields/repeater" },
      { text: "TagsInput", link: "/fields/tags-input" },
      { text: "KeyValue", link: "/fields/key-value" },
      { text: "ColorPicker", link: "/fields/color-picker" },
      { text: "Hidden", link: "/fields/hidden" },
      { text: "RichEditor", link: "/fields/rich-editor" },
      { text: "MarkdownEditor", link: "/fields/markdown-editor" },
      { text: "Placeholder", link: "/fields/placeholder" },
    ],
  },
  {
    text: "Columns",
    collapsed: false,
    items: [
      { text: "TextColumn", link: "/columns/text" },
      { text: "BadgeColumn", link: "/columns/badge" },
      { text: "IconColumn", link: "/columns/icon" },
      { text: "ImageColumn", link: "/columns/image" },
      { text: "AvatarColumn", link: "/columns/avatar" },
      { text: "ColorColumn", link: "/columns/color" },
      { text: "GaugeColumn", link: "/columns/gauge" },
      { text: "ToggleColumn", link: "/columns/toggle" },
      { text: "CheckboxColumn", link: "/columns/checkbox" },
      { text: "TextInputColumn", link: "/columns/text-input" },
      { text: "SelectColumn", link: "/columns/select" },
    ],
  },
  {
    text: "Actions",
    collapsed: false,
    items: [
      { text: "CreateAction", link: "/actions/create" },
      { text: "EditAction", link: "/actions/edit" },
      { text: "ViewAction", link: "/actions/view" },
      { text: "DeleteAction", link: "/actions/delete" },
      { text: "RestoreAction", link: "/actions/restore" },
      { text: "ForceDeleteAction", link: "/actions/force-delete" },
      { text: "ReplicateAction", link: "/actions/replicate" },
      { text: "DetachAction", link: "/actions/detach" },
    ],
  },
  {
    text: "Going to production",
    items: [{ text: "Deployment", link: "/deployment" }],
  },
];
