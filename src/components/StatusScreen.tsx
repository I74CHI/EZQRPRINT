export function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f2ee] text-[#e6322b]">
      <p className="animate-pulse font-bold uppercase tracking-[0.16em]">Loading EZQRPRINT…</p>
    </main>
  );
}

export function FeedbackPage({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f2ee] px-6 text-center text-[#171717]">
      <p
        role="alert"
        className="max-w-xl border-l-4 border-[#e6322b] bg-white p-6 text-[#8e211d]"
      >
        {message}
      </p>
    </main>
  );
}
