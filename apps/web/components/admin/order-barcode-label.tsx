import { Code128Barcode } from "./code128-barcode";

export function OrderBarcodeLabel({
  orderNumber,
  className,
}: {
  orderNumber: string;
  className?: string;
}) {
  const value = "HIDI-ORDER:" + orderNumber;

  return (
    <div className={className}>
      <div data-order-label-brand>
        <strong>HIDI</strong>
        <span>ORDER</span>
      </div>
      <Code128Barcode value={value} height={46} />
      <code>{orderNumber}</code>
      <small>Scan first at packing station</small>
    </div>
  );
}
