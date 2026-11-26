import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRecord,
  requireRecord,
  requireKeys,
  requireId,
  parseRates,
  validateFiles,
  istDateKey,
} from "./orderTransactions";

describe("orderTransactions validation helpers", () => {
  it("isRecord correctly identifies plain objects", () => {
    assert.equal(isRecord({ a: 1 }), true);
    assert.equal(isRecord({}), true);
    assert.equal(isRecord(null), false);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord("string"), false);
    assert.equal(isRecord(123), false);
    assert.equal(isRecord(undefined), false);
  });

  it("requireRecord returns valid objects and throws on invalid types", () => {
    assert.deepEqual(requireRecord({ key: "val" }), { key: "val" });
    assert.throws(() => requireRecord(null), (err: any) => err.code === "invalid-argument");
    assert.throws(() => requireRecord([1, 2]), (err: any) => err.code === "invalid-argument");
    assert.throws(() => requireRecord("hello"), (err: any) => err.code === "invalid-argument");
  });

  it("requireKeys validates exact required field presence", () => {
    assert.doesNotThrow(() => requireKeys({ a: 1, b: 2 }, ["a", "b"]));
    assert.throws(() => requireKeys({ a: 1 }, ["a", "b"]), (err: any) => err.code === "invalid-argument");
    assert.throws(() => requireKeys({ a: 1, b: 2, c: 3 }, ["a", "b"]), (err: any) => err.code === "invalid-argument");
  });

  it("requireId enforces format and patterns", () => {
    const slugPattern = /^[a-z0-9_-]{3,20}$/;
    assert.equal(requireId("shop-123", "shop", slugPattern), "shop-123");
    assert.throws(() => requireId("s", "shop", slugPattern), (err: any) => err.code === "invalid-argument");
    assert.throws(() => requireId("INVALID_UPPERCASE!", "shop", slugPattern), (err: any) => err.code === "invalid-argument");
    assert.throws(() => requireId(12345, "shop", slugPattern), (err: any) => err.code === "invalid-argument");
  });

  it("parseRates parses valid rates and rejects invalid rates", () => {
    assert.deepEqual(parseRates({ bwPerPage: 2, colorPerPage: 10 }), {
      bwPerPage: 2,
      colorPerPage: 10,
    });
    assert.deepEqual(parseRates({ bwPerPage: 0, colorPerPage: 0 }), {
      bwPerPage: 0,
      colorPerPage: 0,
    });
    assert.throws(() => parseRates(null), (err: any) => err.code === "failed-precondition");
    assert.throws(() => parseRates({ bwPerPage: -1, colorPerPage: 10 }), (err: any) => err.code === "failed-precondition");
    assert.throws(() => parseRates({ bwPerPage: 2, colorPerPage: NaN }), (err: any) => err.code === "failed-precondition");
    assert.throws(() => parseRates({ bwPerPage: 2 }), (err: any) => err.code === "failed-precondition");
  });

  it("istDateKey produces YYYY-MM-DD in Asia/Kolkata timezone", () => {
    const d1 = new Date("2026-11-25T18:29:59.999Z");
    const d2 = new Date("2026-11-25T18:30:00.000Z");
    assert.equal(istDateKey(d1), "2026-11-25");
    assert.equal(istDateKey(d2), "2026-11-26");
  });

  it("validateFiles accepts valid files and verifies itemCost", () => {
    const shopId = "test-shop";
    const orderId = "order1234567890abcdef";
    const rates = { bwPerPage: 2, colorPerPage: 10 };
    const validFile = {
      fileName: "doc.pdf",
      storagePath: `shops/${shopId}/orders/${orderId}/doc_123`,
      downloadUrl: "",
      mimeType: "application/pdf",
      pageCount: 3,
      copies: 2,
      colorMode: "bw",
      printSides: "double",
      printNote: "standard",
      itemCost: 12, // 3 * 2 * 2 = 12
    };

    const validated = validateFiles([validFile], shopId, orderId, rates);
    assert.equal(validated.length, 1);
    assert.equal(validated[0].itemCost, 12);
  });

  it("validateFiles rejects empty file list or more than 20 files", () => {
    const rates = { bwPerPage: 2, colorPerPage: 10 };
    assert.throws(() => validateFiles([], "shop", "order", rates), (err: any) => err.code === "invalid-argument");
    assert.throws(
      () => validateFiles(new Array(21).fill({}), "shop", "order", rates),
      (err: any) => err.code === "invalid-argument",
    );
  });

  it("validateFiles rejects rates mismatch or invalid costs", () => {
    const shopId = "shop1";
    const orderId = "order1234567890abcdef";
    const rates = { bwPerPage: 2, colorPerPage: 10 };
    const file = {
      fileName: "pic.jpg",
      storagePath: `shops/${shopId}/orders/${orderId}/pic_1`,
      downloadUrl: "",
      mimeType: "image/jpeg",
      pageCount: 1,
      copies: 1,
      colorMode: "color",
      printSides: "single",
      printNote: "standard",
      itemCost: 5, // Expected 1 * 1 * 10 = 10, not 5
    };

    assert.throws(() => validateFiles([file], shopId, orderId, rates), (err: any) => err.code === "failed-precondition");
  });

  it("validateFiles enforces image pageCount === 1 and PDF standard printNote", () => {
    const shopId = "shop1";
    const orderId = "order1234567890abcdef";
    const rates = { bwPerPage: 2, colorPerPage: 10 };

    // Image with pageCount > 1
    const invalidImage = {
      fileName: "pic.jpg",
      storagePath: `shops/${shopId}/orders/${orderId}/pic_1`,
      downloadUrl: "",
      mimeType: "image/jpeg",
      pageCount: 2,
      copies: 1,
      colorMode: "color",
      printSides: "single",
      printNote: "standard",
      itemCost: 20,
    };
    assert.throws(() => validateFiles([invalidImage], shopId, orderId, rates), (err: any) => err.code === "invalid-argument");

    // PDF with id-card note
    const invalidPdf = {
      fileName: "doc.pdf",
      storagePath: `shops/${shopId}/orders/${orderId}/doc_1`,
      downloadUrl: "",
      mimeType: "application/pdf",
      pageCount: 1,
      copies: 1,
      colorMode: "bw",
      printSides: "single",
      printNote: "id-card",
      itemCost: 2,
    };
    assert.throws(() => validateFiles([invalidPdf], shopId, orderId, rates), (err: any) => err.code === "invalid-argument");
  });
});
