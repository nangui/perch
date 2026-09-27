/**
 * What the guard reads, case by case.
 *
 * The routes it stands on are proved over HTTP, where a real request carries a
 * real body and a real parser has already had it. This file is the other half:
 * the content types a form can send, the ones it cannot, and the shapes a
 * header arrives in. A double is enough for that, because what is being read
 * here is two strings.
 */
import type { ExecutionContext } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CrossSiteGuard, PANEL_REQUEST_HEADER } from "./cross-site.js";

const asking = (
  method: string,
  headers: Readonly<Record<string, string>> = {},
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  }) as unknown as ExecutionContext;

const guard = new CrossSiteGuard();
const allows = (context: ExecutionContext): boolean => guard.canActivate(context);
const refuses = (context: ExecutionContext): void => {
  expect(() => guard.canActivate(context)).toThrow(NotFoundException);
};

describe("a request that changes nothing", () => {
  it.each(["GET", "HEAD", "OPTIONS", "get"])("is let through: %s", (method) => {
    expect(allows(asking(method))).toBe(true);
  });
});

describe("a request that changes something", () => {
  it("is let through when it is JSON", () => {
    expect(allows(asking("POST", { "content-type": "application/json" }))).toBe(true);
  });

  it("is let through when the type carries a charset", () => {
    // What a browser and most clients actually send. Comparing the whole header
    // would refuse the panel's own requests on the day one gains a parameter.
    expect(
      allows(asking("PATCH", { "content-type": "application/json; charset=utf-8" })),
    ).toBe(true);
  });

  it("is let through when it names itself, whatever it carries", () => {
    expect(
      allows(
        asking("POST", {
          "content-type": "multipart/form-data; boundary=x",
          [PANEL_REQUEST_HEADER]: "1",
        }),
      ),
    ).toBe(true);
  });

  it("is refused when it is the kind of form another page can post", () => {
    // The two that reached the routes before this existed.
    refuses(asking("POST", { "content-type": "application/x-www-form-urlencoded" }));
    refuses(asking("POST", { "content-type": "multipart/form-data; boundary=x" }));
  });

  it("is refused when it carries text, which a form can also send", () => {
    refuses(asking("POST", { "content-type": "text/plain" }));
  });

  it("is refused when it says nothing at all", () => {
    refuses(asking("DELETE"));
  });

  it("is refused where the type only begins like JSON", () => {
    refuses(asking("POST", { "content-type": "application/json-patch+json" }));
  });
});
