export const hidiEndpoints = {
  products: "/products",
  featured: "/products/featured",
  bestSellers: "/products/best-sellers",
  product: (slug: string) => "/products/" + encodeURIComponent(slug),
  related: (slug: string) => "/products/" + encodeURIComponent(slug) + "/related",
  cart: (sessionId: string) => "/carts/" + encodeURIComponent(sessionId),
  cartItems: (sessionId: string) => "/carts/" + encodeURIComponent(sessionId) + "/items",
  cartItem: (sessionId: string, itemId: string) =>
    "/carts/" + encodeURIComponent(sessionId) + "/items/" + encodeURIComponent(itemId),
  serviceability: (pin: string) => "/checkout/delivery-serviceability?pin=" + encodeURIComponent(pin),
  prepareCheckout: "/checkout/prepare",
  checkoutOrders: (sessionId: string) => "/checkout/orders?sessionId=" + encodeURIComponent(sessionId),
  confirmation: (orderNumber: string, sessionId: string) =>
    "/checkout/confirmation/" + encodeURIComponent(orderNumber) + "?sessionId=" + encodeURIComponent(sessionId),
  paymentVerify: "/payments/razorpay/verify",
  accountOrders: "/account/orders",
  accountOrder: (orderNumber: string) => "/account/orders/" + encodeURIComponent(orderNumber),
  productReviews: (productId: string) => "/reviews/products/" + encodeURIComponent(productId),
  retentionPreferences: "/retention/preferences",
  retentionEvents: "/retention/events",
  rewardsSummary: "/rewards/summary",
  wallet: "/wallet",
} as const;
