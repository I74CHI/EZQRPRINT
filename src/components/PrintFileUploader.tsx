import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Minus, Plus, Trash2, Upload } from "lucide-react";
import type { OrderFile, PublicShop } from "../types";
import { formatINR } from "../lib/currency";
import { api } from "../lib/api";
import {
  calculatePrintCost,
  getPrintMimeType,
  isValidUploadSize,
  MAX_ORDER_FILES,
  type PrintMimeType,
} from "../lib/printPricing";

interface PrintFileUploaderProps {
  shop: Pick<PublicShop, "id" | "rates">;
  orderId: string;
  submitLabel: string;
  existingFileCount?: number;
  onUploaded: (files: OrderFile[]) => Promise<void>;
}

interface FileDraft {
  key: string;
  file: File;
  mimeType: PrintMimeType;
  pageCount: number | null;
  manualPageCount: boolean;
  copies: number;
  colorMode: "bw" | "color";
  printSides: "single" | "double";
  printNote: "standard" | "id-card";
  progress: number;
}

export function PrintFileUploader({
  shop,
  orderId,
  submitLabel,
  existingFileCount = 0,
  onUploaded,
}: PrintFileUploaderProps) {
  const [files, setFiles] = useState<FileDraft[]>([]);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const uploadedPaths = useRef<string[]>([]);
  const total = files.reduce(
    (amount, file) =>
      amount +
      calculatePrintCost(file.pageCount, file.copies, file.colorMode, shop.rates, file.printSides),
    0,
  );
  const hasInvalidPageCount = files.some(
    (file) => file.pageCount === null || file.pageCount < 1,
  );

  async function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    setSelectError(null);
    setSubmitError(null);

    const accepted: Array<{ file: File; mimeType: FileDraft["mimeType"] }> = [];
    const rejected: string[] = [];

    for (const file of selected) {
      const mimeType = getPrintMimeType(file.name);
      if (!mimeType) {
        rejected.push(`${file.name}: select a PDF, JPG, JPEG, or PNG file.`);
      } else if (!isValidUploadSize(file.size)) {
        rejected.push(`${file.name}: files must be 25 MB or smaller.`);
      } else {
        accepted.push({ file, mimeType });
      }
    }

    if (existingFileCount + files.length + accepted.length > MAX_ORDER_FILES) {
      setSelectError("An order can contain up to 20 files.");
      return;
    }

    const preparationErrors: string[] = [];
    const preparedResults = await Promise.all(
      accepted.map(async ({ file, mimeType }): Promise<FileDraft | null> => {
        let pageCount: number | null = 1;
        let manualPageCount = false;
        if (mimeType === "application/pdf") {
          try {
            const { PDFDocument } = await import("pdf-lib");
            const pdf = await PDFDocument.load(await file.arrayBuffer());
            pageCount = pdf.getPageCount();
          } catch (parseIssue) {
            const encrypted =
              parseIssue instanceof Error &&
              parseIssue.message.toLowerCase().includes("encrypted");
            if (encrypted) {
              pageCount = null;
              manualPageCount = true;
            } else {
              preparationErrors.push(
                `${file.name}: PDF page count could not be read.`,
              );
              return null;
            }
          }
        }

        return {
          key: crypto.randomUUID(),
          file,
          mimeType,
          pageCount,
          manualPageCount,
          copies: 1,
          colorMode: "bw",
          printSides: "single",
          printNote: "standard",
          progress: 0,
        };
      }),
    );

    setFiles((current) => [
      ...current,
      ...preparedResults.filter((file): file is FileDraft => file !== null),
    ]);
    const selectionIssues = [...rejected, ...preparationErrors];
    if (selectionIssues.length > 0) setSelectError(selectionIssues.join(" "));
  }

  function updateFile(key: string, updates: Partial<FileDraft>) {
    setFiles((current) =>
      current.map((file) => (file.key === key ? { ...file, ...updates } : file)),
    );
  }

  async function uploadFile(draft: FileDraft): Promise<OrderFile> {
    const pageCount = draft.pageCount;
    if (pageCount === null || pageCount < 1) {
      throw new Error(`Enter the page count for ${draft.file.name}.`);
    }
    const { storagePath } = await api.uploadFile(
      draft.file,
      draft.mimeType,
      orderId,
      shop.id,
      (progress) => updateFile(draft.key, { progress }),
    );
    uploadedPaths.current.push(storagePath);

    return {
      fileName: draft.file.name,
      storagePath,
      downloadUrl: "",
      mimeType: draft.mimeType,
      pageCount,
      copies: draft.copies,
      colorMode: draft.colorMode,
      printSides: draft.printSides,
      printNote: draft.mimeType === "application/pdf" ? "standard" : draft.printNote,
      itemCost: calculatePrintCost(
        pageCount,
        draft.copies,
        draft.colorMode,
        shop.rates,
        draft.printSides,
      ),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (files.length === 0) {
      setSubmitError("Choose at least one file to continue.");
      return;
    }
    if (hasInvalidPageCount) {
      setSubmitError("Enter a valid page count for each encrypted PDF.");
      return;
    }
    if (existingFileCount + files.length > MAX_ORDER_FILES) {
      setSubmitError("An order can contain up to 20 files.");
      return;
    }

    setSubmitting(true);
    uploadedPaths.current = [];
    try {
      const results = await Promise.allSettled(files.map(uploadFile));
      const failedUpload = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failedUpload) {
        throw failedUpload.reason instanceof Error
          ? failedUpload.reason
          : new Error("One or more files could not be uploaded.");
      }

      const uploadedFiles = results.map((result) => {
        if (result.status !== "fulfilled") {
          throw new Error("File upload did not complete.");
        }
        return result.value;
      });
      await onUploaded(uploadedFiles);
      uploadedPaths.current = [];
      setFiles([]);
    } catch (uploadIssue) {
      const cleanupResults = await Promise.allSettled(
        uploadedPaths.current.map((storagePath) =>
          api.deleteUpload(storagePath, orderId, shop.id),
        ),
      );
      const cleanupFailures = cleanupResults.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      uploadedPaths.current = [];
      const originalMessage =
        uploadIssue instanceof Error
          ? uploadIssue.message
          : "Unable to submit the print files.";
      setSubmitError(
        cleanupFailures.length > 0
          ? `${originalMessage} Some temporary files could not be removed.`
          : originalMessage,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="flex cursor-pointer flex-col items-center justify-center border border-dashed border-[#77746d] bg-white px-5 py-8 text-center transition hover:border-[#e6322b]">
        <Upload className="mb-3 text-[#e6322b]" size={24} aria-hidden="true" />
        <span className="font-bold">Choose files to print</span>
        <span className="mt-1 text-sm text-[#68665f]">
          PDF, JPG, JPEG, or PNG · up to 25 MB per file
        </span>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          multiple
          onChange={handleSelect}
          disabled={submitting}
          className="sr-only"
        />
      </label>

      {selectError && (
        <p role="alert" className="border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
          {selectError}
        </p>
      )}
      {submitError && (
        <p role="alert" className="border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
          {submitError}
        </p>
      )}

      {files.map((file) => (
        <article key={file.key} className="border-t border-[#c9c7c0] bg-white py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-all font-bold">{file.file.name}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-[#68665f]">
                {file.mimeType === "application/pdf" ? "PDF" : "Image"} ·{" "}
                {(file.file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiles((current) => current.filter((entry) => entry.key !== file.key))}
              disabled={submitting}
              aria-label={`Remove ${file.file.name}`}
              className="p-2 text-[#68665f] hover:text-[#e6322b] disabled:opacity-50"
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#68665f]">
                Pages
              </p>
              {file.manualPageCount ? (
                <label className="flex items-center gap-3 text-sm">
                  Manual page count
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={file.pageCount ?? ""}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      updateFile(file.key, {
                        pageCount:
                          event.target.value === "" || !Number.isInteger(value)
                            ? null
                            : value,
                      });
                    }}
                    className="w-24 border border-[#aaa79f] px-3 py-2 outline-none focus:border-[#e6322b]"
                  />
                </label>
              ) : (
                <p className="text-sm font-semibold">
                  {file.pageCount} {file.pageCount === 1 ? "page" : "pages"}
                  {file.mimeType !== "application/pdf" ? " · image" : ""}
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#68665f]">
                Copies
              </p>
              <div className="inline-flex items-center border border-[#aaa79f]">
                <button
                  type="button"
                  aria-label={`Remove one copy of ${file.file.name}`}
                  disabled={file.copies <= 1 || submitting}
                  onClick={() => updateFile(file.key, { copies: file.copies - 1 })}
                  className="p-2 hover:bg-black/5 disabled:opacity-40"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="min-w-10 text-center font-bold">{file.copies}</span>
                <button
                  type="button"
                  aria-label={`Add one copy of ${file.file.name}`}
                  disabled={submitting}
                  onClick={() => updateFile(file.key, { copies: file.copies + 1 })}
                  className="p-2 hover:bg-black/5 disabled:opacity-40"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#68665f]">
              Print sides
            </p>
            <div className="flex gap-2">
              {(["single", "double"] as const).map((sides) => (
                <button
                  key={sides}
                  type="button"
                  aria-pressed={file.printSides === sides}
                  disabled={submitting}
                  onClick={() => updateFile(file.key, { printSides: sides })}
                  className={`px-3 py-2 text-sm font-bold ${
                    file.printSides === sides
                      ? "bg-[#171717] text-white"
                      : "border border-[#aaa79f] text-[#55534d] hover:bg-black/5"
                  }`}
                >
                  {sides === "single" ? "Single-sided" : "Double-sided"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#68665f]">
              Billed per page using the matching single-sided or double-sided B&amp;W or Color rate. Enable duplex in the printer settings.
            </p>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#68665f]">
              Print mode
            </p>
            <div className="flex gap-2">
              {(["bw", "color"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={file.colorMode === mode}
                  disabled={submitting}
                  onClick={() => updateFile(file.key, { colorMode: mode })}
                  className={`px-3 py-2 text-sm font-bold ${
                    file.colorMode === mode
                      ? "bg-[#171717] text-white"
                      : "border border-[#aaa79f] text-[#55534d] hover:bg-black/5"
                  }`}
                >
                  {mode === "bw" ? "Black & White" : "Color"}
                </button>
              ))}
            </div>
          </div>

          {file.mimeType !== "application/pdf" && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#68665f]">
                Image size
              </p>
              <div className="flex gap-2">
                {(["standard", "id-card"] as const).map((note) => (
                  <button
                    key={note}
                    type="button"
                    aria-pressed={file.printNote === note}
                    disabled={submitting}
                    onClick={() => updateFile(file.key, { printNote: note })}
                    className={`px-3 py-2 text-sm font-bold ${
                      file.printNote === note
                        ? "bg-[#171717] text-white"
                        : "border border-[#aaa79f] text-[#55534d] hover:bg-black/5"
                    }`}
                  >
                    {note === "standard" ? "Standard Print" : "ID Card Size"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {submitting && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span>Uploading</span>
                <span>{file.progress}%</span>
              </div>
              <progress
                value={file.progress}
                max="100"
                aria-label={`Upload progress for ${file.file.name}`}
                className="h-2 w-full accent-[#e6322b]"
              />
            </div>
          )}

          <p className="mt-4 text-right text-sm font-bold">
          Item total:{" "}
          {formatINR(
            calculatePrintCost(
              file.pageCount,
              file.copies,
              file.colorMode,
              shop.rates,
              file.printSides,
            ),
          )}
          </p>
        </article>
      ))}

      <div className="flex flex-col gap-4 border-t border-[#171717] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xl font-black">
          Total <span className="text-[#e6322b]">{formatINR(total)}</span>
        </p>
        <button
          type="submit"
          disabled={submitting || files.length === 0 || hasInvalidPageCount}
          className="bg-[#e6322b] px-5 py-3 font-bold text-white transition hover:bg-[#c92722] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Uploading files…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
