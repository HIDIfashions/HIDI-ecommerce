export type OriginalTenderRefundInput = {
  refundPaise: number;
  orderTotalPaise: number;
  walletAppliedPaise: number;
  walletAlreadyRefundedPaise: number;
  cashPaidPaise: number;
  cashAlreadyRefundedPaise: number;
};

export type OriginalTenderRefundAllocation = {
  walletPaise: number;
  cashPaise: number;
};

function paise(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Preserve the customer's original tender mix where possible, then consume
 * any remaining refundable tender without ever exceeding what HIDI collected.
 * This also absorbs integer-rounding leftovers across multiple item returns.
 */
export function allocateOriginalTenderRefund(input: OriginalTenderRefundInput): OriginalTenderRefundAllocation {
  const values = [
    input.refundPaise,
    input.orderTotalPaise,
    input.walletAppliedPaise,
    input.walletAlreadyRefundedPaise,
    input.cashPaidPaise,
    input.cashAlreadyRefundedPaise,
  ];
  if (!values.every(paise) || input.refundPaise <= 0 || input.orderTotalPaise <= 0) {
    throw new Error("Invalid refund allocation amounts");
  }
  if (input.walletAppliedPaise + input.cashPaidPaise !== input.orderTotalPaise) {
    throw new Error("Original tender total does not match order total");
  }
  if (input.walletAlreadyRefundedPaise > input.walletAppliedPaise || input.cashAlreadyRefundedPaise > input.cashPaidPaise) {
    throw new Error("Already-refunded tender exceeds amount collected");
  }

  const walletRemaining = input.walletAppliedPaise - input.walletAlreadyRefundedPaise;
  const cashRemaining = input.cashPaidPaise - input.cashAlreadyRefundedPaise;
  if (input.refundPaise > walletRemaining + cashRemaining) {
    throw new Error("Original tenders do not have enough refundable balance");
  }

  const desiredWallet = Math.floor((input.refundPaise * input.walletAppliedPaise) / input.orderTotalPaise);
  let walletPaise = Math.min(desiredWallet, walletRemaining);
  let cashPaise = Math.min(input.refundPaise - walletPaise, cashRemaining);
  let unallocated = input.refundPaise - walletPaise - cashPaise;

  if (unallocated > 0) {
    const extraWallet = Math.min(unallocated, walletRemaining - walletPaise);
    walletPaise += extraWallet;
    unallocated -= extraWallet;
  }
  if (unallocated > 0) {
    const extraCash = Math.min(unallocated, cashRemaining - cashPaise);
    cashPaise += extraCash;
    unallocated -= extraCash;
  }
  if (unallocated !== 0 || walletPaise + cashPaise !== input.refundPaise) {
    throw new Error("Unable to allocate refund exactly");
  }

  return { walletPaise, cashPaise };
}
