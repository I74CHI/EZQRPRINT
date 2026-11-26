import { useEffect, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Download,
  FileImage,
  FileText,
  LogOut,
  Printer,
  Settings as SettingsIcon,
  Store,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PrintLayoutModal } from "../components/PrintLayoutModal";
import { QrStandeeGenerator } from "../components/QrStandeeGenerator";
import { FeedbackPage, LoadingScreen } from "../components/StatusScreen";
import {
  createOrderPdf,
  downloadOrderFile,
  downloadOrderZip,
  fetchOrderFile,
  printBlob,
} from "../lib/printActions";
import { useAuth } from "../lib/AuthContext";
import { formatINR } from "../lib/currency";
import { api } from "../lib/api";
import type { Order, OrderFile, Shop } from "../types";

const istDateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function formatOrderDate(order: Order) {
  return `${istDateTime.format(order.createdAt.toDate())} IST`;
}

function makeChime(context: AudioContext) {
  const start = context.currentTime;
  [880, 1174].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.13;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.045, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.22);
  });
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [muted, setMuted] = useState(true);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [layoutOrder, setLayoutOrder] = useState<Order | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mutedRef = useRef(true);
  const initialQueueSnapshot = useRef(false);
  const lastOrderIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      return;
    }

    api.getShop()
      .then((currentShop) => {
        if (!active) return;
        setShop(currentShop);
        setLoading(false);
      })
      .catch((loadIssue: unknown) => {
        if (!active) return;
        setError(
          loadIssue instanceof Error
            ? loadIssue.message
            : "Unable to load the shop dashboard.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!shop) return;
    setQueueLoading(true);
    setQueueError(null);
    initialQueueSnapshot.current = false;
    let active = true;
    const refreshQueue = async () => {
      try {
        const nextOrders = await api.getOrders("active");
        if (!active) return;
        const nextIds = new Set(nextOrders.map((order) => order.id));
        if (initialQueueSnapshot.current && [...nextIds].some((id) => !lastOrderIds.current.has(id))) {
          if (!mutedRef.current && audioContext.current?.state === "running") makeChime(audioContext.current);
        }
        initialQueueSnapshot.current = true;
        lastOrderIds.current = nextIds;
        setOrders(nextOrders);
        setQueueError(null);
      } catch (snapshotError) {
        if (active) setQueueError(snapshotError instanceof Error ? snapshotError.message : "Unable to refresh the order queue.");
      } finally {
        if (active) setQueueLoading(false);
      }
    };
    void refreshQueue();
    const timer = window.setInterval(() => void refreshQueue(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [shop]);

  async function toggleChime() {
    setSoundError(null);
    if (!mutedRef.current) {
      mutedRef.current = true;
      setMuted(true);
      return;
    }

    try {
      if (!window.AudioContext) {
        throw new Error("Web Audio is not supported in this browser.");
      }
      if (!audioContext.current) {
        audioContext.current = new window.AudioContext();
      }
      await audioContext.current.resume();
      mutedRef.current = false;
      setMuted(false);
    } catch (soundIssue) {
      setSoundError(
        soundIssue instanceof Error
          ? soundIssue.message
          : "Unable to enable the order chime.",
      );
    }
  }

  async function handleSignOut() {
    try {
      await api.logout();
      await refresh();
      navigate("/", { replace: true });
    } catch (signOutIssue) {
      setError(
        signOutIssue instanceof Error ? signOutIssue.message : "Unable to sign out.",
      );
    }
  }

  function runAction(actionId: string, operation: () => Promise<void>) {
    setActionBusy(actionId);
    setActionMessage(null);
    setQueueError(null);
    void operation()
      .catch((actionIssue: unknown) => {
        setActionMessage(
          actionIssue instanceof Error
            ? actionIssue.message
            : "The requested order action failed.",
        );
      })
      .finally(() => setActionBusy(null));
  }

  function downloadFile(order: Order, file: OrderFile) {
    const actionId = `download:${order.id}:${file.storagePath}`;
    runAction(actionId, () => downloadOrderFile(file, order.id));
  }

  function printFile(order: Order, file: OrderFile) {
    const actionId = `print:${order.id}:${file.storagePath}`;
    runAction(actionId, async () => {
      const blob = await fetchOrderFile(file, order.id);
      await printBlob(blob, file.mimeType);
    });
  }

  function downloadZip(order: Order) {
    runAction(`zip:${order.id}`, () => downloadOrderZip(order));
  }

  function printOrder(order: Order) {
    runAction(`bulk-print:${order.id}`, async () => {
      const blob = await createOrderPdf(order);
      await printBlob(blob, "application/pdf");
    });
  }

  function requestPayment(order: Order) {
    const rawValue = amountDrafts[order.id] ?? String(order.finalAmount);
    const value = Number(rawValue);
    if (rawValue.trim() === "" || !Number.isFinite(value) || value < 0) {
      setActionMessage("Enter a valid non-negative final amount in ₹.");
      return;
    }
    runAction(`request-payment:${order.id}`, async () => {
      await api.updateOrder(order.id, "request-payment", value);
    });
  }

  function markPrinting(order: Order) {
    runAction(`printing:${order.id}`, async () => {
      await api.updateOrder(order.id, "printing");
    });
  }

  function confirmPaid(order: Order) {
    runAction(`complete:${order.id}`, async () => {
      await api.updateOrder(order.id, "confirm-paid");
    });
  }

  function deleteOrderFiles(order: Order) {
    if (
      order.filesPurged ||
      !window.confirm(`Permanently delete files for token #${order.tokenNumber}?`)
    ) {
      return;
    }

    runAction(`delete:${order.id}`, async () => api.purgeFiles(order.id).then(() => undefined));
  }

  if (loading) return <LoadingScreen />;
  if (error) return <FeedbackPage message={`Dashboard error: ${error}`} />;
  if (!shop) return <Navigate to="/settings" replace />;

  return (
    <main className="min-h-screen bg-[#f3f2ee] px-5 py-8 text-[#171717] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#c9c7c0] pb-5">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center bg-[#e6322b] text-white">
              <Store size={20} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-xs font-bold tracking-[0.2em] text-[#e6322b]">
                EZQRPRINT
              </span>
              <span className="block font-bold">{shop.shopName}</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleChime()}
              aria-pressed={!muted}
              className="inline-flex items-center gap-2 border border-[#aaa79f] px-3 py-2.5 text-sm font-bold transition hover:bg-black/5"
            >
              {muted ? (
                <VolumeX size={17} aria-hidden="true" />
              ) : (
                <Volume2 size={17} aria-hidden="true" />
              )}
              {muted ? "Unmute chime" : "Mute chime"}
            </button>
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 border border-[#171717] px-4 py-2.5 text-sm font-bold text-[#171717] transition hover:bg-black/5"
            >
              <SettingsIcon size={16} aria-hidden="true" /> Shop settings
            </Link>
            <Link
              to="/history"
              className="inline-flex items-center gap-2 border border-[#171717] px-4 py-2.5 text-sm font-bold text-[#171717] transition hover:bg-black/5"
            >
              <CalendarDays size={16} aria-hidden="true" /> Daily earnings
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-[#55534d] transition hover:bg-black/5 hover:text-[#e6322b]"
            >
              <LogOut size={16} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </button>
          </div>
        </header>

        {soundError && (
          <p role="alert" className="mb-4 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
            {soundError}
          </p>
        )}
        {actionMessage && (
          <p role="alert" className="mb-4 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
            {actionMessage}
          </p>
        )}

        <section className="mb-8 border-l-4 border-[#e6322b] bg-white p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e6322b]">
            Shop owner dashboard
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Live print queue
              </h1>
              <p className="mt-3 max-w-2xl text-[#55534d]">
                New customer orders appear here in arrival order. Print jobs, request
                payment, and keep each order identified by its token.
              </p>
            </div>
            <span className="border border-[#c9c7c0] px-4 py-2 text-sm font-bold">
              {orders.length} active {orders.length === 1 ? "order" : "orders"}
            </span>
          </div>
        </section>

        {queueError && (
          <p role="alert" className="mb-5 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
            Queue error: {queueError}
          </p>
        )}

        {queueLoading ? (
          <div className="mb-10 border border-[#c9c7c0] bg-white p-8 text-center text-sm font-semibold text-[#55534d]">
            Loading live queue…
          </div>
        ) : orders.length === 0 ? (
          <section className="mb-10 border border-[#c9c7c0] bg-white p-8 text-center">
            <Printer className="mx-auto text-[#e6322b]" size={28} aria-hidden="true" />
            <h2 className="mt-3 text-lg font-black">No active print orders</h2>
            <p className="mt-1 text-sm text-[#68665f]">
              New orders from your EZQRPRINT counter will appear here.
            </p>
          </section>
        ) : (
          <section className="mb-10 space-y-5" aria-label="Live print queue">
            {orders.map((order) => {
              const isBusy = actionBusy !== null;
              const hasImages = order.files.some(
                (file) => file.mimeType === "image/jpeg" || file.mimeType === "image/png",
              );
              const actionsDisabled = isBusy || order.filesPurged;

              return (
                <article
                  key={order.id}
                  className="border border-[#171717] bg-white"
                >
                  <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#c9c7c0] bg-[#faf9f6] px-4 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <p className="text-3xl font-black text-[#e6322b]">
                        #{order.tokenNumber}
                      </p>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#68665f]">
                          Arrived
                        </p>
                        <p className="text-sm font-semibold">{formatOrderDate(order)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="border border-[#c9c7c0] px-3 py-1.5 text-xs font-bold uppercase tracking-wide">
                        {order.status === "printing"
                          ? "Printing"
                          : order.status === "awaiting_payment"
                            ? "Awaiting Payment"
                            : "Pending"}
                      </span>
                      <span
                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                          order.paymentClaimed
                            ? "bg-[#eaf2ed] text-[#24543b]"
                            : "bg-[#f3f2ee] text-[#55534d]"
                        }`}
                      >
                        {order.paymentClaimed
                          ? "Payment Claimed"
                          : order.status === "awaiting_payment"
                            ? "Awaiting Payment"
                            : "Payment Not Claimed"}
                      </span>
                    </div>
                  </header>

                  <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="font-black">
                          {order.files.length} file{order.files.length === 1 ? "" : "s"} ·{" "}
                          {formatINR(order.totalAmount)}
                        </h2>
                        {order.filesPurged && (
                          <span className="text-xs font-bold uppercase tracking-wide text-[#8e211d]">
                            Files removed
                          </span>
                        )}
                      </div>
                      <div className="space-y-3">
                        {order.files.map((file, index) => (
                          <div
                            key={`${file.storagePath}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e0ded7] pt-3"
                          >
                            <div className="min-w-0">
                              <p className="break-all text-sm font-bold">
                                {file.mimeType === "application/pdf" ? (
                                  <FileText className="mr-1 inline-block" size={15} aria-hidden="true" />
                                ) : (
                                  <FileImage className="mr-1 inline-block" size={15} aria-hidden="true" />
                                )}
                                {file.fileName}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="bg-[#f3f2ee] px-2 py-1 text-[11px] font-bold uppercase">
                                  {file.colorMode === "bw" ? "B&W" : "Color"}
                                </span>
                                <span className="bg-[#f3f2ee] px-2 py-1 text-[11px] font-bold uppercase">
                                  {file.printSides === "double" ? "Double-sided" : "Single-sided"}
                                </span>
                                {file.printNote === "id-card" && (
                                  <span className="bg-[#f3f2ee] px-2 py-1 text-[11px] font-bold uppercase">
                                    ID Card Size
                                  </span>
                                )}
                                <span className="bg-[#f3f2ee] px-2 py-1 text-[11px] font-semibold">
                                  {file.pageCount} pg × {file.copies} · {formatINR(file.itemCost)}
                                </span>
                              </div>
                              {file.printSides === "double" && (
                                <p className="mt-1 text-xs text-[#68665f]">
                                  Enable duplex in the printer settings.
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                disabled={actionsDisabled}
                                onClick={() => downloadFile(order, file)}
                                className="inline-flex items-center gap-1 border border-[#aaa79f] px-3 py-2 text-xs font-bold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Download size={14} aria-hidden="true" />
                                {actionBusy === `download:${order.id}:${file.storagePath}`
                                  ? "Downloading…"
                                  : "Download"}
                              </button>
                              <button
                                type="button"
                                disabled={actionsDisabled}
                                onClick={() => printFile(order, file)}
                                className="inline-flex items-center gap-1 border border-[#171717] px-3 py-2 text-xs font-bold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Printer size={14} aria-hidden="true" />
                                Print
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2 border-t border-[#c9c7c0] pt-4">
                        <button
                          type="button"
                          disabled={actionsDisabled}
                          onClick={() => downloadZip(order)}
                          className="inline-flex items-center gap-2 border border-[#171717] px-3 py-2.5 text-xs font-bold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Archive size={15} aria-hidden="true" />
                          {actionBusy === `zip:${order.id}` ? "Building ZIP…" : "Download All (.zip)"}
                        </button>
                        <button
                          type="button"
                          disabled={actionsDisabled}
                          onClick={() => printOrder(order)}
                          className="inline-flex items-center gap-2 border border-[#171717] px-3 py-2.5 text-xs font-bold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Printer size={15} aria-hidden="true" />
                          {actionBusy === `bulk-print:${order.id}` ? "Preparing PDF…" : "Bulk Print Order"}
                        </button>
                        {hasImages && !order.filesPurged && (
                          <button
                            type="button"
                            onClick={() => setLayoutOrder(order)}
                            className="inline-flex items-center gap-2 bg-[#e6322b] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#c92722]"
                          >
                            <FileImage size={15} aria-hidden="true" />
                            Layout & Print
                          </button>
                        )}
                      </div>
                    </div>

                    <aside className="space-y-3 border-t border-[#c9c7c0] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#68665f]">
                        Final amount · ₹
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={amountDrafts[order.id] ?? String(order.finalAmount)}
                          onChange={(event) =>
                            setAmountDrafts((current) => ({
                              ...current,
                              [order.id]: event.target.value,
                            }))
                          }
                          disabled={order.status === "completed"}
                          className="mt-1 w-full border border-[#aaa79f] px-3 py-2.5 text-base font-bold text-[#171717] disabled:bg-[#f3f2ee]"
                        />
                      </label>
                      <p className="text-xs text-[#68665f]">
                        Order total: {formatINR(order.totalAmount)}
                      </p>
                      <button
                        type="button"
                        disabled={isBusy || order.status !== "pending"}
                        onClick={() => markPrinting(order)}
                        className="w-full border border-[#171717] px-3 py-2.5 text-sm font-bold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {actionBusy === `printing:${order.id}`
                          ? "Updating…"
                          : order.status === "printing"
                            ? "Printing"
                            : "Mark Printing"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || order.status === "completed"}
                        onClick={() => requestPayment(order)}
                        className="w-full bg-[#16834a] px-3 py-2.5 text-sm font-bold text-white hover:bg-[#116b3c] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {actionBusy === `request-payment:${order.id}`
                          ? "Updating…"
                          : "Request Payment"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => confirmPaid(order)}
                        className="w-full border border-[#171717] px-3 py-2.5 text-sm font-bold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {actionBusy === `complete:${order.id}`
                          ? "Completing…"
                          : "Confirm Paid & Complete"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || order.filesPurged}
                        onClick={() => deleteOrderFiles(order)}
                        className="w-full border border-[#c9c7c0] px-3 py-2.5 text-sm font-bold text-[#8e211d] hover:bg-[#f9e9e7] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {actionBusy === `delete:${order.id}`
                          ? "Deleting files…"
                          : order.filesPurged
                            ? "Files Deleted"
                            : "Delete Files Now"}
                      </button>
                    </aside>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <QrStandeeGenerator shopName={shop.shopName} slug={shop.slug} />
      </div>

      {layoutOrder && (
        <PrintLayoutModal
          key={layoutOrder.id}
          order={layoutOrder}
          onClose={() => setLayoutOrder(null)}
        />
      )}
    </main>
  );
}
