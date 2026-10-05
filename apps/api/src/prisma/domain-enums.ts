export const UserRole = {
  "CUSTOMER": "CUSTOMER",
  "ADMIN": "ADMIN",
  "OPERATIONS": "OPERATIONS",
  "SUPPORT": "SUPPORT"
} as const;
export type UserRole = typeof UserRole[keyof typeof UserRole];

export const ProductStatus = {
  "DRAFT": "DRAFT",
  "ACTIVE": "ACTIVE",
  "ARCHIVED": "ARCHIVED"
} as const;
export type ProductStatus = typeof ProductStatus[keyof typeof ProductStatus];

export const OrderStatus = {
  "PENDING_PAYMENT": "PENDING_PAYMENT",
  "CONFIRMED": "CONFIRMED",
  "PACKED": "PACKED",
  "SHIPPED": "SHIPPED",
  "DELIVERED": "DELIVERED",
  "CANCELLED": "CANCELLED",
  "RETURN_REQUESTED": "RETURN_REQUESTED",
  "RETURNED": "RETURNED",
  "REFUNDED": "REFUNDED",
  "PAYMENT_REVIEW": "PAYMENT_REVIEW"
} as const;
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];

export const PaymentStatus = {
  "CREATED": "CREATED",
  "AUTHORIZED": "AUTHORIZED",
  "CAPTURED": "CAPTURED",
  "FAILED": "FAILED",
  "REFUNDED": "REFUNDED",
  "PARTIALLY_REFUNDED": "PARTIALLY_REFUNDED"
} as const;
export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

export const ReservationStatus = {
  "ACTIVE": "ACTIVE",
  "CONSUMED": "CONSUMED",
  "RELEASED": "RELEASED"
} as const;
export type ReservationStatus = typeof ReservationStatus[keyof typeof ReservationStatus];

export const ShipmentStatus = {
  "PENDING": "PENDING",
  "READY_TO_SHIP": "READY_TO_SHIP",
  "SHIPPED": "SHIPPED",
  "OUT_FOR_DELIVERY": "OUT_FOR_DELIVERY",
  "DELIVERED": "DELIVERED",
  "RTO": "RTO",
  "CANCELLED": "CANCELLED"
} as const;
export type ShipmentStatus = typeof ShipmentStatus[keyof typeof ShipmentStatus];

export const InventoryMovementType = {
  "RECEIPT": "RECEIPT",
  "CORRECTION": "CORRECTION",
  "DAMAGE": "DAMAGE",
  "RETURN_RESTOCK": "RETURN_RESTOCK",
  "OTHER": "OTHER"
} as const;
export type InventoryMovementType = typeof InventoryMovementType[keyof typeof InventoryMovementType];

export const StockReceiptStatus = {
  "DRAFT": "DRAFT",
  "POSTED": "POSTED",
  "CANCELLED": "CANCELLED"
} as const;
export type StockReceiptStatus = typeof StockReceiptStatus[keyof typeof StockReceiptStatus];

export const ReviewFollowUpStatus = {
  "PENDING": "PENDING",
  "SENT": "SENT",
  "FAILED": "FAILED",
  "CANCELLED": "CANCELLED"
} as const;
export type ReviewFollowUpStatus = typeof ReviewFollowUpStatus[keyof typeof ReviewFollowUpStatus];

export const ReviewFollowUpChannel = {
  "EMAIL": "EMAIL"
} as const;
export type ReviewFollowUpChannel = typeof ReviewFollowUpChannel[keyof typeof ReviewFollowUpChannel];
