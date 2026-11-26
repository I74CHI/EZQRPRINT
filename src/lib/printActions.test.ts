import { describe, expect, it } from "vitest";
import { bytesToArrayBuffer, safeZipName } from "./printActions";

describe("bytesToArrayBuffer", () => {
  it("converts a full Uint8Array into an ArrayBuffer", () => {
    const uint8 = new Uint8Array([1, 2, 3, 4, 5]);
    const buffer = bytesToArrayBuffer(uint8);
    expect(buffer.byteLength).toBe(5);
    const roundtrip = new Uint8Array(buffer);
    expect(Array.from(roundtrip)).toEqual([1, 2, 3, 4, 5]);
  });

  it("converts an empty Uint8Array into an empty ArrayBuffer", () => {
    const uint8 = new Uint8Array([]);
    const buffer = bytesToArrayBuffer(uint8);
    expect(buffer.byteLength).toBe(0);
  });

  it("handles Uint8Array slices with offsets properly", () => {
    const parent = new Uint8Array([10, 20, 30, 40, 50]);
    const slice = parent.subarray(1, 4); // [20, 30, 40]
    const buffer = bytesToArrayBuffer(slice);
    expect(buffer.byteLength).toBe(3);
    expect(Array.from(new Uint8Array(buffer))).toEqual([20, 30, 40]);
  });
});

describe("safeZipName", () => {
  it("preserves standard file names", () => {
    expect(safeZipName("document.pdf", 0)).toBe("document.pdf");
    expect(safeZipName("my_photo.png", 1)).toBe("my_photo.png");
  });

  it("strips directory path separators from Windows and POSIX paths", () => {
    expect(safeZipName("C:\\Users\\John\\Documents\\contract.pdf", 0)).toBe("contract.pdf");
    expect(safeZipName("/home/user/downloads/ticket.pdf", 1)).toBe("ticket.pdf");
  });

  it("replaces invalid Windows and filesystem characters with underscores", () => {
    expect(safeZipName('file:name*with?illegal"chars<>.pdf', 0)).toBe(
      "file_name_with_illegal_chars__.pdf",
    );
  });

  it("falls back to indexed name when the name is empty or only dots", () => {
    expect(safeZipName("", 0)).toBe("file-1");
    expect(safeZipName("...", 1)).toBe("file-2");
    expect(safeZipName("   ", 2)).toBe("file-3");
    expect(safeZipName(".", 3)).toBe("file-4");
  });

  it("strips control characters", () => {
    expect(safeZipName("my\u0000file\u001f.pdf", 0)).toBe("my_file_.pdf");
  });
});
