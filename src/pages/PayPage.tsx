import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { buildUpiPaymentUrl } from "../lib/upi";

const upiId = (import.meta.env.VITE_UPI_ID ?? "").trim();
const payeeName = (import.meta.env.VITE_UPI_PAYEE_NAME ?? "").trim();
const paymentUrl = upiId && payeeName ? buildUpiPaymentUrl(upiId, payeeName) : "";

export default function PayPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f2ee] px-5 py-10 text-[#171717]">
      <section className="w-full max-w-md border border-[#171717] bg-white p-7 shadow-[8px_8px_0_#e6322b] sm:p-10">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center bg-[#e6322b] text-lg font-black text-white" aria-hidden="true">
            E
          </span>
          <div>
            <p className="text-lg font-black tracking-tight">EZQRPRINT</p>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#68665f]">Quick UPI payment</p>
          </div>
        </header>

        <div className="mt-10 border-t border-[#dedcd5] pt-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e6322b]">Simple. Direct. UPI.</p>
          <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.05em]">Pay with UPI</h1>
          <p className="mx-auto mt-4 max-w-sm leading-6 text-[#55534d]">
            Tap the button below to open a UPI app installed on your phone. Check the payee and amount in the app before you pay.
          </p>

          {paymentUrl ? (
            <>
              <div className="mt-8 border border-[#dedcd5] bg-[#fdfcf9] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#68665f]">Paying</p>
                <p className="mt-1 text-xl font-black">{payeeName}</p>
                <p className="mt-1 break-all text-sm text-[#68665f]">{upiId}</p>
              </div>
              <a
                href={paymentUrl}
                className="mt-5 flex w-full items-center justify-center gap-2 bg-[#e6322b] px-5 py-4 text-base font-black text-white transition hover:bg-[#c92722] focus:outline-none focus:ring-4 focus:ring-[#e6322b]/25"
              >
                Pay via UPI <ArrowUpRight size={20} aria-hidden="true" />
              </a>
              <p className="mt-4 text-sm text-[#68665f]">Your UPI app will ask you to enter or confirm the amount.</p>
            </>
          ) : (
            <div role="status" className="mt-8 border border-[#e7c47c] bg-[#fff8e8] p-4 text-left text-sm leading-6 text-[#6a4d13]">
              This payment button needs the shop’s UPI ID and payee name configured in Cloudflare Pages.
            </div>
          )}
        </div>

        <footer className="mt-8 flex gap-3 border-t border-[#dedcd5] pt-5 text-xs leading-5 text-[#68665f]">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#28734a]" aria-hidden="true" />
          <p>EZQRPRINT only opens your UPI app. It does not collect money or confirm whether a payment succeeded.</p>
        </footer>
      </section>
    </main>
  );
}
