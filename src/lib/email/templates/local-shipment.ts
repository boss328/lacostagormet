import { buildEmail, emailButton, emailHeading, escapeHtml } from "./base";

export function renderLocalShipment(input: {
  orderNumber: string;
  tracking: string;
  trackingUrl: string | null;
  carrier: string;
  items: Array<{ name: string; quantity: number }>;
}) {
  // Keep the notification identical on retries even if other packages ship later.
  const heading = "Your shipment is on its way.";
  const subject = `Shipment update for La Costa Gourmet order #${input.orderNumber}`;
  const items = input.items.map((i) => `${i.quantity} × ${i.name}`);
  return buildEmail({
    subject,
    preheader: heading,
    bodyHtml: `${emailHeading(heading)}<p>Order ${escapeHtml(input.orderNumber)}</p><p>This shipment contains:</p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul><p>${escapeHtml(input.carrier)} tracking: ${escapeHtml(input.tracking)}</p>${input.trackingUrl ? emailButton(input.trackingUrl, "Track this shipment") : ""}<p>Items outside this list may ship separately.</p><p>Questions? Reply to this email and we will help.</p>`,
    bodyText: `${heading}\n\nOrder ${input.orderNumber}\n\nThis shipment contains:\n${items.join("\n")}\n\n${input.carrier} tracking: ${input.tracking}\n${input.trackingUrl || ""}\n\nItems outside this list may ship separately.\n\nQuestions? Reply to this email and we will help.`,
  });
}
