import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";

export const MAX_ORDER_FILES = 20;
export const FILE_FIELDS = [
  "fileName",
  "storagePath",
  "downloadUrl",
  "mimeType",
  "pageCount",
  "copies",
  "colorMode",
  "printSides",
  "printNote",
  "itemCost",
] as const;

type MimeType = "application/pdf" | "image/jpeg" | "image/png";
type Rates = { bwPerPage: number; colorPerPage: number };
type OrderFile = {
  fileName: string;
  storagePath: string;
  downloadUrl: "";
  mimeType: MimeType;
  pageCount: number;
  copies: number;
  colorMode: "bw" | "color";
  printSides: "single" | "double";
  printNote: "standard" | "id-card";
  itemCost: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "Invalid request data.");
  }
  return value;
}

export function requireKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new HttpsError("invalid-argument", "Request contains unsupported fields.");
  }
}

export function requireId(value: unknown, label: string, pattern: RegExp) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new HttpsError("invalid-argument", `Invalid ${label}.`);
  }
  return value;
}

export function parseRates(value: unknown): Rates {
  if (!isRecord(value)) {
    throw new HttpsError("failed-precondition", "Shop print rates are unavailable.");
  }
  const { bwPerPage, colorPerPage } = value;
  if (
    typeof bwPerPage !== "number" ||
    !Number.isFinite(bwPerPage) ||
    bwPerPage < 0 ||
    typeof colorPerPage !== "number" ||
    !Number.isFinite(colorPerPage) ||
    colorPerPage < 0
  ) {
    throw new HttpsError("failed-precondition", "Shop print rates are invalid.");
  }
  return { bwPerPage, colorPerPage };
}

export function validateFiles(
  value: unknown,
  shopId: string,
  orderId: string,
  rates: Rates,
): OrderFile[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_ORDER_FILES
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Add between 1 and ${MAX_ORDER_FILES} files.`,
    );
  }

  const prefix = `shops/${shopId}/orders/${orderId}/`;
  return value.map((fileValue) => {
    const file = requireRecord(fileValue);
    requireKeys(file, FILE_FIELDS);
    const {
      fileName,
      storagePath,
      downloadUrl,
      mimeType,
      pageCount,
      copies,
      colorMode,
      printSides,
      printNote,
      itemCost,
    } = file;
    const suffix =
      typeof storagePath === "string" && storagePath.startsWith(prefix)
        ? storagePath.slice(prefix.length)
        : "";

    if (
      typeof fileName !== "string" ||
      !fileName.trim() ||
      fileName.length > 255 ||
      !/^[A-Za-z0-9_-]+$/.test(suffix) ||
      downloadUrl !== "" ||
      !["application/pdf", "image/jpeg", "image/png"].includes(
        mimeType as string,
      ) ||
      !Number.isSafeInteger(pageCount) ||
      (pageCount as number) < 1 ||
      !Number.isSafeInteger(copies) ||
      (copies as number) < 1 ||
      !["bw", "color"].includes(colorMode as string) ||
      !["single", "double"].includes(printSides as string) ||
      !["standard", "id-card"].includes(printNote as string) ||
      (mimeType === "application/pdf" && printNote !== "standard") ||
      (mimeType !== "application/pdf" && pageCount !== 1) ||
      typeof itemCost !== "number" ||
      !Number.isFinite(itemCost) ||
      itemCost < 0
    ) {
      throw new HttpsError("invalid-argument", `Invalid file: ${fileName || "unknown"}.`);
    }

    const rate = colorMode === "bw" ? rates.bwPerPage : rates.colorPerPage;
    if (itemCost !== (pageCount as number) * (copies as number) * rate) {
      throw new HttpsError(
        "failed-precondition",
        "Print rates changed. Reload the shop page and try again.",
      );
    }

    return {
      fileName,
      storagePath: storagePath as string,
      downloadUrl: "",
      mimeType: mimeType as MimeType,
      pageCount: pageCount as number,
      copies: copies as number,
      colorMode: colorMode as "bw" | "color",
      printSides: printSides as "single" | "double",
      printNote: printNote as "standard" | "id-card",
      itemCost,
    };
  });
}

const istDateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
export const istDateKey = (date: Date) => istDateFmt.format(date);

function readShop(data: DocumentData | undefined, shopId: string) {
  if (
    !data ||
    data.id !== shopId ||
    typeof data.slug !== "string" ||
    !data.slug ||
    !Number.isSafeInteger(data.dailyCounter) ||
    typeof data.lastOrderDate !== "string"
  ) {
    throw new HttpsError("failed-precondition", "Shop settings are incomplete.");
  }
  return {
    slug: data.slug,
    rates: parseRates(data.rates),
    dailyCounter: data.dailyCounter as number,
    lastOrderDate: data.lastOrderDate,
  };
}

async function validatePublishedShop(
  transaction: FirebaseFirestore.Transaction,
  shopId: string,
  shop: ReturnType<typeof readShop>,
) {
  const publicShop = await transaction.get(
    db.collection("publicShops").doc(shop.slug),
  );
  if (
    !publicShop.exists ||
    publicShop.data()?.id !== shopId ||
    publicShop.data()?.slug !== shop.slug
  ) {
    throw new HttpsError("not-found", "This EZQRPRINT shop is not available.");
  }
}

export const createCustomerOrder = onCall(async (request) => {
  const data = requireRecord(request.data);
  requireKeys(data, ["shopId", "orderId", "files"]);
  const shopId = requireId(data.shopId, "shop", /^[A-Za-z0-9_-]{1,128}$/);
  const orderId = requireId(data.orderId, "order", /^[A-Za-z0-9_-]{20}$/);
  const shopRef = db.collection("shops").doc(shopId);
  const orderRef = db.collection("orders").doc(orderId);

  const tokenNumber = await db.runTransaction(async (transaction) => {
    const [shopSnapshot, orderSnapshot] = await Promise.all([
      transaction.get(shopRef),
      transaction.get(orderRef),
    ]);
    if (!shopSnapshot.exists) {
      throw new HttpsError("not-found", "This EZQRPRINT shop is not available.");
    }
    if (orderSnapshot.exists) {
      throw new HttpsError("already-exists", "This order session already exists.");
    }

    const shop = readShop(shopSnapshot.data(), shopId);
    await validatePublishedShop(transaction, shopId, shop);
    const files = validateFiles(data.files, shopId, orderId, shop.rates);
    const totalAmount = files.reduce((total, file) => total + file.itemCost, 0);
    if (!Number.isFinite(totalAmount)) {
      throw new HttpsError("invalid-argument", "The order total is invalid.");
    }

    const today = istDateKey(new Date());
    const nextToken = shop.lastOrderDate === today ? shop.dailyCounter + 1 : 101;
    const createdAt = Timestamp.now();
    transaction.update(shopRef, {
      dailyCounter: nextToken,
      lastOrderDate: today,
    });
    transaction.create(orderRef, {
      id: orderId,
      shopId,
      tokenNumber: nextToken,
      status: "pending",
      paymentClaimed: false,
      filesPurged: false,
      totalAmount,
      finalAmount: totalAmount,
      createdAt,
      expiresAt: Timestamp.fromMillis(createdAt.toMillis() + 24 * 60 * 60 * 1000),
      files,
    });
    return nextToken;
  });

  return { tokenNumber };
});

export const appendOrderFiles = onCall(async (request) => {
  const data = requireRecord(request.data);
  requireKeys(data, ["orderId", "files"]);
  const orderId = requireId(data.orderId, "order", /^[A-Za-z0-9_-]{20}$/);
  const orderRef = db.collection("orders").doc(orderId);

  const fileCount = await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) {
      throw new HttpsError("not-found", "This order is no longer available.");
    }

    const order = orderSnapshot.data()!;
    if (
      !["pending", "printing"].includes(order.status) ||
      order.filesPurged !== false ||
      order.paymentClaimed !== false ||
      !Array.isArray(order.files) ||
      order.files.length >= MAX_ORDER_FILES
    ) {
      throw new HttpsError(
        "failed-precondition",
        "More files cannot be added to this order.",
      );
    }

    const shopId = requireId(
      order.shopId,
      "shop",
      /^[A-Za-z0-9_-]{1,128}$/,
    );
    const shopRef = db.collection("shops").doc(shopId);
    const shopSnapshot = await transaction.get(shopRef);
    if (!shopSnapshot.exists) {
      throw new HttpsError("not-found", "This EZQRPRINT shop is no longer available.");
    }

    const shop = readShop(shopSnapshot.data(), shopId);
    await validatePublishedShop(transaction, shopId, shop);
    const files = validateFiles(data.files, shopId, orderId, shop.rates);
    if (order.files.length + files.length > MAX_ORDER_FILES) {
      throw new HttpsError(
        "invalid-argument",
        `An order can contain up to ${MAX_ORDER_FILES} files.`,
      );
    }

    const nextFiles = [...order.files, ...files];
    const totalAmount = nextFiles.reduce(
      (total, file) => total + Number(file.itemCost),
      0,
    );
    if (!Number.isFinite(totalAmount)) {
      throw new HttpsError("invalid-argument", "The order total is invalid.");
    }

    transaction.update(orderRef, {
      files: nextFiles,
      totalAmount,
      finalAmount: totalAmount,
    });
    return nextFiles.length;
  });

  return { fileCount };
});
