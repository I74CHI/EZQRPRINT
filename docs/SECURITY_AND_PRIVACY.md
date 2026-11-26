# EZQRPRINT Security and Privacy

## Customer privacy design

- Customers do not create an account and the customer UI does not request a name, email address, or phone number.
- Orders are linked by a random Firestore document ID, shop ID, and daily sequential token. The token is an order label, not an authentication credential.
- There are no customer name/email/phone fields in the Firestore order schema.
- Shop-owner authentication details belong to Firebase Authentication and are separate from customer orders.
- Uploaded filenames are retained as file metadata in the order summary. A filename or the contents of a file may still contain information supplied by the customer; users should avoid uploading documents they do not intend to print.
- The browser stores only the active `orderId` and `shopSlug` in local storage to restore an in-progress customer session.
- UPI ID and payee name are merchant settings, not customer data.

## Firestore protections

`firestore.rules` validates shop/public-shop fields and restricts client order writes. The callable Cloud Functions use the Admin SDK, so they validate request fields, file paths and types, current rates, totals, and the maximum 20 files before writing. Rules also:

- Restricts private shop data and owner order listing to the authenticated shop owner.
- Exposes a separate minimal `publicShops/{slug}` projection for public shop lookup.
- Denies client-side order creation; customers create and append files through `createCustomerOrder` and `appendOrderFiles`.
- Limits customer order updates to claiming payment after the owner has requested payment.
- Allows owners to update status, final amount, payment-claim state, and purge state while preserving core order identity and file metadata.
- Disallows client-side deletion of order documents, preserving the earnings ledger. The cleanup function never deletes order documents.

Order documents are readable by document ID so a customer can restore their active order. The random order ID acts as a bearer identifier; keep it private and do not treat the sequential token as access control.

## Storage protections

`storage.rules` restricts files to:

- `application/pdf`
- `image/jpeg`
- `image/png`

Each object must be at most 25 MiB (25 × 1024 × 1024 bytes), and objects are stored beneath the matching shop/order prefix. Customers can upload only for a published shop; owners can access their shop's objects. Reads are allowed for a file linked to a known order or for its owner.

The browser checks file extensions and size before upload. Firebase Storage rules validate the declared `contentType` and object size; they do not inspect file signatures or scan document contents. Do not treat MIME metadata validation as malware scanning.

## File expiry and order retention

New orders receive an `expiresAt` timestamp 24 hours after creation. `firebase-functions/src/cleanupExpiredFiles.ts` runs every 60 minutes and selects orders with `filesPurged == false` and `expiresAt <= now`. It validates each path against the order's Storage prefix, deletes the Storage objects (tolerating already-missing objects), then transactionally sets `filesPurged: true` if the order is still expired and unpurged.

The scheduled job removes file bytes, not order summaries. The Firestore order, token, totals, page/mode breakdown, and purge flag remain for the earnings history. Because the schedule runs hourly, deletion is not guaranteed at the exact 24-hour mark. Check Cloud Function logs and Firebase billing/scheduler configuration if cleanup does not run.

Shop owners can also delete files early from the dashboard. This sets the same `filesPurged` flag while retaining the summary; the history badge therefore says “Files purged” rather than claiming the deletion was necessarily automatic.

## Authentication, abuse, and payment limitations

- Customer uploads and callable order creation are public by design. Configure and enforce Firebase App Check for Firestore and Storage before public launch, and monitor quotas and abuse. The callable functions must also be protected against automated abuse; configure callable App Check enforcement before broad production use.
- Owner pages are protected by Firebase Authentication and Firestore/Storage ownership checks. Keep owner accounts secure and use authorized Firebase domains.
- Firebase Web App configuration in `.env.local` is client configuration, not an Admin credential. Never put a service-account key in browser code or source control.
- The checked-in `cors.json` currently allows GET/HEAD from any origin for browser downloads and PDF processing. Restrict its `origin` list to production app origins before launch.
- Firebase Web App configuration is public client configuration even if supplied to the Pages workflow through Actions secrets; never put Admin credentials in GitHub Actions frontend variables.
- The UPI button only opens a payment intent. `paymentClaimed` is customer-reported and is not proof of settlement. Owners should verify the payment in their payment app before marking an order complete.
- Sequential tokens can reveal order volume and must not be used as access control.

## Deployment checklist

- Deploy `firestore.rules`, `storage.rules`, and `firestore.indexes.json` to the intended Firebase project.
- Enable Email/Password and Google sign-in for shop owners.
- Configure App Check and enforce it for Firestore and Storage.
- Apply a production-specific bucket CORS policy.
- Use a supported Firebase billing plan for callable and scheduled Cloud Functions; verify that callable endpoints and the hourly cleanup are deployed and monitor their logs.
- Keep `.env.local`, Admin credentials, and customer-uploaded documents out of public repositories and support screenshots.
