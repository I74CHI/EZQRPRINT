# EZQRPRINT User Guide

## Shop owner setup

1. Open EZQRPRINT and choose **Shop Owner Login / Register**.
2. Register with an email and password of at least 8 characters, then open **Shop settings**.
3. Enter the public shop name and choose a short URL slug, such as `sharma-prints`.
4. Set separate single-sided and double-sided per-page rates for B&W and Color.
5. To offer a preset UPI payment button, enter both your merchant UPI ID and payee name. Leave both blank if customers should pay at the counter.
6. Save the settings. Keep the slug stable: changing it changes the permanent QR URL, so previously printed standees must be replaced.

## Print the permanent counter standee

1. Open the owner dashboard and scroll to **Permanent counter QR standee**.
2. Choose A4 or A5.
3. Check that the shop name and QR code are correct. The QR opens your permanent customer portal at the site URL, including its hash route.
4. Select **Print Standee** to use the browser print dialog, or **Download Standee (PNG)** to save an image for a print shop or design workflow.
5. Test the printed QR with a phone before placing it on the counter.

If you change the shop slug later, generate and print a new standee.

## Handle the live print queue

- New orders appear in arrival order. Match every job using its large token (for example `#101`); customer names and phone numbers are not used.
- **Unmute chime** enables a short browser-generated sound for new orders. Browsers require this explicit user action.
- Open each file badge to check B&W/Color, ID Card Size, pages, copies, and item cost.
- Customers can request single-sided or double-sided printing. Each mode uses its matching B&W or Color per-page rate; enable duplex in the printer settings when printing.
- **Mark Printing** updates the order status while you work.
- Edit **Final amount** if you need an adjustment, then choose **Request Payment**. The customer sees the amount and, if configured, the UPI app button and matching QR.
- Verify payment in your UPI app or at the counter, then choose **Confirm Paid & Complete**. The customer's receipt appears after you confirm payment.

## Download and print customer files

- **Download** saves one original PDF/JPG/PNG for printing in your preferred PC software.
- **Download All (.zip)** packages all originals in an order.
- **Print** opens one file in the browser print dialog.
- **Bulk Print Order** combines PDF pages and image files into one PDF, repeating pages according to each file's Copies setting.
- **Delete Files Now** permanently removes the order's uploaded objects after confirmation. The order summary remains and the history shows **Files purged**. Do this only when you no longer need to print or download the files.

## Arrange image jobs on A4

Choose **Layout & Print** on an order containing images.

- Use **1×1**, **1×2**, **2×2**, **2×3 (6-Up)**, **2×4 (8-Up)**, or Custom rows and columns. Uploaded images continue onto more A4 pages as needed.
- **Passport photo · 6-up** repeats the selected image in six 35 × 45 mm cells. Select the image to use.
- **ID card front & back** places the selected front and back at 85.6 × 54 mm, stacked on one page with a 10 mm gap. The same image can be selected for both sides.
- **Auto-Crop & Straighten ID** estimates the card boundary in the browser. The four crop handles briefly appear for manual fine-tuning; use **Adjust crop** to show them again.
- Use **Rotate 90°**, custom width/height in millimetres, and drag the image within its cell to adjust placement.
- Change portrait/landscape, cell spacing, cut lines, or **Document clean-up · ink-saver** as needed.
- **Print Arranged Sheet** opens the print dialog; **Download Arranged Sheet (PDF)** exports every page. PNG export saves the currently selected preview page.

Auto-crop is a best-effort image tool. Check the preview and adjust the crop before printing. For critical dimensions, confirm the printer is set to A4 and disable any “fit to page” scaling in the print dialog.

## Check Daily Earnings

1. Select **Daily earnings** in the dashboard header.
2. Choose **Today**, **Yesterday**, or **Custom date**. Dates and timestamps use India Standard Time.
3. The summary cards show completed order count, printed pages (pages × copies), and total earnings from each order's final amount.
4. The table shows token, order timestamp, total pages, B&W/Color page counts, earnings, and whether files are available or purged.
5. Purged files do not remove the order summary from this log. Uploaded file bytes expire after 24 hours.

The history groups orders by their recorded order creation timestamp (`createdAt`); the current order model does not store a separate completion timestamp.

## Customer walkthrough

1. Scan the shop's EZQRPRINT QR code with a phone camera.
2. Choose PDF, JPG/JPEG, or PNG files (up to 25 MB each). PDFs are counted automatically; if an encrypted PDF cannot be read, enter its page count manually.
3. Choose copies and B&W or Color. For images, select Standard Print or ID Card Size. Review the live rupee total and upload progress.
4. Keep the displayed token and show it at the counter. No customer account, name, email, or phone number is required.
5. While the order is pending or printing, use **+ Add More Files to This Order** if needed.
6. When the shop requests payment, tap **Pay via UPI App** or scan the payment QR. Complete payment and show your token at the counter. The receipt appears on this page after shop staff confirm payment.
7. Download the receipt as a PNG if you need a copy. If the shop has not configured UPI, pay at the counter and wait for the owner to confirm payment.

If the shop has not configured UPI, pay at the counter and follow the shop owner's instructions. Use **Skip / Start New Order** only after you no longer need the current order session.
