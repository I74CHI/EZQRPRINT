import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, LogOut, Save, Store, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingScreen } from "../components/StatusScreen";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import type { Shop } from "../types";

export default function Settings() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [slug, setSlug] = useState("");
  const [bwRate, setBwRate] = useState("2");
  const [colorRate, setColorRate] = useState("10");
  const [bwDoubleSidedRate, setBwDoubleSidedRate] = useState("2");
  const [colorDoubleSidedRate, setColorDoubleSidedRate] = useState("10");
  const [upiId, setUpiId] = useState("");
  const [upiPayeeName, setUpiPayeeName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) return;

    api.getShop()
      .then((currentShop) => {
        if (!active) return;
        if (currentShop) {
          setShop(currentShop);
          setShopName(currentShop.shopName);
          setSlug(currentShop.slug);
          setBwRate(String(currentShop.rates.bwPerPage));
          setColorRate(String(currentShop.rates.colorPerPage));
          setBwDoubleSidedRate(String(currentShop.rates.bwDoubleSidedPerPage));
          setColorDoubleSidedRate(String(currentShop.rates.colorDoubleSidedPerPage));
          setUpiId(currentShop.upiId ?? "");
          setUpiPayeeName(currentShop.upiPayeeName ?? "");
        } else {
          setSlug(
            (user.email.split("@")[0] ?? "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, ""),
          );
        }
        setLoading(false);
      })
      .catch((loadIssue: unknown) => {
        if (!active) return;
        setError(
          loadIssue instanceof Error
            ? loadIssue.message
            : "Unable to load shop settings.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (loading) return <LoadingScreen />;

  const slugChanged = Boolean(shop && slug !== shop.slug);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setError(null);
    setNotice(null);

    const trimmedShopName = shopName.trim();
    const trimmedSlug = slug.trim();
    const numericBwRate = Number(bwRate);
    const numericColorRate = Number(colorRate);
    const numericBwDoubleSidedRate = Number(bwDoubleSidedRate);
    const numericColorDoubleSidedRate = Number(colorDoubleSidedRate);
    const trimmedUpiId = upiId.trim();
    const trimmedPayeeName = upiPayeeName.trim();

    if (!trimmedShopName) {
      setError("Enter your shop name.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
      setError("Use lowercase letters, numbers, and single hyphens for the shop URL.");
      return;
    }
    if (
      !Number.isFinite(numericBwRate) ||
      numericBwRate < 0 ||
      !Number.isFinite(numericColorRate) ||
      numericColorRate < 0 ||
      !Number.isFinite(numericBwDoubleSidedRate) ||
      numericBwDoubleSidedRate < 0 ||
      !Number.isFinite(numericColorDoubleSidedRate) ||
      numericColorDoubleSidedRate < 0
    ) {
      setError("Enter valid non-negative per-page rates.");
      return;
    }
    if (Boolean(trimmedUpiId) !== Boolean(trimmedPayeeName)) {
      setError("Enter both UPI ID and payee name, or leave both blank.");
      return;
    }

    setSaving(true);
    try {
      const savedShop = await api.saveShop({
        shopName: trimmedShopName,
        slug: trimmedSlug,
        upiId: trimmedUpiId,
        upiPayeeName: trimmedPayeeName,
        rates: {
          bwPerPage: numericBwRate,
          colorPerPage: numericColorRate,
          bwDoubleSidedPerPage: numericBwDoubleSidedRate,
          colorDoubleSidedPerPage: numericColorDoubleSidedRate,
        },
      });
      setShop(savedShop);
      setNotice("Shop settings saved.");
    } catch (saveIssue) {
      setError(
        saveIssue instanceof Error ? saveIssue.message : "Unable to save shop settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      await api.logout();
      navigate("/", { replace: true });
    } catch (signOutIssue) {
      setError(
        signOutIssue instanceof Error
          ? signOutIssue.message
          : "Unable to sign out.",
      );
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(null);
    if (deleteConfirmation !== "DELETE") {
      setDeleteError('Type "DELETE" exactly to confirm permanent account deletion.');
      return;
    }
    if (!deletePassword) {
      setDeleteError("Enter your current password to continue.");
      return;
    }

    setDeletingAccount(true);
    try {
      await api.deleteAccount(deletePassword);
      try { await refresh(); } catch { /* The account is already deleted; the session cookie was cleared. */ }
      navigate("/", { replace: true });
    } catch (deleteIssue) {
      setDeleteError(
        deleteIssue instanceof Error ? deleteIssue.message : "Unable to delete this account.",
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f2ee] px-5 py-8 text-[#171717] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between border-b border-[#c9c7c0] pb-5">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#55534d] transition hover:text-[#e6322b]"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Dashboard
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-bold text-[#55534d] hover:bg-black/5 hover:text-[#e6322b]"
          >
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </header>

        <section className="border border-[#171717] bg-white p-6 sm:p-9">
          <div className="mb-8 flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#e6322b] text-white">
              <Store size={23} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e6322b]">
                EZQRPRINT
              </p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Shop settings</h1>
              <p className="mt-2 text-sm leading-6 text-[#55534d]">
                Set your permanent counter URL, print rates, and optional UPI payment details.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mb-5 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mb-5 border-l-4 border-[#37805b] bg-[#eaf2ed] p-3 text-sm text-[#24543b]">
              {notice}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-[#171717] sm:col-span-2">
                Shop name
                <input
                  value={shopName}
                  onChange={(event) => setShopName(event.target.value)}
                  required
                  maxLength={80}
                  className="mt-2 w-full border border-[#aaa79f] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#e6322b]"
                  placeholder="Sharma Prints"
                />
              </label>
              <label className="block text-sm font-semibold text-[#171717] sm:col-span-2">
                Permanent shop URL slug
                <span className="mt-2 flex overflow-hidden border border-[#aaa79f] bg-white focus-within:border-[#e6322b]">
                  <span className="flex items-center border-r border-[#d5d2ca] px-3 text-xs text-[#68665f] sm:text-sm">
                    /s/
                  </span>
                  <input
                    value={slug}
                    onChange={(event) =>
                      setSlug(
                        event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, ""),
                      )
                    }
                    required
                    maxLength={50}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[#171717] outline-none"
                    placeholder="sharma-prints"
                  />
                </span>
                <span className="mt-2 block text-xs font-normal text-[#68665f]">
                  Lowercase letters, numbers, and hyphens only.
                </span>
              </label>
            </div>

            {slugChanged && (
              <p className="border-l-4 border-[#e6322b] bg-[#f9e9e7] p-4 text-sm leading-6 text-[#68201c]">
                <strong>Permanent QR URL changed:</strong> changing this slug changes
                your counter QR URL. Any previously printed standees will point to the
                old URL and should be replaced.
              </p>
            )}

            <fieldset>
              <legend className="mb-3 text-sm font-bold text-[#171717]">
                Single-sided print rates per page <span className="text-[#e6322b]">(₹ INR)</span>
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-[#383630]">
                  Black &amp; White per page
                  <span className="mt-2 flex items-center border border-[#aaa79f] bg-white focus-within:border-[#e6322b]">
                    <span className="pl-4 text-[#68665f]">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={bwRate}
                      onChange={(event) => setBwRate(event.target.value)}
                      required
                      className="w-full bg-transparent px-3 py-3 text-[#171717] outline-none"
                    />
                  </span>
                </label>
                <label className="block text-sm font-medium text-[#383630]">
                  Color per page
                  <span className="mt-2 flex items-center border border-[#aaa79f] bg-white focus-within:border-[#e6322b]">
                    <span className="pl-4 text-[#68665f]">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={colorRate}
                      onChange={(event) => setColorRate(event.target.value)}
                      required
                      className="w-full bg-transparent px-3 py-3 text-[#171717] outline-none"
                    />
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-sm font-bold text-[#171717]">
                Double-sided print rates per page (INR)
              </legend>
              <p className="mb-4 text-sm leading-6 text-[#55534d]">
                These rates apply to each PDF page when the customer selects double-sided printing.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-[#383630]">
                  Black &amp; White · double-sided per page
                  <span className="mt-2 flex items-center border border-[#aaa79f] bg-white focus-within:border-[#e6322b]">
                    <span className="pl-4 text-[#68665f]">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={bwDoubleSidedRate}
                      onChange={(event) => setBwDoubleSidedRate(event.target.value)}
                      required
                      className="w-full bg-transparent px-3 py-3 text-[#171717] outline-none"
                    />
                  </span>
                </label>
                <label className="block text-sm font-medium text-[#383630]">
                  Color · double-sided per page
                  <span className="mt-2 flex items-center border border-[#aaa79f] bg-white focus-within:border-[#e6322b]">
                    <span className="pl-4 text-[#68665f]">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={colorDoubleSidedRate}
                      onChange={(event) => setColorDoubleSidedRate(event.target.value)}
                      required
                      className="w-full bg-transparent px-3 py-3 text-[#171717] outline-none"
                    />
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="border border-[#c9c7c0] p-5">
              <legend className="px-2 text-sm font-bold text-[#171717]">
                Optional preset UPI payment
              </legend>
              <p className="mb-4 text-sm leading-6 text-[#55534d]">
                Add both details to show a preset payee with UPI payments.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-[#383630]">
                  UPI ID
                  <input
                    value={upiId}
                    onChange={(event) => setUpiId(event.target.value)}
                    maxLength={100}
                    className="mt-2 w-full border border-[#aaa79f] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#e6322b]"
                    placeholder="sharmaprints@okicici"
                  />
                </label>
                <label className="block text-sm font-medium text-[#383630]">
                  UPI payee name
                  <input
                    value={upiPayeeName}
                    onChange={(event) => setUpiPayeeName(event.target.value)}
                    maxLength={100}
                    className="mt-2 w-full border border-[#aaa79f] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#e6322b]"
                    placeholder="Sharma Prints"
                  />
                </label>
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 bg-[#e6322b] px-5 py-3.5 font-bold text-white transition hover:bg-[#c92722] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              <Save size={18} aria-hidden="true" />
              {saving ? "Saving…" : "Save shop settings"}
            </button>
          </form>

          <section className="mt-10 border border-[#e4aaa6] bg-[#fff8f7] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-[#b4231b]" size={20} aria-hidden="true" />
              <div>
                <h2 className="font-bold text-[#8e211d]">Permanent account deletion</h2>
                <p className="mt-2 text-sm leading-6 text-[#68201c]">
                  Permanently deletes your owner account, shop, order history, and uploaded files. This cannot be undone. Any temporary file that cannot be removed immediately expires within 24 hours.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmation("");
                    setDeletePassword("");
                    setDeleteError(null);
                    setDeleteDialogOpen(true);
                  }}
                  className="mt-4 inline-flex items-center gap-2 border border-[#b4231b] px-4 py-2.5 text-sm font-bold text-[#8e211d] transition hover:bg-[#f9e9e7]"
                >
                  <Trash2 size={16} aria-hidden="true" /> Delete account permanently
                </button>
              </div>
            </div>
          </section>
        </section>
      </div>

      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-8">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-lg border border-[#171717] bg-white p-6 shadow-2xl sm:p-8"
          >
            <h2 id="delete-account-title" className="text-xl font-black text-[#8e211d]">
              Delete your EZQRPRINT account?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#55534d]">
              Your shop, orders, and login sessions will be permanently deleted. Stored print files are removed immediately where possible; any remaining temporary uploads expire within 24 hours. Enter your current password and type <strong>DELETE</strong> below to confirm.
            </p>
            {deleteError && (
              <p role="alert" className="mt-4 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]">
                {deleteError}
              </p>
            )}
            <form onSubmit={handleDeleteAccount} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-[#383630]">
                Current password
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  className="mt-2 w-full border border-[#aaa79f] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#e6322b]"
                />
              </label>
              <label className="block text-sm font-semibold text-[#383630]">
                Type DELETE to confirm
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                  required
                  className="mt-2 w-full border border-[#aaa79f] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#e6322b]"
                />
              </label>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={deletingAccount}
                  onClick={() => setDeleteDialogOpen(false)}
                  className="border border-[#aaa79f] px-5 py-3 font-bold text-[#55534d] hover:bg-black/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deletingAccount || deleteConfirmation !== "DELETE" || !deletePassword}
                  className="inline-flex items-center justify-center gap-2 bg-[#b4231b] px-5 py-3 font-bold text-white hover:bg-[#8e211d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={17} aria-hidden="true" />
                  {deletingAccount ? "Deleting account…" : "Permanently delete account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
