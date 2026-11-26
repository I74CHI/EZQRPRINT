export function buildUpiPaymentUrl(upiId: string, payeeName: string): string {
  const params = new URLSearchParams({
    pa: upiId.trim(),
    pn: payeeName.trim(),
    cu: "INR",
  });

  return `upi://pay?${params.toString()}`;
}
