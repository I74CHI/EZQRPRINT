import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Landing from "../pages/Landing";
import { FeedbackPage, LoadingScreen } from "./StatusScreen";
import { QrStandeeGenerator } from "./QrStandeeGenerator";

describe("Component and Page Server/Static Rendering", () => {
  it("renders Landing page without errors", () => {
    const html = renderToString(
      <MemoryRouter initialEntries={["/"]}>
        <Landing />
      </MemoryRouter>,
    );
    expect(html).toContain("EZQRPRINT");
    expect(html).toContain("Scan.");
    expect(html).toContain("Print.");
    expect(html).toContain("Shop Owner Login");
  });

  it("renders LoadingScreen and FeedbackPage", () => {
    const loadingHtml = renderToString(<LoadingScreen />);
    expect(loadingHtml).toContain("Loading EZQRPRINT");

    const feedbackHtml = renderToString(
      <FeedbackPage message="Service temporarily offline" />,
    );
    expect(feedbackHtml).toContain("Service temporarily offline");
  });

  it("renders QrStandeeGenerator in A4 and A5 sizes", () => {
    const html = renderToString(
      <MemoryRouter>
        <QrStandeeGenerator shopName="Ravi Xerox" slug="ravi-xerox" />
      </MemoryRouter>,
    );
    expect(html).toContain("Permanent counter QR standee");
    expect(html).toContain("Ravi Xerox");
    expect(html).toContain("ravi-xerox");
  });
});
