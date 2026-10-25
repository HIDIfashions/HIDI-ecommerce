/** Fields from Delhivery's Shipment Tracking API, not the public tracking page. */
export type DeliveryEvidence = {
  awb: string;
  deliveredAt: Date;
  orderType: string;
  codAmountPaise: number | null;
};

export function rupeesToPaise(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [rupees, fraction = ""] = text.split(".");
  const amount = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function deliveryEvidence(raw: unknown, expectedAwb: string, now = new Date()): DeliveryEvidence | null {
  const entries = (raw as any)?.ShipmentData;
  if (!Array.isArray(entries)) return null;
  const matches = entries.map(entry => entry?.Shipment)
    .filter(shipment => String(shipment?.AWB ?? "").trim() === expectedAwb.trim());
  if (matches.length !== 1) return null;
  const shipment = matches[0];
  // RTO/DTO and reverse deliveries are not delivery to the customer.
  if (shipment.Status?.Status !== "Delivered" || shipment.Status?.StatusType !== "DL"
    || (shipment.ReverseInTransit !== undefined && shipment.ReverseInTransit !== false)) return null;
  const timestamp = shipment.Status?.StatusDateTime;
  if (typeof timestamp !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/.test(timestamp)) return null;
  // Interpret offset-free timestamps as India local time, independent of server TZ.
  const deliveredAt = new Date(/[Zz]|[+-]\d{2}:\d{2}$/.test(timestamp) ? timestamp : `${timestamp}+05:30`);
  if (!Number.isFinite(deliveredAt.getTime()) || deliveredAt.getTime() > now.getTime() + 300_000) return null;
  return { awb: expectedAwb.trim(), deliveredAt, orderType: shipment.OrderType,
    codAmountPaise: rupeesToPaise(shipment.CODAmount) };
}
