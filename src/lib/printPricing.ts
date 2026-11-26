import type { PublicShop } from "../types";

export const MAX_ORDER_FILES = 20;
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

export type PrintMimeType = "application/pdf" | "image/jpeg" | "image/png";

const EXTENSION_MAP: Record<string, PrintMimeType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export function getPrintMimeType(fileName: string): PrintMimeType | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return (ext && EXTENSION_MAP[ext]) || null;
}

export function isValidUploadSize(size: number) {
  return Number.isFinite(size) && size >= 0 && size <= MAX_UPLOAD_SIZE_BYTES;
}

export function calculatePrintCost(
  pageCount: number | null,
  copies: number,
  colorMode: "bw" | "color",
  rates: PublicShop["rates"],
  printSides: "single" | "double" = "single",
) {
  if (pageCount === null) return 0;
  const rate = colorMode === "bw"
    ? printSides === "double" ? rates.bwDoubleSidedPerPage : rates.bwPerPage
    : printSides === "double" ? rates.colorDoubleSidedPerPage : rates.colorPerPage;
  return pageCount * copies * rate;
}
