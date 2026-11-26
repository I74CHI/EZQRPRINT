import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { getShopPortalUrl } from "../lib/shopUrl";

interface QrStandeeGeneratorProps {
  shopName: string;
  slug: string;
}

type PaperSize = "a4" | "a5";

export function QrStandeeGenerator({ shopName, slug }: QrStandeeGeneratorProps) {
  const standeeRef = useRef<HTMLDivElement>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shopUrl = getShopPortalUrl(
    origin,
    import.meta.env.BASE_URL,
    slug,
  );

  async function downloadStandee() {
    const standee = standeeRef.current;
    if (!standee) {
      setError("The standee preview is not ready to download.");
      return;
    }

    setDownloading(true);
    setError(null);
    try {
      const imageUrl = await toPng(standee, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        pixelRatio: 2,
      });
      const downloadLink = document.createElement("a");
      downloadLink.href = imageUrl;
      downloadLink.download = `EZQRPRINT-${slug}-standee-${paperSize.toUpperCase()}.png`;
      downloadLink.click();
    } catch (downloadIssue) {
      setError(
        downloadIssue instanceof Error
          ? downloadIssue.message
          : "Unable to create the standee image.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="space-y-5 text-[#171717]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Permanent counter QR standee</h2>
          <p className="mt-1 text-sm text-[#68665f]">
            Print or download this branded poster for your counter.
          </p>
        </div>
        <div className="flex items-center gap-2" aria-label="Poster paper size">
          {(["a4", "a5"] as const).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setPaperSize(size)}
              aria-pressed={paperSize === size}
              className={`px-3 py-2 text-sm font-bold uppercase transition ${
                paperSize === size
                  ? "bg-[#e6322b] text-white"
                  : "border border-[#aaa79f] text-[#55534d] hover:bg-black/5"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
          {error}
        </p>
      )}

      <div
        ref={standeeRef}
        className={`standee-print-root mx-auto w-full ${
          paperSize === "a4" ? "max-w-[794px]" : "max-w-[560px]"
        }`}
        data-paper-size={paperSize}
      >
        <article
          className={`standee-card relative mx-auto flex w-full flex-col items-center overflow-hidden border border-[#171717] bg-white text-[#171717] ${
            paperSize === "a4"
              ? "min-h-[1120px] max-w-[794px] p-10 sm:p-14"
              : "min-h-[794px] max-w-[560px] p-7 sm:p-9"
          }`}
          data-paper-size={paperSize}
        >
          <div className="absolute inset-x-0 top-0 h-3 bg-[#e6322b]" />
          <div className="mt-4 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center bg-[#e6322b] text-white">
              <Printer size={25} aria-hidden="true" />
            </span>
            <span className="text-xl font-black tracking-tight">EZQRPRINT</span>
          </div>
          <p className="mt-4 text-center text-sm font-bold uppercase tracking-[0.2em] text-[#e6322b]">
            Contactless print queue
          </p>
          <h3 className="mt-3 max-w-full break-words text-center text-3xl font-black sm:text-4xl">
            {shopName}
          </h3>
          <p className="mt-2 text-center text-[#55534d]">
            Scan here to send your print job
          </p>

          <div className="standee-qr-frame my-7 border-2 border-[#171717] bg-white p-4">
            <QRCodeSVG
              value={shopUrl}
              size={paperSize === "a4" ? 240 : 190}
              level="H"
              includeMargin
              title={`EZQRPRINT QR code for ${shopName}`}
            />
          </div>
          <p className="standee-url mb-8 max-w-full break-all text-center text-xs text-[#68665f]">
            {shopUrl}
          </p>

          <div className="standee-steps w-full space-y-3">
            <StandeeStep
              number="1"
              title="Scan QR"
              description="Open the shop print queue on your phone."
            />
            <StandeeStep
              number="2"
              title="Upload & Choose B&W/Color"
              description="Select your files, print mode, and copies."
            />
            <StandeeStep
              number="3"
              title="Show Token & Pay via UPI"
              description="Show your token at the counter to collect your print."
            />
          </div>

          <div className="standee-footer mt-auto w-full pt-8 text-center">
            <p className="text-sm font-black tracking-[0.2em] text-[#171717]">
              SCAN. UPLOAD. PRINT.
            </p>
            <p className="mt-2 text-xs text-[#68665f]">
              Powered by EZQRPRINT · Prices in ₹ INR
            </p>
          </div>
        </article>
      </div>

      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 border border-[#171717] px-5 py-3 font-bold text-[#171717] transition hover:bg-black/5"
        >
          <Printer size={18} aria-hidden="true" /> Print Standee
        </button>
        <button
          type="button"
          onClick={downloadStandee}
          disabled={downloading}
          className="inline-flex items-center justify-center gap-2 bg-[#e6322b] px-5 py-3 font-bold text-white transition hover:bg-[#c92722] disabled:cursor-wait disabled:opacity-60"
        >
          <Download size={18} aria-hidden="true" />
          {downloading ? "Preparing PNG…" : "Download Standee (PNG)"}
        </button>
      </div>
    </section>
  );
}

function StandeeStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-[#c9c7c0] bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#e6322b] text-sm font-black text-white">
        {number}
      </span>
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-sm text-[#55534d]">{description}</p>
      </div>
    </div>
  );
}
