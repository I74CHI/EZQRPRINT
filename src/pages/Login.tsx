import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LoadingScreen } from "../components/StatusScreen";
import { useAuth } from "../lib/AuthContext";
import { auth } from "../lib/firebase";

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, error: authError } = useAuth();
  const isRegister = location.pathname === "/register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      navigate("/dashboard", { replace: true });
    } catch (authIssue) {
      setError(
        authIssue instanceof Error
          ? authIssue.message
          : "Email and password authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate("/dashboard", { replace: true });
    } catch (authIssue) {
      setError(
        authIssue instanceof Error ? authIssue.message : "Google sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f2ee] px-5 py-12 text-[#171717]">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#55534d] transition hover:text-[#e6322b]"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to EZQRPRINT
        </Link>
        <section className="border border-[#171717] bg-white p-7 sm:p-9">
          <div className="mb-7 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center bg-[#e6322b] text-white">
              <Printer size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#e6322b]">EZQRPRINT</p>
              <h1 className="text-2xl font-bold">
                {isRegister ? "Create owner account" : "Shop owner login"}
              </h1>
            </div>
          </div>
          <p className="mb-6 text-sm leading-6 text-[#55534d]">
            {isRegister
              ? "Register to set up your print shop counter."
              : "Sign in to manage your print shop."}
          </p>

          {(error || authError) && (
            <p
              role="alert"
              className="mb-5 border-l-4 border-[#e6322b] bg-[#f9e9e7] p-3 text-sm text-[#8e211d]"
            >
              {error || authError}
            </p>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <label className="block text-sm font-semibold text-[#171717]">
              Owner email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full border border-[#aaa79f] bg-white px-4 py-3 text-[#171717] outline-none transition placeholder:text-[#85827a] focus:border-[#e6322b]"
                placeholder="owner@example.com"
              />
            </label>
            <label className="block text-sm font-semibold text-[#171717]">
              Password
              <input
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full border border-[#aaa79f] bg-white px-4 py-3 text-[#171717] outline-none transition placeholder:text-[#85827a] focus:border-[#e6322b]"
                placeholder="At least 6 characters"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-[#e6322b] px-4 py-3 font-bold text-white transition hover:bg-[#c92722] disabled:cursor-wait disabled:opacity-60"
            >
              {busy
                ? "Please wait…"
                : isRegister
                  ? "Register shop owner"
                  : "Sign in"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-[#77746d]">
            <span className="h-px flex-1 bg-[#d5d2ca]" />
            or
            <span className="h-px flex-1 bg-[#d5d2ca]" />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-3 border border-[#171717] px-4 py-3 font-semibold text-[#171717] transition hover:bg-black/5 disabled:cursor-wait disabled:opacity-60"
          >
            <span aria-hidden="true" className="text-lg font-black text-[#e6322b]">
              G
            </span>
            Continue with Google
          </button>

          <p className="mt-6 text-center text-sm text-[#55534d]">
            {isRegister ? "Already registered?" : "New to EZQRPRINT?"}{" "}
            <Link
              to={isRegister ? "/login" : "/register"}
              className="font-bold text-[#e6322b] hover:text-[#a71f1a]"
            >
              {isRegister ? "Shop owner login" : "Register"}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
