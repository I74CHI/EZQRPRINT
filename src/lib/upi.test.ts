import { describe, expect, it } from "vitest";
import { buildUpiPaymentUrl } from "./upi";

describe("UPI payment link", () => {
  it("opens the configured payee in an installed UPI app and lets the payer enter an amount", () => {
    const paymentUrl = new URL(buildUpiPaymentUrl("shop@bank", "Ravi Xerox"));

    expect(paymentUrl.protocol).toBe("upi:");
    expect(paymentUrl.hostname).toBe("pay");
    expect(paymentUrl.searchParams.get("pa")).toBe("shop@bank");
    expect(paymentUrl.searchParams.get("pn")).toBe("Ravi Xerox");
    expect(paymentUrl.searchParams.get("cu")).toBe("INR");
    expect(paymentUrl.searchParams.has("am")).toBe(false);
  });

  it("trims merchant details before building the payment intent", () => {
    const paymentUrl = new URL(buildUpiPaymentUrl(" shop@bank ", " Ravi Xerox "));

    expect(paymentUrl.searchParams.get("pa")).toBe("shop@bank");
    expect(paymentUrl.searchParams.get("pn")).toBe("Ravi Xerox");
  });
});
