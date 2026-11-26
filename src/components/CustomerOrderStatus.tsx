import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { CheckCircle2, Plus, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { db, functions } from "../lib/firebase";
import { formatINR } from "../lib/currency";
import type { Order, OrderFile, PublicShop } from "../types";
import { OrderReceipt } from "./OrderReceipt";
import { PrintFileUploader } from "./PrintFileUploader";
import { LoadingScreen } from "./StatusScreen";

interface CustomerOrderStatusProps {
  shop: PublicShop;
  orderId: string;
  sessionWarning?: string | null;
  onStartNewOrder: () => void;
}

export function CustomerOrderStatus({
  shop,
  orderId,
  sessionWarning,
  onStartNewOrder,
}: CustomerOrderStatusProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingFiles, setAddingFiles] = useState(false);
  const [claimingPayment, setClaimingPayment] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setOrder(null);
    return onSnapshot(
      doc(db, "orders", orderId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setOrder(null);
          setError("This order is no longer available.");
          setLoading(false);
          return;
        }
        setOrder(snapshot.data() as Order);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      },
    );
  }, [orderId]);

  async function appendFiles(files: OrderFile[]) {
    await httpsCallable(functions, "appendOrderFiles")({ orderId, files });
    setAddingFiles(false);
  }

  async function claimPayment() {
    setClaimingPayment(true);
    setError(null);
    try {
      await updateDoc(doc(db, "orders", orderId), { paymentClaimed: true });
    } catch (paymentIssue) {
      setError(
        paymentIssue instanceof Error
          ? paymentIssue.message
          : "Unable to update the payment claim.",
      );
    } finally {
      setClaimingPayment(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f2ee] px-5 text-[#171717]">
        <section className="w-full max-w-lg border-l-4 border-[#e6322b] bg-white p-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e6322b]">
            EZQRPRINT
          </p>
          <p role="alert" className="mt-3 text-[#55534d]">
            {error ?? "This order is no longer available."}
          </p>
          <button
            type="button"
            onClick={onStartNewOrder}
            className="mt-5 bg-[#171717] px-5 py-3 font-bold text-white"
          >
            Start New Order
          </button>
        </section>
      </main>
    );
  }

  if (order.paymentClaimed || order.status === "completed") {
    return <OrderReceipt shop={shop} order={order} onStartNewOrder={onStartNewOrder} />;
  }

  const paymentUrl = shop.upiId
    ? `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(
        shop.upiPayeeName || shop.shopName,
      )}&am=${order.finalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
        `EZQRPRINT ${order.tokenNumber}`,
      )}`
    : null;

  return (
    <main className="min-h-screen bg-[#f3f2ee] px-4 py-6 text-[#171717] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-7 flex items-center gap-3 border-b border-[#c9c7c0] pb-5">
          <span className="flex h-10 w-10 items-center justify-center bg-[#e6322b] text-white">
            <Printer size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e6322b]">
              EZQRPRINT
            </p>
            <p className="font-bold">{shop.shopName}</p>
          </div>
        </header>

        {(error || sessionWarning) && (
          <p role="alert" className="mb-5 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
            {error || sessionWarning}
          </p>
        )}

        <section className="border border-[#171717] bg-white p-6 text-center sm:p-9">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#68665f]">
            Your print token
          </p>
          <p className="mt-2 text-6xl font-black tracking-tight text-[#e6322b] sm:text-7xl">
            #{order.tokenNumber}
          </p>
          <p className="mt-4 text-lg font-bold">
            {order.status === "awaiting_payment"
              ? "Your print job is ready for payment."
              : order.status === "printing"
                ? "Your files are being printed."
                : "Your print order is in the queue."}
          </p>
          <p className="mt-2 text-sm text-[#68665f]">
            Keep this token and show it at the counter.
          </p>

          <div className="mt-6 border-t border-[#e0ded7] pt-5 text-left">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-[#55534d]">{order.files.length} file(s)</span>
              <span className="font-bold">{formatINR(order.totalAmount)}</span>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-[#55534d]">
              {order.files.map((file, index) => (
                <li
                  key={`${file.storagePath}-${index}`}
                  className="flex justify-between gap-3"
                >
                  <span className="min-w-0 break-all">
                    {file.fileName} · {file.colorMode === "bw" ? "B&W" : "Color"} ·{" "}
                    {file.pageCount} pg × {file.copies} ·{" "}
                    {file.printSides === "double" ? "Double-sided" : "Single-sided"}
                  </span>
                  <span className="shrink-0">{formatINR(file.itemCost)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {(order.status === "pending" || order.status === "printing") && (
          <section className="mt-6">
            <button
              type="button"
              onClick={() => setAddingFiles((current) => !current)}
              className="inline-flex items-center gap-2 border border-[#171717] bg-white px-5 py-3 font-bold transition hover:bg-black/5"
            >
              <Plus size={18} aria-hidden="true" />
              {addingFiles ? "Close file upload" : "+ Add More Files to This Order"}
            </button>
            {addingFiles && (
              <div className="mt-4 border border-[#c9c7c0] bg-white p-5">
                <PrintFileUploader
                  shop={shop}
                  orderId={orderId}
                  existingFileCount={order.files.length}
                  submitLabel="Add Files to This Order"
                  onUploaded={appendFiles}
                />
              </div>
            )}
          </section>
        )}

        {order.status === "awaiting_payment" && (
          <section className="mt-6 border border-[#c9c7c0] bg-white p-6 text-center sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#68665f]">
              Amount to pay
            </p>
            <p className="mt-2 text-3xl font-black">{formatINR(order.finalAmount)}</p>
            {paymentUrl ? (
              <>
                <a
                  href={paymentUrl}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-[#16834a] px-5 py-4 text-lg font-black text-white transition hover:bg-[#116b3c] sm:w-auto"
                >
                  <CheckCircle2 size={21} aria-hidden="true" />
                  Pay {formatINR(order.finalAmount)} via UPI App
                </a>
                <div className="mx-auto mt-7 w-fit border border-[#171717] bg-white p-3">
                  <QRCodeSVG value={paymentUrl} size={210} level="H" includeMargin />
                </div>
                <p className="mt-3 text-sm text-[#68665f]">
                  Scan the QR code if the UPI app button is unavailable.
                </p>
                <button
                  type="button"
                  onClick={claimPayment}
                  disabled={claimingPayment || order.paymentClaimed}
                  className="mt-6 w-full border border-[#171717] px-5 py-3 font-bold transition hover:bg-black/5 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
                >
                  {claimingPayment ? "Updating…" : "I Have Paid"}
                </button>
              </>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[#55534d]">
                UPI payment is not configured for this shop. Please pay at the counter.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
