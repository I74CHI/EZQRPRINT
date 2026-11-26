# EZQRPRINT · Contactless Print Queue for Local Print Shops

> **100% Free Contactless Print Queue System.** Designed for local xerox and print shops to eliminate counter chaos, queues, and friction using permanent counter QR codes, token management, UPI payments, and browser-side print automation.

---

## 🌟 Key Features

- **Counter QR Standee**: Generate and print custom branded A4 or A5 permanent counter standees with embedded shop QR codes.
- **Contactless Customer Portal**: Customers scan the counter QR to upload PDF/images, select page copies, B&W/color, single/double sided, and track live order status.
- **Sequential Daily Tokens**: Orders receive automatic sequential daily tokens starting at `#101` each day.
- **Privacy-First**: No customer registration, emails, or phone numbers collected. Files auto-purge on expiration.
- **Live Owner Dashboard**: Real-time Firestore streaming queue with audio chimes on new incoming jobs.
- **Integrated Print Actions**: Single-click browser print dialog, individual file download, or one-click ZIP download with automatic deduplicated file names.
- **A4 Print Studio**: Built-in 2-up, 4-up, 6-up, 8-up, passport photo (6-up 35×45mm), and ID-card front/back layout arranging with automatic deskewing, auto-crop, and ink-saver mode.
- **Direct UPI Counter Payments**: Customers pay counter rates directly through UPI intent links or QR codes.
- **Daily Earnings Tracker**: Full daily IST-based earnings, page counts, and B&W vs. color breakdown.

---

## 🏗 Architecture & Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, PDF-Lib, JSZip, html-to-image, qrcode.react.
- **Routing**: React Router 7 (`HashRouter` for static hosting on Cloudflare Pages and other hosts).
- **Backend**: Firebase Cloud Functions (v2 Scheduler for expired file purge, v2 HTTPS onCall for atomic transactions).
- **Database & Storage**: Cloud Firestore & Cloud Storage with strict security rules and CORS configuration.

```
EZQRPRINT/
├── .github/workflows/deploy-pages.yml  # Optional GitHub Pages CI/CD
├── dist/                               # Production build output
├── docs/                               # Architecture, security & operating docs
├── firebase-functions/                 # Firebase Cloud Functions (Node 20 TypeScript)
│   ├── src/
│   │   ├── admin.ts                    # Shared Firebase Admin initialization
│   │   ├── cleanupExpiredFiles.ts      # Scheduled 60-minute file purger
│   │   ├── orderTransactions.ts        # Atomic order & token allocation
│   │   └── orderTransactions.test.ts   # Backend business logic unit tests
│   └── package.json
├── src/                                # Frontend application
│   ├── components/                     # Standee, receipt, layout studio & uploaders
│   ├── lib/                            # Firebase, currency, earnings, pricing, actions
│   ├── pages/                          # Landing, Login, Dashboard, History, Settings, CustomerPortal
│   ├── types/                          # Shared TypeScript models
│   ├── App.tsx                         # Routes & protected route wrapper
│   └── main.tsx                        # Entry point with HashRouter
├── firestore.rules                     # Firestore security policies
├── storage.rules                       # Cloud Storage file size & MIME type validation
├── cors.json                           # Cloud Storage bucket CORS configuration
└── vite.config.ts                      # Bundler & manual chunk optimization
```

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- `npm`

### 2. Installation
Clone the repository and install dependencies:
```bash
# Install frontend dependencies
npm install

# Install Cloud Functions dependencies
npm install --prefix firebase-functions
```

### 3. Environment Setup
Copy the example environment file:
```bash
cp .env.example .env.local
```
Update `.env.local` with your Firebase project credentials:
```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_USE_EMULATORS=false
VITE_BASE_PATH=/
```

### 4. Running Locally
```bash
# Start local development server
npm run dev
```

### 5. Running Tests
Run the comprehensive test suite (frontend + cloud functions):
```bash
# Run frontend unit tests (Vitest)
npm test

# Run Cloud Functions tests (Node test runner)
npm run test:functions

# Run all test suites
npm run test:all
```

### 6. Production Build
```bash
# Build frontend
npm run build

# Build Cloud Functions
npm run build --prefix firebase-functions

# Preview production build locally
npm run preview
```

---

## 🔒 Security & Privacy

- **Zero PII**: No customer names, phone numbers, or email addresses are ever stored.
- **Upload Constraints**: Enforced 25 MB max file size, restricted to `application/pdf`, `image/jpeg`, and `image/png`.
- **Atomic Operations**: Callable Cloud Functions run Firestore transactions to prevent duplicate tokens and ensure print rate consistency.
- **Automatic File Purging**: Scheduled hourly Cloud Function safely deletes files older than 24 hours while preserving business earnings metrics.

---

## 🌐 Deployment Guide

### Option A: Cloudflare Pages (Frontend)

Cloudflare Pages hosts the built frontend. Firebase continues to provide authentication, Firestore, Storage, and Cloud Functions. The Firebase backend source is in `firebase-functions/` because Cloudflare Pages reserves a root `functions/` directory for its own request handlers.

1. Push this project to a GitHub or GitLab repository, then in Cloudflare open **Workers & Pages → Create application → Pages → Connect to Git** and select the repository. Choose Git integration if you want automatic deployments; Cloudflare does not let a Git-integrated project switch to Direct Upload later.
2. Set the production branch to `main`, leave the root directory at the repository root, use the build command `npm run build`, and set the build output directory to `dist`.
3. Add these build environment variables in the Pages project settings for both Production and Preview:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_BASE_PATH` = `/`
4. Save and deploy. Cloudflare will build on each push to the production branch and create preview deployments for other branches.
5. Add the assigned `<project>.pages.dev` hostname to **Firebase Console → Authentication → Settings → Authorized domains**. Add a custom domain there too if you connect one.
6. The Firebase web configuration is public client configuration and will be included in the browser bundle. Never enter a Firebase Admin service-account key into Pages variables.

See [docs/README.md](docs/README.md#cloudflare-pages-deployment) for a detailed checklist and Firebase backend setup.

### Option B: Firebase Deployment (Backend & Rules)

1. Log in to Firebase CLI:
   ```bash
   npx firebase login
   npx firebase use <your-project-id>
   ```
2. Deploy Security Rules, Indexes, and Cloud Functions:
   ```bash
   npx firebase deploy --only firestore,storage,functions
   ```
3. Set Storage CORS for browser downloads & canvas processing:
   ```bash
   gsutil cors set cors.json gs://<your-storage-bucket>
   ```

### Option C: GitHub Pages, Vercel, Netlify, or Render (Alternative Frontend Hosting)

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: Add the `VITE_FIREBASE_*` variables in the platform dashboard.

---

## 📄 License

MIT License. Free for all local print shops and businesses.
