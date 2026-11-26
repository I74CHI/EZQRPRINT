# EZQRPRINT

EZQRPRINT is a web-based contactless print queue for print shops. Customers scan a shop's permanent QR code, upload print-ready files without creating an account, and show a sequential token at the counter. Shop owners handle the queue, printing, payment confirmation, file cleanup, and daily earnings history.

## Features

- Owner registration and sign-in with Firebase Email/Password or Google.
- Per-shop permanent URL, configurable B&W and color rates in INR, and optional merchant UPI details.
- A4/A5 branded counter standee with a QR code pointing to the shop URL.
- Customer upload portal for PDF, JPG/JPEG, and PNG files (maximum 25 MB per file), with upload progress, page counts, copies, print mode, and an itemized price estimate.
- Daily sequential order tokens starting at `#101` for each shop's India Standard Time day.
- Live owner queue with order status, optional arrival chime, direct downloads, ZIP downloads, individual print, and merged bulk print.
- A4 image print studio with N-up and passport layouts, ID-card sizing, crop/straighten controls, cut lines, custom dimensions, and PDF/PNG output.
- UPI app intent and scannable UPI QR fallback, customer payment claim, and itemized digital receipt.
- Daily earnings history for Today, Yesterday, or a chosen date, including completed order totals, pages, B&W/Color counts, and file availability.
- Scheduled removal of expired Storage files while keeping the Firestore order summary for the earnings log.

## Technology

- React 18, TypeScript, Vite 6, Tailwind CSS
- Firebase 11 Modular SDK: Authentication, Cloud Firestore, and Cloud Storage
- Firebase Cloud Functions v2 callable and scheduled functions, Node.js 20, and Firebase Admin SDK
- `pdf-lib` for PDF page counting, PDF composition, and print layouts
- `jszip` for order archives, `qrcode.react` for QR codes, `html-to-image` for standee PNGs, and `lucide-react` for icons

## Requirements

- Node.js 20 LTS and npm
- A Firebase project with Authentication, Cloud Firestore, and Cloud Storage enabled
- Firebase CLI for deployment; `gsutil` for applying the Storage CORS configuration
- Billing enabled for scheduled Cloud Functions/Cloud Scheduler where required by Firebase

## Run from VS Code

1. Open the EZQRPRINT folder in VS Code.
2. In the integrated terminal, install the browser dependencies:

   ```powershell
   npm install
   ```

3. Copy `.env.example` to `.env.local` and fill in the Firebase Web App values from **Firebase Console → Project settings → Your apps**:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   The required variables are `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`. These are browser configuration values, not Admin credentials. Never put a service-account key in the Vite app or commit `.env.local`.

4. Start the development server and open the URL printed in the terminal:

   ```powershell
   npm run dev
   ```

5. Verify the production bundle when dependencies are available:

   ```powershell
   npm run build
   ```

## Local end-to-end testing

1. Install the Firebase CLI and start local Authentication, Firestore, Storage, and Functions emulators:

   ```powershell
   npm install --global firebase-tools
   npm install --prefix firebase-functions
   npm run build --prefix firebase-functions
   firebase emulators:start --only auth,firestore,storage,functions --project demo-ezqrprint
   ```

2. In a second terminal, set the emulator configuration in `.env.local`:

   ```dotenv
   VITE_FIREBASE_API_KEY=demo-api-key
   VITE_FIREBASE_AUTH_DOMAIN=demo-ezqrprint.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=demo-ezqrprint
   VITE_FIREBASE_STORAGE_BUCKET=demo-ezqrprint.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
   VITE_FIREBASE_APP_ID=1:000000000000:web:demo
   VITE_FIREBASE_USE_EMULATORS=true
   VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
   ```

3. Run `npm run dev`. These emulator connections are enabled only in Vite development mode; production builds always use the configured Firebase project. The Functions emulator runs the same server-side validation and token allocation used by customers in production.
4. Create an owner account in the local app and exercise the customer flow using its shop slug. Emulator data is local test data and is not shared with a Firebase project.

## Firebase project setup

1. Create a Firebase project and register a Web App. Copy its configuration into `.env.local`.
2. In **Authentication → Sign-in method**, enable Email/Password and Google. Configure the authorized domains for local development and production.
3. Create a Cloud Firestore database and a Cloud Storage bucket. Choose compatible regions and keep them consistent with the project's data-residency needs.
4. Review the project rules and indexes, then deploy them with the Firebase CLI (commands below). Do not deploy permissive development rules.
5. Set up App Check for the Web App and enforce it for Firestore and Storage before opening the public portal broadly. The application rules are not a substitute for App Check or abuse monitoring.
6. Configure the Storage bucket's CORS policy for browser PDF merging and direct file downloads:

   ```powershell
   gsutil cors set cors.json gs://<your-storage-bucket>
   ```

   The checked-in `cors.json` allows browser `GET` and `HEAD` requests from any origin. For a production deployment, replace `"*"` with the exact EZQRPRINT web origins, then apply the edited policy.
7. Install/build the callable and scheduled function dependencies and deploy:

   ```powershell
   npm install --prefix firebase-functions
   npm run build --prefix firebase-functions
   firebase login
   firebase use <your-firebase-project-id>
   firebase deploy --only firestore,storage,functions
   ```

   Cloud Functions deployment requires a supported Firebase billing plan. The callable functions create and append customer orders; the scheduled `cleanupExpiredFiles` function needs Cloud Scheduler access. Confirm all three functions are deployed and monitor their Cloud Functions logs.
8. For Firebase Hosting, build the browser app and deploy the configured `dist` directory:

   ```powershell
   npm run build
   firebase deploy --only hosting
   ```

## Cloudflare Pages deployment

Cloudflare Pages hosts the Vite frontend. Firebase remains the backend for Authentication, Firestore, Storage, and Cloud Functions. The root `functions/` folder is reserved by Cloudflare Pages for Pages Functions, so Firebase Functions live in `firebase-functions/`; `firebase.json` points to that folder. Choose Git integration for automatic deployments; Cloudflare does not let a Git-integrated project switch to Direct Upload later.

1. Push the project to GitHub (or GitLab), then open Cloudflare **Workers & Pages → Create application → Pages → Connect to Git** and choose the repository. Set the production branch to `main` (or the branch you use).
2. Use these build settings:

   | Setting | Value |
   | --- | --- |
   | Root directory | Leave the default (repository root) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

   These are Cloudflare's documented settings for React (Vite). Leave the framework preset as React (Vite) if offered.
3. Add the six `VITE_FIREBASE_*` web app configuration values from **Firebase Console → Project settings → Your apps** as Cloudflare Pages environment variables. Add them for both Production and Preview deployments, then redeploy after changing any value. Set `VITE_BASE_PATH` to `/`.

   The six values become visible in the generated browser bundle; they are public Firebase Web App configuration, not privileged credentials. Never place a Firebase Admin service-account key in the frontend or Pages variables.
4. Select **Save and Deploy**. Cloudflare provides a `*.pages.dev` URL. Add its hostname under **Firebase Console → Authentication → Settings → Authorized domains**. Add your custom domain there too after attaching it in Pages.
5. For browser file downloads and PDF processing, set the Storage bucket CORS origin to the deployed `https://<project>.pages.dev` hostname (and custom domain, if used) instead of `*`, then apply the policy:

   ```powershell
   gsutil cors set cors.json gs://<your-storage-bucket>
   ```

6. Deploy Firebase rules and Cloud Functions separately using the Firebase steps above. Cloudflare Pages does not run Firebase Cloud Functions. The Firebase Functions source remains `firebase-functions/`.

Cloudflare Pages supports Git-based automatic production deployments and previews for other branches. The app uses `HashRouter`, so its shop links include `/#/s/<slug>` and do not need a server-side SPA rewrite.

## Project map

- `src/pages/` — public landing, owner authentication/settings/dashboard/history, and customer portal.
- `src/components/` — upload controls, customer order status/receipt, QR standee, and A4 print studio.
- `src/lib/` — Firebase initialization, order operations, formatting, and browser print/download helpers.
- `src/types/` — Firestore-facing TypeScript models.
- `firebase-functions/src/` — callable order transactions and scheduled file cleanup.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, and `cors.json` — backend policies and browser download configuration.
- `docs/ARCHITECTURE.md`, `docs/SECURITY_AND_PRIVACY.md`, and `docs/USER_GUIDE.md` — technical and operating references.

## Important behavior

- Customer accounts and customer name, email, and phone fields are not part of the order flow. Orders are identified by an unguessable document ID and the displayed daily token.
- The customer-entered UPI payment claim is not a payment-provider verification. Shop staff must verify receipt in their UPI app before marking an order complete.
- File expiry is set to 24 hours after order creation. The scheduled job runs hourly, so deletion can occur after the expiry time rather than at an exact minute.
- Purging removes Storage objects, not completed order documents. Completed order summaries remain available to the history page.

For detailed data flows, see [ARCHITECTURE.md](./ARCHITECTURE.md). For privacy and rules, see [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md). For day-to-day instructions, see [USER_GUIDE.md](./USER_GUIDE.md).
