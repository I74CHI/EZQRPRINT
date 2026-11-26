import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import type { Order, PublicShop } from "../types";
import { formatINR } from "../lib/currency";

interface OrderReceiptProps {
  shop: PublicShop;
  order: Order;
  onStartNewOrder: () => void;
}

function getRate(file: Order["files"][number]) {
  const quantity = file.pageCount * file.copies;
  return quantity > 0 ? file.itemCost / quantity : 0;
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function OrderReceipt({
  shop,
  order,
  onStartNewOrder,
}: OrderReceiptProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const receiptDate = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(order.createdAt.toDate());

  async function downloadReceipt() {
    setDownloadError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1;
      const initialContext = canvas.getContext("2d");
      if (!initialContext) throw new Error("Canvas is not available in this browser.");

      initialContext.font = "600 28px Arial, Helvetica, sans-serif";
      const itemLines = order.files.map((file) => {
        const rate = getRate(file);
        const mode = file.colorMode === "bw" ? "B&W" : "Color";
        const line =
          `${file.fileName} · ${mode} · ${file.printSides === "double" ? "Double-sided · " : ""}` +
          `${file.pageCount} pg × ${file.copies} copies ` +
          `@ ${formatINR(rate)} = ${formatINR(file.itemCost)}`;
        return wrapText(initialContext, line, 1030);
      });

      const adjustmentHeight = order.finalAmount !== order.totalAmount ? 70 : 0;
      const canvasHeight =
        700 +
        itemLines.reduce((height, lines) => height + Math.max(100, lines.length * 40 + 60), 0) +
        adjustmentHeight;
      canvas.height = canvasHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available in this browser.");

      context.fillStyle = "#f3f2ee";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(50, 50, 1100, canvas.height - 100);
      context.fillStyle = "#e6322b";
      context.fillRect(50, 50, 14, canvas.height - 100);

      context.fillStyle = "#171717";
      context.font = "900 36px Arial, Helvetica, sans-serif";
      context.fillText("EZQRPRINT", 100, 125);
      context.font = "700 24px Arial, Helvetica, sans-serif";
      context.fillText("DIGITAL RECEIPT", 100, 175);
      context.font = "600 28px Arial, Helvetica, sans-serif";
      context.fillText(shop.shopName, 100, 235);
      context.font = "500 24px Arial, Helvetica, sans-serif";
      context.fillStyle = "#55534d";
      context.fillText(`Token #${order.tokenNumber}`, 100, 285);
      context.fillText(`${receiptDate} IST`, 100, 325);

      let y = 390;
      context.strokeStyle = "#c9c7c0";
      context.beginPath();
      context.moveTo(100, y);
      context.lineTo(1100, y);
      context.stroke();
      y += 42;

      context.fillStyle = "#171717";
      context.font = "700 22px Arial, Helvetica, sans-serif";
      context.fillText("ITEMIZED PRINT JOB", 100, y);
      y += 28;

      order.files.forEach((_, index) => {
        y += 28;
        context.font = "600 28px Arial, Helvetica, sans-serif";
        context.fillStyle = "#171717";
        for (const line of itemLines[index]) {
          context.fillText(line, 100, y);
          y += 40;
        }
        y += 12;
        context.strokeStyle = "#e0ded7";
        context.beginPath();
        context.moveTo(100, y);
        context.lineTo(1100, y);
        context.stroke();
      });

      if (order.finalAmount !== order.totalAmount) {
        const difference = order.finalAmount - order.totalAmount;
        const label = difference < 0 ? "Discount" : "Adjustment";
        y += 45;
        context.font = "600 24px Arial, Helvetica, sans-serif";
        context.fillStyle = "#55534d";
        context.fillText(label, 100, y);
        context.textAlign = "right";
        context.fillText(
          `${difference < 0 ? "−" : "+"}${formatINR(Math.abs(difference))}`,
          1100,
          y,
        );
        context.textAlign = "left";
      }

      y += 70;
      context.fillStyle = "#171717";
      context.font = "900 32px Arial, Helvetica, sans-serif";
      context.fillText("TOTAL PAID", 100, y);
      context.textAlign = "right";
      context.fillText(formatINR(order.finalAmount), 1100, y);
      context.textAlign = "left";

      context.save();
      context.translate(980, y + 100);
      context.rotate(-0.08);
      context.strokeStyle = "#e6322b";
      context.lineWidth = 6;
      context.strokeRect(-105, -36, 210, 72);
      context.fillStyle = "#e6322b";
      context.font = "900 38px Arial, Helvetica, sans-serif";
      context.textAlign = "center";
      context.fillText("PAID", 0, 13);
      context.restore();

      context.fillStyle = "#68665f";
      context.font = "500 18px Arial, Helvetica, sans-serif";
      context.fillText("Thank you · EZQRPRINT", 100, canvasHeight - 60);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("The receipt image could not be generated."));
        }, "image/png");
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `EZQRPRINT-Receipt-${order.tokenNumber}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (receiptIssue) {
      setDownloadError(
        receiptIssue instanceof Error
          ? receiptIssue.message
          : "Unable to download the receipt.",
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f2ee] px-4 py-8 text-[#171717] sm:px-6 sm:py-12">
      <section className="mx-auto max-w-2xl space-y-5">
        <article className="border border-[#171717] bg-white">
          <header className="border-b border-[#c9c7c0] p-5 sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e6322b]">
              EZQRPRINT
            </p>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Digital Receipt</h2>
                <p className="mt-2 font-semibold">{shop.shopName}</p>
                <p className="mt-1 text-sm text-[#68665f]">{receiptDate} IST</p>
              </div>
              <div className="border border-[#e6322b] px-4 py-2 text-right">
                <span className="block text-xs font-bold uppercase tracking-wider text-[#68665f]">
                  Token
                </span>
                <span className="text-2xl font-black text-[#e6322b]">
                  #{order.tokenNumber}
                </span>
              </div>
            </div>
          </header>

          <div className="divide-y divide-[#e0ded7] px-5 sm:px-7">
            {order.files.map((file, index) => (
              <div key={`${file.storagePath}-${index}`} className="py-4">
                <p className="break-all font-bold">{file.fileName}</p>
                <p className="mt-1 text-sm text-[#55534d]">
                  {file.colorMode === "bw" ? "B&W" : "Color"} ·{" "}
                  {file.printSides === "double" ? "Double-sided · " : ""}
                  {file.pageCount} pg ×{" "}
                  {file.copies} copies @ {formatINR(getRate(file))} ={" "}
                  {formatINR(file.itemCost)}
                </p>
                {file.printNote === "id-card" && (
                  <p className="mt-1 text-xs uppercase tracking-wide text-[#68665f]">
                    ID card size
                  </p>
                )}
              </div>
            ))}
          </div>

          {order.finalAmount !== order.totalAmount && (
            <div className="flex justify-between border-t border-[#c9c7c0] px-5 py-4 text-sm sm:px-7">
              <span>
                {order.finalAmount < order.totalAmount ? "Discount" : "Adjustment"}
              </span>
              <span className="font-semibold">
                {order.finalAmount < order.totalAmount ? "−" : "+"}
                {formatINR(Math.abs(order.finalAmount - order.totalAmount))}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[#171717] p-5 sm:px-7">
            <span className="text-lg font-black">Total Paid</span>
            <span className="text-2xl font-black text-[#e6322b]">
              {formatINR(order.finalAmount)}
            </span>
          </div>

          <div className="flex justify-end px-5 pb-6 sm:px-7">
            <span className="rotate-[-5deg] border-2 border-[#e6322b] px-4 py-1 text-lg font-black tracking-[0.2em] text-[#e6322b]">
              PAID
            </span>
          </div>
        </article>

        {downloadError && (
          <p
            role="alert"
            className="border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]"
          >
            {downloadError}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={downloadReceipt}
            className="inline-flex items-center justify-center gap-2 bg-[#171717] px-5 py-3 font-bold text-white transition hover:bg-[#333]"
          >
            <Download size={18} aria-hidden="true" /> Download Receipt (PNG)
          </button>
          <button
            type="button"
            onClick={onStartNewOrder}
            className="inline-flex items-center justify-center gap-2 border border-[#171717] px-5 py-3 font-bold text-[#171717] transition hover:bg-black/5"
          >
            <RotateCcw size={18} aria-hidden="true" /> Skip / Start New Order
          </button>
        </div>
      </section>
    </main>
  );
}
