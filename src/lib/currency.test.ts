import { describe, expect, it } from "vitest";
import { formatINR } from "./currency";

describe("formatINR", () => {
  it("formats whole rupee amounts with two decimal places", () => {
    const formatted = formatINR(100);
    expect(formatted).toMatch(/₹\s*100\.00/);
  });

  it("formats zero rupees", () => {
    const formatted = formatINR(0);
    expect(formatted).toMatch(/₹\s*0\.00/);
  });

  it("formats amounts with paise correctly", () => {
    const formatted = formatINR(2.5);
    expect(formatted).toMatch(/₹\s*2\.50/);
  });

  it("formats large numbers with Indian number grouping", () => {
    const formatted = formatINR(150000);
    // In en-IN, 150000 is 1,50,000.00
    expect(formatted).toMatch(/₹\s*1,50,000\.00/);
  });

  it("formats negative amounts", () => {
    const formatted = formatINR(-45.5);
    expect(formatted).toContain("45.50");
  });
});
