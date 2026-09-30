type PreviewEnvironment = Record<string, string | undefined>;

/** Migration controls only; normal controller authentication/ownership checks still apply. */
export function migrationPreviewPolicy(env: PreviewEnvironment = process.env) {
  const restricted = env.MIGRATION_READ_ONLY === "true";
  const customerTesting = env.MIGRATION_CUSTOMER_TESTING === "true";
  if (customerTesting && (!restricted || env.AZURE_SQL_DATABASE !== "hidi-sql-validation")) {
    throw new Error("Customer preview testing requires the isolated validation database and migration guard");
  }

  return {
    restricted,
    message: customerTesting
      ? "This test store supports sign-in, account viewing and bag testing only. Orders and payments are unavailable."
      : "This preview is available for catalogue viewing only.",
    allows(method: string, url: string) {
      if (!restricted) return true;
      const path = url.split("?", 1)[0];
      const read = method === "GET" || method === "HEAD";
      if (method === "OPTIONS") return true;
      if (read && /^\/v1\/(health|products|reviews\/products)(\/|$)/.test(path)) return true;
      if (!customerTesting) return false;

      if (read && path === "/v1/auth/config") return true;
      if (method === "POST" && /^\/v1\/auth\/(otp\/(request|verify)|refresh|logout)$/.test(path)) return true;

      // Explicit read-only staff views. Every route still runs AdminGuard and
      // its role permissions. Do not allow all admin GETs: carrier tracking
      // endpoints may synchronize shipment/order state as a side effect.
      if (read && /^\/v1\/admin\/(me|staff|dashboard\/(overview|queue|search)|orders(?:\/[A-Za-z0-9_-]+)?|products(?:\/[A-Za-z0-9_-]+)?|inventory(?:\/receipts|\/[A-Za-z0-9_-]+\/history)?)$/.test(path)) return true;

      // These controllers verify the bearer token and record ownership.
      if (read && /^\/v1\/(account\/orders(?:\/[A-Za-z0-9_-]+)?|wallet|rewards\/summary|retention\/preferences)$/.test(path)) return true;

      // Guest carts are scoped to an unguessable session ID, as in the live store.
      const cart = "/v1/carts/[A-Za-z0-9_-]{8,128}";
      if (read && new RegExp(`^${cart}$`).test(path)) return true;
      if (method === "POST" && new RegExp(`^${cart}/items$`).test(path)) return true;
      return (method === "PATCH" || method === "DELETE")
        && new RegExp(`^${cart}/items/[A-Za-z0-9_-]{1,128}$`).test(path);
    },
  };
}
