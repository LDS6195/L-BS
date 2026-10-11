# Lex Book & Sip Club Shop

Plain HTML, CSS, and JavaScript. Two products, product pages, size and quantity selection, a saved cart, and an optional Google Sheets order form. No npm install, build, framework, or payment processor.

Open `index.html` directly in your browser. Upload the same files to any static web host to publish the shop. Hash-based product URLs need no server routing configuration.

## Customize

- Colors, fonts, corner radius, and spacing: tokens at the top of `src/styles.css`.
- Products, prices, and available sizes: `src/store.js`. Tee S-XL costs $30; 2XL costs $32. Hoodie XS-XL costs $40; 2XL and 3XL cost $46. `sizePrices` overrides the base price for specific sizes.
- Your logo and product photos: `images/`.
- Cooper BT is used if installed locally; Fraunces is the web fallback. To show Cooper BT for everyone, supply licensed webfont files and add an `@font-face` rule. The site works offline with a serif fallback.

## Connect Google Sheets

1. Create a Google Sheet. Its ID is the part of its URL between `/d/` and `/edit`.
2. In that sheet, open **Extensions > Apps Script**.
3. Use the code in `google-sheets/Code.gs`, and confirm its `SPREADSHEET_ID` matches your sheet ID. It is already set for the club's sheet.
4. Select **Deploy > New deployment > Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Authorize spreadsheet access, then deploy. Your Google Workspace administrator may restrict public deployments.
5. Put the deployment URL ending in `/exec` in `googleSheetsUrl` in `src/config.js`.
6. Submit a test order from your hosted site and confirm it appears in **Order Summary** and **Orders**. Submission stays disabled until a URL is configured.

The checkout requires first name, last name, email, and a 10-digit US phone number. Phone numbers automatically format as `(555) 123-4567`; pasted numbers with country code `+1` are supported. Each cart row has product, size, and quantity controls. There is no notes field.

The receiver validates products, sizes, quantities, and customer fields, uses server-side prices, escapes spreadsheet formulas, and avoids duplicate orders on retries. Update its `CATALOG` when changing product prices or sizes, and deploy a new version in Google Apps Script. Editing the local file does not update the running Google service.

**Order Summary** has one row per purchase, including the list of products/sizes/quantities and a single order total. **Orders** contains size-by-size details, with alternating backgrounds per purchase and a divider at the first row. The order total is shown only on the first detail row. Product labels in both tabs are `t-shirt` and `hoodie`; the storefront keeps the full product names.

Public order numbers look like `ORD-0001`. A hidden **Request ID** column retains the original retry identifier so retrying an unchanged order cannot create duplicate rows. Do not delete that hidden column. The sequence is kept in Script Properties and may have gaps after a failed submission.

## Upgrade the Existing Sheet

1. Make a backup using **File > Make a copy** in Google Sheets.
2. Replace the code in Google's Apps Script editor with the current `google-sheets/Code.gs`, keeping the configured spreadsheet ID.
3. Select `organizeOrders` from the function dropdown and click **Run**. This upgrades the existing **Orders** tab in place and creates **Order Summary**. It renames **Submitted at** to **Order Date**, removes notes, shortens order IDs, groups rows visually, and recalculates old prices/totals using the current size pricing. For example, a medium hoodie previously stored at $64 becomes $40. Original dates, customer details, quantities, and retry references are retained. Running it again does not duplicate summaries.
4. Select **Deploy > Manage deployments > Edit > New version > Deploy** so future orders use the updated code. Keep **Execute as: Me** and **Who has access: Anyone**.
5. Refresh the website with **Ctrl+Shift+R**. Verify a medium hoodie order has a $40 unit price and appears once in **Order Summary**.

The same upgrade runs automatically on the next submission if you skip the manual `organizeOrders` step. Existing tabs with an unrelated column layout are rejected rather than overwritten.

## Order Confirmation and Venmo

After an order is saved, the website displays its order number, total, and payment instructions. Customers are asked to send the total to **@Mary-Arth-2** and include the order number in the Venmo payment note. The local Venmo logo links to `https://venmo.com/u/Mary-Arth-2`. No automatic confirmation emails are sent; the email address is retained only as an order contact field.

To remove sending from the live deployment, replace Google's Apps Script code with the current `google-sheets/Code.gs`, then use **Deploy > Manage deployments > Edit > New version > Deploy**. Refresh the website. No email authorization helper is needed.

This is an order request awaiting payment, not a paid checkout. Opening Venmo does not automatically verify or complete payment; verify receipt manually before fulfillment. Keep the spreadsheet private, publish a suitable privacy notice before collecting customer information, and never put secrets in the public configuration file. A publicly deployed form endpoint can receive spam; this setup is intended for a small club shop.

## Test

`node --test src/cart.test.js` runs cart, Sheets, retry, and payment-link tests without installing anything. These tests mock Google's spreadsheet services. Google account deployment and Venmo payment must be verified separately.