/**
 * @vitest-environment jsdom
 */
/**
 * The pictures an infolist draws, and the ones it does not.
 *
 * Every address here was minted from a stored key and read on the server, so
 * there is nothing to check again — what is worth holding is that the component
 * draws what it was handed and invents nothing when it was handed nothing.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageEntry } from "./ImageEntry.js";

afterEach(cleanup);

const AT = ["https://cdn.example/a.png", "https://cdn.example/b.png"];

describe("a picture", () => {
  it("is drawn at the address it was given", () => {
    const { container } = render(<ImageEntry pictures={[AT[0] ?? ""]} />);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(AT[0]);
  });

  it("says nothing to a screen reader, because the label already did", () => {
    // Inside a shell that names it. A picture repeating the label is the label
    // read twice.
    const { container } = render(<ImageEntry pictures={[AT[0] ?? ""]} />);

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("takes the side it was told to take", () => {
    const { container } = render(<ImageEntry pictures={[AT[0] ?? ""]} size={64} />);

    expect(container.querySelector("p")?.getAttribute("style")).toContain(
      "--perch-picture: 64px",
    );
  });

  it("is a circle where it was asked to be one", () => {
    const { container } = render(<ImageEntry pictures={[AT[0] ?? ""]} circular />);

    expect(container.querySelector("img")?.getAttribute("data-circular")).toBe("true");
  });
});

describe("several of them", () => {
  it("draws each one", () => {
    const { container } = render(<ImageEntry pictures={AT} />);

    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("overlaps them only when asked", () => {
    const { container } = render(<ImageEntry pictures={AT} stacked />);
    expect(container.querySelector("p")?.getAttribute("data-stacked")).toBe("true");

    cleanup();
    const plain = render(<ImageEntry pictures={AT} />).container;
    expect(plain.querySelector("p")?.getAttribute("data-stacked")).toBeNull();
  });
});

describe("nothing to show", () => {
  it("says so in words rather than leaving a gap", () => {
    const { container } = render(<ImageEntry placeholder="No picture" />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("No picture")).toBeTruthy();
  });

  it("treats an empty list the same as none at all", () => {
    // The server drops an address it could not vouch for, so a record with one
    // unreadable key arrives as a list with nothing in it.
    const { container } = render(<ImageEntry pictures={[]} />);

    expect(container.querySelector("[data-empty='true']")).not.toBeNull();
  });
});
