import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, CircleDollarSign, FileCheck2, Files } from "lucide-react";
import { Link } from "react-router-dom";
import { LoadingScreen } from "../components/StatusScreen";
import { useAuth } from "../lib/AuthContext";
import { formatINR } from "../lib/currency";
import {
  countPrintedPages,
  getIstDateKey,
  getIstDayRange,
  getPageBreakdown,
  shiftDateKey,
  summarizeEarnings,
} from "../lib/earnings";
import { api } from "../lib/api";
import type { Order, Shop } from "../types";

type DateSelection = "today" | "yesterday" | "custom";

const istDateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "full",
  timeZone: "Asia/Kolkata",
});
const istTimestampFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default function History() {
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [dateSelection, setDateSelection] = useState<DateSelection>("today");
  const [customDate, setCustomDate] = useState(() => getIstDateKey(new Date()));
  const [todayKey, setTodayKey] = useState(() => getIstDateKey(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTodayKey(getIstDateKey(new Date()));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedDateKey =
    dateSelection === "today"
      ? todayKey
      : dateSelection === "yesterday"
        ? shiftDateKey(todayKey, -1)
        : customDate;

  useEffect(() => {
    let active = true;
    if (!user) {
      setShopLoading(false);
      setShopError("Sign in to view the earnings history.");
      return;
    }

    setShopLoading(true);
    setShopError(null);
    api.getShop()
      .then((currentShop) => {
        if (!active) return;
        if (!currentShop) {
          setShop(null);
          setShopError("Set up your shop before viewing its earnings history.");
        } else {
          setShop(currentShop);
        }
        setShopLoading(false);
      })
      .catch((loadIssue: unknown) => {
        if (!active) return;
        setShopError(
          loadIssue instanceof Error
            ? loadIssue.message
            : "Unable to load the shop earnings history.",
        );
        setShopLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!shop || !selectedDateKey) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }

    let range: ReturnType<typeof getIstDayRange>;
    try {
      range = getIstDayRange(selectedDateKey);
    } catch (rangeIssue) {
      setQueryError(
        rangeIssue instanceof Error
          ? rangeIssue.message
          : "Choose a valid date for the earnings history.",
      );
      setOrders([]);
      setOrdersLoading(false);
      return;
    }

    setOrdersLoading(true);
    setQueryError(null);
    setOrders([]);
    let active = true;
    api.getOrders("completed", range)
      .then((nextOrders) => {
        if (active) setOrders(nextOrders);
      })
      .catch((snapshotError: unknown) => {
        if (active) setQueryError(snapshotError instanceof Error ? snapshotError.message : "Unable to load completed orders.");
      })
      .finally(() => { if (active) setOrdersLoading(false); });
    return () => { active = false; };
  }, [shop, selectedDateKey]);

  const summary = useMemo(() => summarizeEarnings(orders), [orders]);

  if (shopLoading) return <LoadingScreen />;

  const selectedDate = selectedDateKey
    ? new Date(`${selectedDateKey}T00:00:00+05:30`)
    : null;

  return (
    <main className="min-h-screen bg-[#f3f2ee] px-5 py-8 text-[#171717] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#c9c7c0] pb-5">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#55534d] transition hover:text-[#e6322b]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Live print queue
          </Link>
          <span className="text-xs font-black uppercase tracking-[0.2em] text-[#e6322b]">
            EZQRPRINT
          </span>
        </header>

        <section className="mb-7 border-l-4 border-[#e6322b] bg-white p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e6322b]">
            {shop?.shopName ?? "Shop owner"}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Daily earnings history
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#55534d]">
            Completed orders are retained here after their uploaded files are removed.
            Earnings use each order&apos;s final amount.
          </p>
        </section>

        {shopError && (
          <p role="alert" className="mb-5 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
            {shopError}
          </p>
        )}
        {queryError && (
          <p role="alert" className="mb-5 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
            Earnings history error: {queryError}
          </p>
        )}

        <section className="mb-6 flex flex-wrap items-end justify-between gap-4 border border-[#c9c7c0] bg-white p-4 sm:p-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#68665f]">
              Order date
            </p>
            <div className="flex flex-wrap gap-2">
              {(["today", "yesterday"] as const).map((selection) => (
                <button
                  key={selection}
                  type="button"
                  aria-pressed={dateSelection === selection}
                  onClick={() => setDateSelection(selection)}
                  className={`px-4 py-2 text-sm font-bold capitalize ${
                    dateSelection === selection
                      ? "bg-[#171717] text-white"
                      : "border border-[#aaa79f] hover:bg-black/5"
                  }`}
                >
                  {selection}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={dateSelection === "custom"}
                onClick={() => setDateSelection("custom")}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold ${
                  dateSelection === "custom"
                    ? "bg-[#171717] text-white"
                    : "border border-[#aaa79f] hover:bg-black/5"
                }`}
              >
                <CalendarDays size={15} aria-hidden="true" />
                Custom date
              </button>
            </div>
          </div>
          {dateSelection === "custom" && (
            <label className="block text-xs font-bold uppercase tracking-wider text-[#68665f]">
              Select date (IST)
              <input
                type="date"
                value={customDate}
                max={todayKey}
                onChange={(event) => setCustomDate(event.target.value)}
                className="mt-1 block border border-[#aaa79f] bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#171717]"
              />
            </label>
          )}
          {selectedDate && (
            <p className="w-full text-sm font-semibold text-[#55534d]">
              {istDateFormatter.format(selectedDate)} · India Standard Time
            </p>
          )}
        </section>

        <section className="mb-7 grid gap-4 md:grid-cols-3" aria-label="Daily earnings summary">
          <SummaryCard
            icon={<FileCheck2 size={19} aria-hidden="true" />}
            label="Total orders completed"
            value={summary.orders.toLocaleString("en-IN")}
          />
          <SummaryCard
            icon={<Files size={19} aria-hidden="true" />}
            label="Total pages printed"
            value={summary.pages.toLocaleString("en-IN")}
          />
          <SummaryCard
            icon={<CircleDollarSign size={19} aria-hidden="true" />}
            label="Total earnings"
            value={formatINR(summary.earnings)}
          />
        </section>

        <section className="border border-[#171717] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c9c7c0] bg-[#faf9f6] px-4 py-4 sm:px-6">
            <h2 className="font-black">Completed orders</h2>
            <span className="text-xs font-semibold text-[#68665f]">
              Amounts shown in ₹ INR
            </span>
          </div>
          {ordersLoading ? (
            <div className="p-8 text-center text-sm font-semibold text-[#55534d]">
              Loading completed orders…
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-bold">No completed orders for this date.</p>
              <p className="mt-1 text-sm text-[#68665f]">
                Try Today, Yesterday, or choose another date.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#c9c7c0] text-xs uppercase tracking-wide text-[#68665f]">
                    <th scope="col" className="px-4 py-3 sm:px-6">Token</th>
                    <th scope="col" className="px-4 py-3">Order time (IST)</th>
                    <th scope="col" className="px-4 py-3">Pages</th>
                    <th scope="col" className="px-4 py-3">B&W / Color</th>
                    <th scope="col" className="px-4 py-3">Earnings</th>
                    <th scope="col" className="px-4 py-3 sm:px-6">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const breakdown = getPageBreakdown(order.files);
                    return (
                      <tr
                        key={order.id}
                        className="border-b border-[#e4e2dc] last:border-0"
                      >
                        <th scope="row" className="whitespace-nowrap px-4 py-4 text-lg font-black text-[#e6322b] sm:px-6">
                          #{order.tokenNumber}
                        </th>
                        <td className="whitespace-nowrap px-4 py-4">
                          {istTimestampFormatter.format(order.createdAt.toDate())} IST
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          {countPrintedPages(order.files).toLocaleString("en-IN")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          {breakdown.bw.toLocaleString("en-IN")} B&W ·{" "}
                          {breakdown.color.toLocaleString("en-IN")} Color
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-bold">
                          {formatINR(order.finalAmount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 sm:px-6">
                          <span
                            className={`inline-flex px-2.5 py-1 text-xs font-bold ${
                              order.filesPurged
                                ? "bg-[#f3f2ee] text-[#68665f]"
                                : "bg-[#eaf2ed] text-[#24543b]"
                            }`}
                            title={
                              order.filesPurged
                                ? "The file copies were deleted; the order summary remains."
                                : "The uploaded files are still available."
                            }
                          >
                            {order.filesPurged ? "Files purged" : "Files available"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="border border-[#c9c7c0] bg-white p-5">
      <div className="flex items-center gap-2 text-[#e6322b]">
        {icon}
        <h2 className="text-xs font-bold uppercase tracking-wider text-[#68665f]">
          {label}
        </h2>
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight">{value}</p>
    </article>
  );
}
