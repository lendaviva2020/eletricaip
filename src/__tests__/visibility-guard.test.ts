import { afterEach, describe, expect, it, vi } from "vitest";
import { isDocumentHidden } from "@/lib/utils/visibility";

describe("isDocumentHidden", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retorna false sem document (SSR)", () => {
    vi.stubGlobal("document", undefined);
    expect(isDocumentHidden()).toBe(false);
  });

  it("segue document.hidden", () => {
    vi.stubGlobal("document", { hidden: true });
    expect(isDocumentHidden()).toBe(true);
    vi.stubGlobal("document", { hidden: false });
    expect(isDocumentHidden()).toBe(false);
  });
});
