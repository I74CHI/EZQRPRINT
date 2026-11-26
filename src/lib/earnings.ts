import type { OrderFile } from "../types";

type PageCountFile = Pick<OrderFile, "pageCount" | "copies" | "colorMode">;
interface EarningsOrder {
  files: readonly PageCountFile[];
  finalAmount: number;
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const istDateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

function parseDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (
    !dateKeyPattern.test(dateKey) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== dateKey
  ) {
    throw new RangeError("Choose a valid date for the earnings history.");
  }
  return date;
}

export const getIstDateKey = (date: Date) => istDateFmt.format(date);

export function shiftDateKey(dateKey: string, days: number) {
  if (!Number.isInteger(days)) throw new RangeError("Date changes must be whole days.");
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getIstDayRange(dateKey: string) {
  parseDateKey(dateKey);
  const start = new Date(`${dateKey}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 86400000) };
}

export const countPrintedPages = (files: readonly PageCountFile[]) =>
  files.reduce((total, f) => total + f.pageCount * f.copies, 0);

export function getPageBreakdown(files: readonly PageCountFile[]) {
  return files.reduce(
    (acc, f) => {
      acc[f.colorMode] += f.pageCount * f.copies;
      return acc;
    },
    { bw: 0, color: 0 },
  );
}

export function summarizeEarnings(orders: readonly EarningsOrder[]) {
  return orders.reduce(
    (tot, o) => ({
      orders: tot.orders + 1,
      pages: tot.pages + countPrintedPages(o.files),
      earnings: tot.earnings + o.finalAmount,
    }),
    { orders: 0, pages: 0, earnings: 0 },
  );
}
