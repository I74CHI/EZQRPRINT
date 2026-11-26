# EZQRPRINT setup

The deployed app is a static page. The payment button opens the customer's installed UPI app with the shop's payee details. EZQRPRINT does not process, collect, or confirm payments.

## Cloudflare Pages

Connect `I74CHI/EZQRPRINT` to Pages using Git integration. Configure:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Leave blank |
| Build command | `npm run build` |
| Build output directory | `dist` |

Add these build environment variables for both Production and Preview:

- `VITE_UPI_ID`: the shop's public UPI ID.
- `VITE_UPI_PAYEE_NAME`: the name the customer should see in the UPI app.

The values are part of the public client bundle by design. Do not add a UPI PIN, bank password, OTP, or other credential. After the first deployment, Cloudflare supplies a `*.pages.dev` URL. Each push to `main` triggers a new deployment.

## Local development

1. Install Node.js 20 or newer and run `npm install`.
2. Create `.env.local` with `VITE_UPI_ID` and `VITE_UPI_PAYEE_NAME`.
3. Run `npm run dev` and open the local URL shown by Vite.

If the values are missing, the app displays a setup message and does not render a pay button for a fake recipient.

## Payment behavior

The button links to a `upi://pay` URI with the shop's UPI ID, payee name, and INR currency. The customer must review and confirm the payment in their UPI app. The app cannot know whether payment succeeded, so the shop must check its own payment history.
