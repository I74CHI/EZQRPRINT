# Security and privacy

- The static page has no account system, database, file uploads, or payment-status integration.
- The configured UPI ID and payee name are public site data. They are compiled into the static JavaScript so the pay button can open the right recipient.
- Do not place UPI PINs, bank passwords, OTPs, or other authentication secrets in Cloudflare build variables.
- A payment link only opens a UPI app. The app cannot verify whether the customer completed a transfer; the shop must verify it independently.
- Customers should check the payee name and amount in their UPI app before confirming a payment.
