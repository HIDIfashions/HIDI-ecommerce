export type AccountReturnRequest = {
  id: string;
  type: string;
  reason: string;
  quantity: number;
  refundDestination?: string | null;
  requestedSize?: string | null;
  refundPaise: number;
  status: string;
  createdAt: string;
};

export type AccountOrderItem = {
  id: string;
  productName: string;
  slug: string;
  image?: string | null;
  size: string;
  color: string;
  quantity: number;
  returnableQuantity: number;
  totalPaise: number;
  rating?: {
    average: number;
    count: number;
    customerRating?: number | null;
  };
  exchangeSizes: string[];
  returnRequests: AccountReturnRequest[];
};

export type AccountOrderSummary = {
  orderNumber: string;
  status: string;
  afterSales?: { id: string; type: string; status: string; createdAt: string } | null;
  createdAt: string;
  totalPaise: number;
  walletAppliedPaise?: number;
  cashPayablePaise?: number;
  paymentStatus?: string | null;
  deliveredAt?: string | null;
  returnWindowEndsAt?: string | null;
  canReturnOrExchange?: boolean;
  itemCount: number;
  items: AccountOrderItem[];
};

export type AccountPayload = {
  customer: {
    email?: string | null;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  orders: AccountOrderSummary[];
};
