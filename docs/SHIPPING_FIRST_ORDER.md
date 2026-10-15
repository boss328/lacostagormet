# Jeff's first shipment

## What is ready

Invoices, packing slips, live rate comparisons and recording tracking bought elsewhere are available in Admin. Buying postage through the website is still switched off until the first real package is ready for acceptance testing. The current integration supports U.S. addresses and USD; Canada is a future addition.

## Pack and prepare

1. Open the customer's paid order in **Admin → Orders**. Check the recipient's address and phone number.
2. Choose **Print invoice** for prices and totals, or **Print packing slip** for a list without prices. Select only the quantities in this box when printing a partial packing slip.
3. Under **Ship from my location**, select those same item quantities. Supplier-assigned items and quantities already reserved or shipped are unavailable.
4. Weigh the complete packed box in pounds. Measure its outside length, width and height in inches. Enter those figures and click **Compare shipping rates**.
5. Review the service and price. If you are only checking rates, cancel the draft afterward to release the selected quantities.

Never ship the QA order **LCG-10093**. It is a zero-dollar test record marked **DO NOT FULFILL**.

## First paid label — complete with Peter

When an actual order and packed parcel are ready, Peter can enable label purchasing for the first supervised shipment. Confirm the selected postage charge before buying once.

- Verify that a tracking number and label appear for the correct package.
- Open **4 × 6** for a thermal printer or **Letter** for ordinary paper. Print at actual size/100%, check that the label is clear and unclipped, and attach it to the parcel. Reprinting uses the same label.
- Print the shipment's packing slip and check its quantities against the contents.
- A purchased or printed label does not mark the package shipped. After handing it to the carrier, click **Mark shipped & notify customer** once.
- Confirm the customer receives tracking and the order shows the correct shipped quantities. If this is a partial shipment, the rest must remain open.

For postage already bought elsewhere, use **I already have tracking** after dispatch. Saving it immediately records shipment and sends the customer notification.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Rates fail or the quote expires | Cancel the unpurchased draft, correct the package/address issue and request fresh rates. Quotes expire after 20 minutes. |
| The purchase times out or its result is uncertain | Use **Recover status**. Do not buy a second label. Contact Peter if the original attempt cannot be resolved. |
| A label was voided in ShipStation | Contact Peter to reconcile the website shipment before replacing it. |
| Customer notification is pending | Wait two minutes, then use **Retry customer notification**. Contact Peter if it persists; do not create another shipment to resend the message. |
| Items are blocked by a supplier PO | Check the supplier assignment with Peter. Do not clear assignments to bypass the restriction. |

## Release notes for Peter

- Production code at the start of this final review: `562483b`, deployment `dpl_5iUn6L69u4UKBngyR1jVB4SHd8SE`.
- `SHIPPING_ENABLED=true`; `SHIPPING_PURCHASE_ENABLED=false`. Changing an environment value requires a new deployment before it takes effect.
- To pause new label purchases, set `SHIPPING_PURCHASE_ENABLED=false` and redeploy. Keep shipping enabled so existing labels, recovery and notification retries remain usable. Use `SHIPPING_ENABLED=false` only when all shipment mutations need to stop.
- Before a release, record the current production deployment in Vercel as the rollback target. A code rollback does not reverse purchases, emails or database changes; reconcile those separately.
- Before deploying the final supplier PO fix, follow [the supplier release instructions](SUPPLIER_PO_RELEASE.md): an older missing warehouse migration and the new send-claim migration must be applied before the code release.
- Remaining acceptance: live authenticated browser rendering, one real paid label, physical printing, actual notification delivery and customer tracking.
