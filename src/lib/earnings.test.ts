import { describe, expect, it } from "vitest";
import {
  getIstDateKey,
  getIstDayRange,
  getPageBreakdown,
  shiftDateKey,
  summarizeEarnings,
} from "./earnings";

describe("IST earnings dates", () => {
  it("uses the IST calendar date on both sides of midnight", () => {
    expect(getIstDateKey(new Date("2026-11-25T18:29:59.999Z"))).toBe("2026-11-25");
    expect(getIstDateKey(new Date("2026-11-25T18:30:00.000Z"))).toBe("2026-11-26");
  });

  it("shifts dates across month, leap-year, and year boundaries", () => {
    expect(shiftDateKey("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDateKey("2024-02-29", 1)).toBe("2024-03-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("returns an exclusive 24-hour IST day range", () => {
    const { start, end } = getIstDayRange("2026-11-26");
    expect(start.toISOString()).toBe("2026-11-25T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-11-26T18:30:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it.each(["", "2026-2-01", "2026-02-29", "not-a-date"])(
    "rejects invalid date keys (%s)",
    (dateKey) => {
      expect(() => getIstDayRange(dateKey)).toThrow(RangeError);
    },
  );

  it("rejects fractional date offsets", () => {
    expect(() => shiftDateKey("2026-01-01", 0.5)).toThrow(RangeError);
  });
});

describe("earnings summaries", () => {
  it("counts copies and separates B&W and color pages", () => {
    const files = [
      { pageCount: 2, copies: 2, colorMode: "bw" as const },
      { pageCount: 3, copies: 1, colorMode: "color" as const },
    ];
    expect(getPageBreakdown(files)).toEqual({ bw: 4, color: 3 });
    expect(
      summarizeEarnings([
        { files, finalAmount: 100 },
        { files: [], finalAmount: 40 },
      ]),
    ).toEqual({ orders: 2, pages: 7, earnings: 140 });
  });

  it("returns zero totals for an empty day", () => {
    expect(summarizeEarnings([])).toEqual({ orders: 0, pages: 0, earnings: 0 });
    expect(getPageBreakdown([])).toEqual({ bw: 0, color: 0 });
  });
});
