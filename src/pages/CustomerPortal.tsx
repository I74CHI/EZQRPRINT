import { useEffect, useMemo, useState } from "react";
import { Printer, Store } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { CustomerOrderStatus } from "../components/CustomerOrderStatus";
import { PrintFileUploader } from "../components/PrintFileUploader";
import { LoadingScreen } from "../components/StatusScreen";
import { api } from "../lib/api";
import type { OrderFile, PublicShop } from "../types";

const ACTIVE_ORDER_KEY = "ezqrprint:active-order";

export default function CustomerPortal() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const slug = routeSlug?.toLowerCase() ?? "";
  const navigate = useNavigate();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState(() => crypto.randomUUID());
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSessionWarning(null);
    setShop(null);
    setActiveOrderId(null);
    setOrderId(crypto.randomUUID());

    if (!slug) {
      setError("This EZQRPRINT shop URL is not valid.");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    api.getPublicShop(slug)
      .then((data) => {
        if (!active) return;
        if (
          data.slug !== slug ||
          typeof data.id !== "string" ||
          typeof data.shopName !== "string" ||
          !data.rates
        ) {
          throw new Error("The shop settings are incomplete.");
        }
        setShop(data);

        try {
          const storedSession = localStorage.getItem(ACTIVE_ORDER_KEY);
          if (storedSession) {
            const parsed: unknown = JSON.parse(storedSession);
            if (
              typeof parsed === "object" &&
              parsed !== null &&
              "orderId" in parsed &&
              "shopSlug" in parsed &&
              typeof parsed.orderId === "string" &&
              parsed.shopSlug === slug
            ) {
              setActiveOrderId(parsed.orderId);
            }
          }
        } catch (storageIssue) {
          setError(
            storageIssue instanceof Error
              ? storageIssue.message
              : "Unable to restore the active order.",
          );
        }
        setLoading(false);
      })
      .catch((loadIssue: unknown) => {
        if (!active) return;
        setError(
          loadIssue instanceof Error
            ? loadIssue.message
            : "Unable to load this EZQRPRINT shop.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const uploaderShop = useMemo(
    () => (shop ? { id: shop.id, rates: shop.rates } : null),
    [shop],
  );

  async function submitNewOrder(files: OrderFile[]) {
    if (!shop) throw new Error("Shop details are not loaded.");
    setError(null);
    setSessionWarning(null);

    await api.createOrder({
      id: orderId,
      shopId: shop.id,
      files,
    });

    setActiveOrderId(orderId);
    try {
      localStorage.setItem(
        ACTIVE_ORDER_KEY,
        JSON.stringify({ orderId, shopSlug: slug }),
      );
    } catch (storageIssue) {
      setError(
        storageIssue instanceof Error
          ? `Order created, but this browser could not save the active session: ${storageIssue.message}`
          : "Order created, but this browser could not save the active session.",
      );
    }
  }

  function startNewOrder() {
    try {
      localStorage.removeItem(ACTIVE_ORDER_KEY);
    } catch (storageIssue) {
      setError(
        storageIssue instanceof Error
          ? storageIssue.message
          : "Unable to clear the saved order session.",
      );
      return;
    }

    setActiveOrderId(null);
    setOrderId(crypto.randomUUID());
    setError(null);
    navigate(`/s/${slug}`, { replace: true });
  }

  if (loading) return <LoadingScreen />;

  if (error && !shop) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f2ee] px-5 text-[#171717]">
        <section className="w-full max-w-lg border-l-4 border-[#e6322b] bg-white p-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e6322b]">
            EZQRPRINT
          </p>
          <h1 className="mt-3 text-2xl font-black">Shop unavailable</h1>
          <p role="alert" className="mt-3 text-[#55534d]">{error}</p>
        </section>
      </main>
    );
  }

  if (!shop || !uploaderShop) return <LoadingScreen />;

  if (activeOrderId) {
    return (
      <CustomerOrderStatus
        shop={shop}
        orderId={activeOrderId}
        sessionWarning={sessionWarning}
        onStartNewOrder={startNewOrder}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f2ee] px-4 py-6 text-[#171717] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-7 flex items-center gap-3 border-b border-[#c9c7c0] pb-5">
          <span className="flex h-10 w-10 items-center justify-center bg-[#e6322b] text-white">
            <Printer size={21} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e6322b]">
              EZQRPRINT
            </p>
            <h1 className="truncate text-lg font-bold">{shop.shopName}</h1>
          </div>
          <Store className="ml-auto shrink-0 text-[#68665f]" size={20} aria-hidden="true" />
        </header>

        {error && (
          <p role="alert" className="mb-5 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
            {error}
          </p>
        )}

        <section className="mb-6 border-l-4 border-[#e6322b] bg-white p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e6322b]">
            Contactless print order
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">Upload your files</h2>
          <p className="mt-2 text-sm leading-6 text-[#55534d]">
            Choose print options for each file. Your order is tracked by a token number.
          </p>
        </section>

        <PrintFileUploader
          shop={uploaderShop}
          orderId={orderId}
          submitLabel="Upload & Get Token"
          onUploaded={submitNewOrder}
        />
      </div>
    </main>
  );
}
