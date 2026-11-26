import { ArrowRight, Check, Printer, QrCode, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    number: "01",
    title: "Scan",
    description: "Customers scan the shop's permanent counter QR code.",
    icon: QrCode,
  },
  {
    number: "02",
    title: "Upload",
    description: "They choose their files, print options, and copies.",
    icon: Zap,
  },
  {
    number: "03",
    title: "Print",
    description: "The shop prints by token and takes payment at the counter.",
    icon: Printer,
  },
];

export default function Landing() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f3f2ee] text-[#171717]">
      <header className="relative mx-auto flex max-w-7xl items-center justify-between border-b border-[#c9c7c0] px-6 py-5 lg:px-10">
        <Link to="/" className="flex items-center gap-3" aria-label="EZQRPRINT home">
          <span className="flex h-10 w-10 items-center justify-center bg-[#e6322b] text-white">
            <Printer size={21} aria-hidden="true" />
          </span>
          <span className="text-lg font-black tracking-tight">EZQRPRINT</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-bold text-[#171717] transition hover:bg-black/5"
          >
            Shop Owner Login
          </Link>
          <Link
            to="/register"
            className="hidden bg-[#e6322b] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#c92722] sm:inline-flex"
          >
            Register
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
        <div className="border-l-4 border-[#e6322b] pl-6 sm:pl-9">
          <div className="mb-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#e6322b]">
            Made for local print shops
          </div>
          <h1 className="max-w-3xl text-6xl font-black leading-[0.98] tracking-[-0.06em] sm:text-7xl lg:text-8xl">
            Scan.
            <br />
            Upload.
            <br />
            <span className="text-[#e6322b]">Print.</span>
          </h1>
          <p className="mt-7 max-w-xl text-xl font-bold leading-relaxed text-[#171717] sm:text-2xl">
            100% Free Contactless Print Queue for Print Shops
          </p>
          <p className="mt-4 max-w-xl leading-7 text-[#55534d]">
            Give customers a simple way to send print jobs from their own
            devices. Organize every job by token and keep the counter moving.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 bg-[#e6322b] px-6 py-3.5 font-bold text-white transition hover:bg-[#c92722]"
            >
              Shop Owner Login <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center border border-[#171717] px-6 py-3.5 font-bold text-[#171717] transition hover:bg-black/5"
            >
              Shop Owner Register
            </Link>
          </div>
          <p className="mt-5 text-sm text-[#68665f]">Print shop pricing in ₹ INR.</p>
        </div>

        <div className="relative mx-auto w-full max-w-lg">
          <div className="relative border border-[#171717] bg-white p-6 sm:p-8">
            <div className="mb-6 flex items-end justify-between border-b border-[#c9c7c0] pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#68665f]">Counter queue</p>
                <p className="mt-2 text-xl font-black">Today’s print jobs</p>
              </div>
              <span className="border border-[#e6322b] px-2 py-1 text-xs font-bold uppercase tracking-wider text-[#e6322b]">
                Ready
              </span>
            </div>
            <div>
              {[101, 102, 103].map((token, index) => (
                <div
                  key={token}
                  className="flex items-center justify-between border-b border-[#dedcd5] py-4"
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-11 w-11 items-center justify-center bg-[#e6322b] text-sm font-black text-white">
                      #{token}
                    </span>
                    <div>
                      <p className="font-bold">Print order</p>
                      <p className="mt-1 text-sm text-[#68665f]">
                        {index + 1} file{index === 0 ? "" : "s"} · B&W / Color
                      </p>
                    </div>
                  </div>
                  <Check className="text-[#e6322b]" size={20} aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3 border-l-2 border-[#e6322b] py-2 pl-4 text-sm text-[#55534d]">
              <ShieldCheck className="shrink-0 text-[#e6322b]" size={20} aria-hidden="true" />
              <span>Files are handled securely for the print queue.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#c9c7c0] bg-[#ebe9e2] px-6 py-16 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e6322b]">
              A smoother counter
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              A simple flow from phone to printer.
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {steps.map(({ number, title, description, icon: Icon }) => (
              <article
                key={number}
                className="border-t-2 border-[#171717] bg-transparent py-6"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold tracking-widest text-[#e6322b]">
                    {number}
                  </span>
                  <Icon size={22} className="text-[#e6322b]" aria-hidden="true" />
                </div>
                <h3 className="mt-6 text-xl font-bold">{title}</h3>
                <p className="mt-2 leading-6 text-[#55534d]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <footer className="border-t border-[#c9c7c0] px-6 py-7 text-center text-sm text-[#68665f]">
        EZQRPRINT · Contactless printing for local shops
      </footer>
    </main>
  );
}
