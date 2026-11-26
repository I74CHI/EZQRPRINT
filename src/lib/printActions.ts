import { getDownloadURL, ref } from "firebase/storage";
import type { PDFDocument as PDFDocumentType } from "pdf-lib";
import { storage } from "./firebase";
import type { Order, OrderFile } from "../types";

const A4_WIDTH = 210 * (72 / 25.4);
const A4_HEIGHT = 297 * (72 / 25.4);

export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function fetchOrderFile(file: OrderFile): Promise<Blob> {
  const url = file.downloadUrl || await getDownloadURL(ref(storage, file.storagePath));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${file.fileName} (${response.status}).`);
  }
  return response.blob();
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadOrderFile(file: OrderFile) {
  downloadBlob(await fetchOrderFile(file), file.fileName);
}

export function safeZipName(fileName: string, index: number) {
  const basename = fileName
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/^\.+$/, "")
    .trim();
  return basename || `file-${index + 1}`;
}

export async function downloadOrderZip(order: Order) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  const blobs = await Promise.all(order.files.map(fetchOrderFile));

  blobs.forEach((blob, index) => {
    const baseName = safeZipName(order.files[index].fileName, index);
    const count = (usedNames.get(baseName) ?? 0) + 1;
    usedNames.set(baseName, count);
    const extensionIndex = baseName.lastIndexOf(".");
    const name =
      count === 1
        ? baseName
        : extensionIndex > 0
          ? `${baseName.slice(0, extensionIndex)} (${count})${baseName.slice(extensionIndex)}`
          : `${baseName} (${count})`;
    zip.file(name, blob);
  });

  const archive = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  downloadBlob(archive, `EZQRPRINT-Token-${order.tokenNumber}.zip`);
}

export async function createOrderPdf(order: Order): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const output = await PDFDocument.create();
  const blobs = await Promise.all(order.files.map(fetchOrderFile));

  for (let index = 0; index < order.files.length; index += 1) {
    const file = order.files[index];
    const blob = blobs[index];
    if (file.mimeType === "application/pdf") {
      let source: PDFDocumentType;
      try {
        source = await PDFDocument.load(await blob.arrayBuffer());
      } catch {
        throw new Error(`Could not read ${file.fileName}. It may be encrypted or damaged.`);
      }

      const pageIndices = source.getPageIndices();
      for (let copy = 0; copy < file.copies; copy += 1) {
        const pages = await output.copyPages(source, pageIndices);
        pages.forEach((page) => output.addPage(page));
      }
      continue;
    }

    const imageBytes = await blob.arrayBuffer();
    const image =
      file.mimeType === "image/png"
        ? await output.embedPng(imageBytes)
        : await output.embedJpg(imageBytes);
    const scale = Math.min(A4_WIDTH / image.width, A4_HEIGHT / image.height);
    const width = image.width * scale;
    const height = image.height * scale;

    for (let copy = 0; copy < file.copies; copy += 1) {
      const page = output.addPage([A4_WIDTH, A4_HEIGHT]);
      page.drawImage(image, {
        x: (A4_WIDTH - width) / 2,
        y: (A4_HEIGHT - height) / 2,
        width,
        height,
      });
    }
  }

  return new Blob([bytesToArrayBuffer(await output.save())], {
    type: "application/pdf",
  });
}

export function printBlob(blob: Blob, mimeType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    const objectUrl = URL.createObjectURL(blob);
    let settled = false;
    let cleaned = false;
    let loadTimeout = 0;
    let printTimer = 0;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.clearTimeout(loadTimeout);
      window.clearTimeout(printTimer);
      frame.remove();
      URL.revokeObjectURL(objectUrl);
    };
    const fail = (issue: Error) => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(issue);
      }
    };

    frame.title = "EZQRPRINT print preview";
    frame.style.position = "fixed";
    frame.style.inset = "0";
    frame.style.width = "100vw";
    frame.style.height = "100vh";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.addEventListener("error", () => fail(new Error("The print preview could not be opened.")));
    frame.addEventListener("load", () => {
      const frameWindow = frame.contentWindow;
      if (!frameWindow) {
        fail(new Error("The print preview is unavailable in this browser."));
        return;
      }
      frameWindow.addEventListener("afterprint", cleanup, { once: true });

      const printWhenReady = () => {
        if (settled) return;
        try {
          frameWindow.focus();
          frameWindow.print();
          settled = true;
          resolve();
          window.clearTimeout(loadTimeout);
          loadTimeout = window.setTimeout(cleanup, 60_000);
        } catch (printIssue) {
          fail(
            printIssue instanceof Error
              ? printIssue
              : new Error("Unable to open the print dialog."),
          );
        }
      };

      if (mimeType.startsWith("image/")) {
        const image = frame.contentDocument?.querySelector("img");
        if (!image) {
          fail(new Error("The image print preview could not be read."));
        } else if (image.complete) {
          if (image.naturalWidth > 0) printWhenReady();
          else fail(new Error("The image could not be loaded for printing."));
        } else {
          image.addEventListener("load", printWhenReady, { once: true });
          image.addEventListener("error", () => {
            fail(new Error("The image could not be loaded for printing."));
          }, { once: true });
        }
      } else {
        printTimer = window.setTimeout(printWhenReady, 700);
      }
    });

    if (mimeType.startsWith("image/")) {
      frame.srcdoc = `<!doctype html><html><head><style>@page{margin:0}html,body{margin:0;width:100%;height:100%}img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body><img src="${objectUrl}" alt=""></body></html>`;
    } else {
      frame.src = objectUrl;
    }
    loadTimeout = window.setTimeout(() => {
      fail(new Error("The print preview did not finish loading."));
    }, 60_000);
    document.body.append(frame);
  });
}

export const downloadBlobAsFile = downloadBlob;
