import { hidiRequest } from "../network/apiClient";
import { hidiEndpoints } from "../network/endpoints";
import type { AccountOrder, AccountOrdersPayload, AfterSalesDraft } from "../models/order";

export async function getAccountOrders(accessToken: string) {
  return hidiRequest<AccountOrdersPayload>(hidiEndpoints.accountOrders, { accessToken });
}

export async function getAccountOrder(accessToken: string, orderNumber: string) {
  return hidiRequest<{ customer: AccountOrdersPayload["customer"]; order: AccountOrder }>(hidiEndpoints.accountOrder(orderNumber), { accessToken });
}

export async function submitOrderReview(
  accessToken: string,
  orderNumber: string,
  orderItemId: string,
  input: { rating: number; title?: string; body?: string },
) {
  return hidiRequest<{ id: string; rating: number; title?: string | null; body?: string | null; createdAt: string }>(
    hidiEndpoints.accountOrderItemReview(orderNumber, orderItemId),
    { method: "POST", accessToken, body: JSON.stringify(input) },
  );
}

export async function createAfterSalesRequest(accessToken: string, draft: AfterSalesDraft) {
  return hidiRequest<{ id: string; type: string; status: string; refundPaise?: number; requestedSize?: string | null; createdAt: string }>(
    hidiEndpoints.accountOrderReturns(draft.orderNumber),
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        orderItemId: draft.orderItemId,
        type: draft.type,
        reason: draft.reason,
        quantity: draft.quantity,
        detail: draft.detail,
        refundDestination: draft.type === "RETURN" ? draft.refundDestination ?? "ORIGINAL" : undefined,
        requestedSize: draft.type === "EXCHANGE" ? draft.requestedSize : undefined,
      }),
    },
  );
}

export async function cancelAfterSalesRequest(accessToken: string, orderNumber: string, requestId: string) {
  return hidiRequest<{ id: string; status: string }>(hidiEndpoints.accountOrderReturnCancel(orderNumber, requestId), {
    method: "PATCH",
    accessToken,
  });
}
