import { describe, expect, it } from "vitest";
import {
  calculatePrintCost,
  getPrintMimeType,
  isValidUploadSize,
  MAX_UPLOAD_SIZE_BYTES,
} from "./printPricing";

describe("supported upload types", () => {
  it.each([
    ["job.PDF", "application/pdf"],
    ["photo.jpg", "image/jpeg"],
    ["photo.JPEG", "image/jpeg"],
    ["photo.png", "image/png"],
  ] as const)("maps %s to %s", (fileName, mimeType) => {
    expect(getPrintMimeType(fileName)).toBe(mimeType);
  });

  it.each(["photo.webp", "document.pdf.exe", "README", ""])(
    "rejects unsupported extensions (%s)",
    (fileName) => {
      expect(getPrintMimeType(fileName)).toBeNull();
    },
  );
});

describe("upload size limits", () => {
  it("accepts files through the exact 25 MiB limit", () => {
    expect(isValidUploadSize(0)).toBe(true);
    expect(isValidUploadSize(MAX_UPLOAD_SIZE_BYTES)).toBe(true);
  });

  it.each([-1, MAX_UPLOAD_SIZE_BYTES + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid size %s",
    (size) => {
      expect(isValidUploadSize(size)).toBe(false);
    },
  );
});

describe("print pricing", () => {
  const rates = { bwPerPage: 2.5, colorPerPage: 10 };

  it("multiplies page count, copies, and the selected rate", () => {
    expect(calculatePrintCost(3, 2, "bw", rates)).toBe(15);
    expect(calculatePrintCost(2, 3, "color", rates)).toBe(60);
  });

  it("charges nothing while an encrypted PDF has no entered page count", () => {
    expect(calculatePrintCost(null, 2, "color", rates)).toBe(0);
  });
});
