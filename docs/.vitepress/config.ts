import { defineConfig } from "vitepress";

/**
 * The documentation site.
 *
 * `srcDir` is the guide and only the guide. Everything else under `docs/` — the
 * PRDs, the ADRs, the architecture notes — is written for whoever is building
 * the framework, and a reader looking for how to declare a form does not need
 * to walk past a decision record about icon vocabularies to find it. The two
 * audiences are different, so the site serves one of them.
 *
 * Every TypeScript block on every page below is extracted and compiled against
 * what the packages publish, so an example that stopped being true fails the
 * build rather than the reader.
 */
export default defineConfig({
  title: "Perch",
  description:
    "An admin panel for NestJS. Declare a resource in TypeScript; never write a front end.",
  srcDir: "guide",
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: "Guide", link: "/" },
      {
        text: "GitHub",
        link: "https://github.com/nangui/perch",
      },
    ],

    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Installation", link: "/installation" },
          { text: "How the pieces fit", link: "/how-it-fits" },
        ],
      },
      {
        text: "Building a panel",
        items: [
          { text: "Resources", link: "/resources" },
          { text: "Forms", link: "/forms" },
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
        ],
      },
      {
        text: "Going to production",
        items: [{ text: "Deployment", link: "/deployment" }],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/nangui/perch" }],

    editLink: {
      pattern: "https://github.com/nangui/perch/edit/main/docs/guide/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Perch contributors",
    },
  },
});
