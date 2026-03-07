import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn() utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes via clsx", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("deduplicates conflicting tailwind classes (twMerge)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("handles undefined / null / empty inputs", () => {
    expect(cn(undefined, null, "", "valid")).toBe("valid");
  });

  it("merges array inputs", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("returns empty string when no inputs", () => {
    expect(cn()).toBe("");
  });
});
