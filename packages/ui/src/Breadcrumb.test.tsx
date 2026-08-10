/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Breadcrumb } from "./Breadcrumb.js";

afterEach(cleanup);

describe("the trail back", () => {
  it("links to the list and names where you are", () => {
    render(
      <Breadcrumb listPath="/admin/posts" listLabel="Posts" current="Edit Post" />,
    );

    expect(screen.getByRole("link", { name: "Posts" }).getAttribute("href")).toBe(
      "/admin/posts",
    );
    expect(screen.getByText("Edit Post")).toBeTruthy();
  });

  it("does not link to the page you are already on", () => {
    // A control that does nothing, and one a screen reader would offer as a
    // destination.
    render(
      <Breadcrumb listPath="/admin/posts" listLabel="Posts" current="Edit Post" />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Edit Post").getAttribute("aria-current")).toBe("page");
  });

  it("is a landmark a screen reader can find or skip", () => {
    render(<Breadcrumb listPath="/admin/posts" listLabel="Posts" current="Edit" />);

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  });

  it("shows nothing when the server would not vouch for the address", () => {
    // Same rule as a row action: the path is withheld when it would not point
    // at this origin, and a breadcrumb off the site is the same hole.
    render(<Breadcrumb current="Edit Post" />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
