import { describe, expect, it } from "vitest";
import { getShopPortalUrl } from "./shopUrl";

describe("getShopPortalUrl", () => {
  it("includes the GitHub Pages repository path and hash route", () => {
    expect(
      getShopPortalUrl("https://owner.github.io", "/EZQRPRINT/", "sharma-prints"),
    ).toBe("https://owner.github.io/EZQRPRINT/#/s/sharma-prints");
  });

  it("supports a custom domain deployed at its root", () => {
    expect(
      getShopPortalUrl("https://prints.example", "/", "sharma-prints"),
    ).toBe("https://prints.example/#/s/sharma-prints");
  });
});
