import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import PayPage from "../pages/PayPage";

describe("UPI payment page", () => {
  it("renders a clear setup message when shop details are not configured", () => {
    const html = renderToString(<PayPage />);

    expect(html).toContain("Pay with UPI");
    expect(html).toContain("This payment button needs the shop’s UPI ID");
    expect(html).not.toContain("Pay via UPI");
  });
});
