# EZQRPRINT

EZQRPRINT is a small static payment page for print shops. A customer taps **Pay via UPI** and their phone hands the payment request to an installed UPI app. The customer checks the payee and enters or confirms the amount inside that app.

The website does not collect money, read payment status, or store customer data. It does not need Firebase or a billing account.

## Configure the payment button

Set these Vite build variables in Cloudflare Pages:

| Variable | Value |
| --- | --- |
| `VITE_UPI_ID` | The shop's UPI ID, such as `shopname@bank` |
| `VITE_UPI_PAYEE_NAME` | The name customers should see in their UPI app |

These values are included in the public website so the button can address the payee. Never put bank passwords, UPI PINs, OTPs, or private keys in these variables.

## Deploy on Cloudflare Pages

1. Connect the GitHub repository `I74CHI/EZQRPRINT` to Cloudflare Pages.
2. Use production branch `main` and leave the root directory blank.
3. Set the build command to `npm run build` and the build output directory to `dist`.
4. Add `VITE_UPI_ID` and `VITE_UPI_PAYEE_NAME` under **Environment variables** for Production and Preview.
5. Save and deploy. Pushes to `main` will trigger production builds.

## Run locally

```bash
npm install
npm run dev
```

Set the two `VITE_UPI_*` variables in an ignored `.env.local` file to see the configured pay button. Without them, the page shows a setup message rather than a fake payment destination.

## Verify changes

```bash
npm test
npm run build
```

The payment link uses the standard `upi://pay` intent with the payee and INR currency. Whether a UPI app opens depends on the customer's device and installed apps. The shop should verify every transfer in its UPI app.
