# EZQRPRINT Security and Privacy

## Customer privacy

- Customers do not make accounts or provide names, emails, or phone numbers.
- The browser stores the random order ID and shop slug in local storage to restore an active order. Anyone who obtains the order ID may read that order's status and claim payment.
- Uploaded filenames are retained in the order summary. A filename or file contents may contain customer-provided information.
- File bytes expire in Workers KV after 24 hours; order summaries remain in D1 for the earnings log.
- Merchant UPI details are public on the shop page so the payment app can be addressed correctly.

## Owner authentication

- Passwords are salted and derived with PBKDF2-SHA-256 before storage. The server stores only the derived hash and salt.
- Login creates a random 256-bit token. D1 stores its SHA-256 hash; the browser receives the token in an HttpOnly, Secure, SameSite=Lax cookie.
- Owner-only API actions check the session and shop ownership on the server. Pages and API share the same origin, and the API does not enable cross-origin requests.
- The app currently has no email verification, password reset, or Google sign-in. Owners should keep their password safe.

## Upload and order protections

- Server checks allowed types (PDF/JPEG/PNG), content signatures, a 25 MiB file size limit, valid order IDs, file paths, page/copy values, current shop rates, and the 20-file order limit.
- File paths include server-generated random UUIDs and are scoped by shop and order ID.
- Owner download routes require a valid owner session and verify the order belongs to that owner's shop.
- Customer order IDs are random bearer identifiers rather than sequential tokens; do not share them publicly.
- UPI payment claims are customer-reported only. Owners must verify the payment in their UPI app.

## Cloudflare Free allowances

The app uses D1 and Workers KV on the Cloudflare Free plan. Current free limits include 5 GB of D1 storage, 1 GB of KV storage, 100,000 Workers requests per day, and limited daily D1/KV operations. Those limits are hard caps; requests fail when a limit is reached and reset or recover according to Cloudflare's plan rules. Files expire after 24 hours to limit storage use. The app does not enable a paid Workers plan or R2.

## Deployment

The D1 schema lives in `migrations/0001_initial.sql`; bindings are named `DB` and `FILES` in `wrangler.jsonc`. Keep the database and namespace IDs in sync with the Cloudflare account that owns the Pages project. Never put passwords, session tokens, or Cloudflare API tokens in the repository.
