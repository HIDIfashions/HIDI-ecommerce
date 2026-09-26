"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "./customers.module.css";

type OrderItem = {
  productName: string;
  quantity: number;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  totalPaise: number;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
  } | null;
  items?: OrderItem[];
};

type FollowUpRecord = {
  contactedAt: string;
  channel?: "WHATSAPP" | "SMS" | "EMAIL" | "MANUAL";
};

type FollowUpStore = Record<string, FollowUpRecord>;

type ServerFollowUp = {
  id: string;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELLED";
  dueAt: string;
  sentAt?: string | null;
  attempts: number;
  lastError?: string | null;
  order: {
    orderNumber: string;
  };
};

type Customer = {
  key: string;
  name: string;
  phone: string;
  email: string;
  orders: number;
  lifetimePaise: number;
  lastPurchaseAt: string;
  lastPurchasePaise: number;
  lastProducts: string;
  lastOrderNumber: string;
  lastOrderStatus: string;
};

const FOLLOWUP_KEY = "hidi_customer_review_followups_v1";
const REVIEW_DELAY_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function reviewDueAt(customer: Customer) {
  return new Date(new Date(customer.lastPurchaseAt).getTime() + REVIEW_DELAY_DAYS * DAY_MS);
}

function remainingDays(customer: Customer) {
  const ms = reviewDueAt(customer).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / DAY_MS));
}

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function reviewMessage(customer: Customer) {
  return `Hi ${firstName(customer.name)}, thank you for shopping with HIDI. We hope you're loving ${customer.lastProducts}. We'd really value your review—it helps us improve and helps other customers shop with confidence. Thank you, HIDI.`;
}

function whatsappUrl(customer: Customer) {
  const phone = normalizeIndianPhone(customer.phone);
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(reviewMessage(customer))}` : "";
}

function smsUrl(customer: Customer) {
  const phone = normalizeIndianPhone(customer.phone);
  return phone ? `sms:+${phone}?body=${encodeURIComponent(reviewMessage(customer))}` : "";
}

function emailUrl(customer: Customer) {
  if (!customer.email) return "";
  const subject = "How was your HIDI purchase?";
  return `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reviewMessage(customer))}`;
}

function loadFollowUps(): FollowUpStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOLLOWUP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as FollowUpStore : {};
  } catch {
    return {};
  }
}

function saveFollowUps(value: FollowUpStore) {
  window.localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(value));
}

export function AdminCustomersClient() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<"ALL" | "READY" | "WAITING" | "CONTACTED">("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpStore>({});
  const [serverFollowUps, setServerFollowUps] = useState<Record<string, ServerFollowUp>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersResponse, followUpsResponse] = await Promise.all([
        fetch("/api/admin/orders", { cache: "no-store" }),
        fetch("/api/admin/review-followups", { cache: "no-store" }),
      ]);
      const ordersBody = await ordersResponse.json().catch(() => ({}));
      const followUpsBody = await followUpsResponse.json().catch(() => ([]));

      if (ordersResponse.status === 401 || followUpsResponse.status === 401) {
        setAuthenticated(false);
        setOrders([]);
        setServerFollowUps({});
        return;
      }
      if (!ordersResponse.ok) throw new Error(ordersBody?.message ?? "Unable to load customers");
      if (!followUpsResponse.ok) throw new Error(followUpsBody?.message ?? "Unable to load review follow-ups");

      setAuthenticated(true);
      setOrders(ordersBody.orders ?? []);
      setServerFollowUps(Object.fromEntries(
        (Array.isArray(followUpsBody) ? followUpsBody : []).map((item: ServerFollowUp) => [item.order.orderNumber, item]),
      ));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setFollowUps(loadFollowUps());
    void load();
  }, [load]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    const key = draftKey.trim();
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to sign in");
      setDraftKey("");
      await load();
    } catch (caught) {
      setAuthenticated(false);
      setError(caught instanceof Error ? caught.message : "Unable to sign in");
      setLoading(false);
    }
  }

  async function lock() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    setAuthenticated(false);
    setOrders([]);
  }

  const customers = useMemo(() => {
    const byCustomer = new Map<string, Customer>();

    for (const order of [...orders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
      const phone = String(order.customerPhone ?? "").trim();
      const email = String(order.customerEmail ?? "").trim();
      const key = phone || email.toLowerCase() || order.id;
      const address = order.shippingAddress ?? {};
      const name = [address.firstName, address.lastName].filter(Boolean).join(" ") || "Customer";
      const products = (order.items ?? [])
        .map((item) => `${item.productName}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`)
        .join(", ");

      const current = byCustomer.get(key);
      if (!current) {
        byCustomer.set(key, {
          key,
          name,
          phone,
          email,
          orders: 1,
          lifetimePaise: order.totalPaise,
          lastPurchaseAt: order.createdAt,
          lastPurchasePaise: order.totalPaise,
          lastProducts: products || "—",
          lastOrderNumber: order.orderNumber,
          lastOrderStatus: order.status,
        });
      } else {
        current.orders += 1;
        current.lifetimePaise += order.totalPaise;
      }
    }

    return Array.from(byCustomer.values()).sort(
      (a, b) => +new Date(b.lastPurchaseAt) - +new Date(a.lastPurchaseAt),
    );
  }, [orders]);

  function followUpState(customer: Customer) {
    const server = serverFollowUps[customer.lastOrderNumber];
    if (server?.status === "SENT") return "CONTACTED" as const;
    if (followUps[customer.key]) return "CONTACTED" as const;
    if (customer.lastOrderStatus !== "DELIVERED") return "WAITING" as const;
    if (reviewDueAt(customer).getTime() <= Date.now()) return "READY" as const;
    return "WAITING" as const;
  }

  function followUpLabel(customer: Customer, state: ReturnType<typeof followUpState>) {
    const server = serverFollowUps[customer.lastOrderNumber];
    if (server?.status === "SENT") return "Email sent";
    if (server?.status === "FAILED") return "Retry queued";
    if (state === "CONTACTED") return "Contacted";
    if (customer.lastOrderStatus !== "DELIVERED") return "Waiting delivery";
    if (state === "READY") return "Ready now";
    const days = remainingDays(customer);
    return `In ${days} day${days === 1 ? "" : "s"}`;
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const server = serverFollowUps[customer.lastOrderNumber];
      const state = server?.status === "SENT" || followUps[customer.key]
        ? "CONTACTED"
        : customer.lastOrderStatus === "DELIVERED" && reviewDueAt(customer).getTime() <= Date.now()
          ? "READY"
          : "WAITING";
      if (reviewFilter !== "ALL" && state !== reviewFilter) return false;
      if (!needle) return true;
      return [customer.name, customer.phone, customer.email, customer.lastProducts, customer.lastOrderNumber]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [customers, followUps, query, reviewFilter, serverFollowUps]);

  const readyCount = customers.filter((customer) => followUpState(customer) === "READY").length;
  const contactedCount = customers.filter((customer) => followUpState(customer) === "CONTACTED").length;
  const visibleSelectable = filtered.filter((customer) => followUpState(customer) !== "WAITING").map((customer) => customer.key);
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((key) => selected.includes(key));

  function markContacted(keys: string[], channel: FollowUpRecord["channel"] = "MANUAL") {
    if (!keys.length) return;
    const now = new Date().toISOString();
    const next = { ...followUps };
    for (const key of keys) next[key] = { contactedAt: now, channel };
    setFollowUps(next);
    saveFollowUps(next);
    setSelected((current) => current.filter((key) => !keys.includes(key)));
    setNotice(`${keys.length} customer${keys.length === 1 ? "" : "s"} marked as followed up.`);
  }

  function resetFollowUp(key: string) {
    const next = { ...followUps };
    delete next[key];
    setFollowUps(next);
    saveFollowUps(next);
    setNotice("Review follow-up reset.");
  }

  async function runAutomation() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/review-followups/run", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to run review automation");
      if (body?.skipped) {
        setNotice(`Automation skipped: ${String(body.reason ?? "not configured").replaceAll("_", " ")}.`);
      } else {
        setNotice(`Automation checked. ${body.sent ?? 0} email${body.sent === 1 ? "" : "s"} sent, ${body.failed ?? 0} failed.`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to run review automation");
    } finally {
      setLoading(false);
    }
  }

  async function copyMessage(customer: Customer) {
    try {
      await navigator.clipboard.writeText(reviewMessage(customer));
      setNotice(`Review message copied for ${customer.name}.`);
    } catch {
      setNotice("Unable to copy automatically. Use WhatsApp, SMS or email instead.");
    }
  }

  if (authenticated === null) {
    return <main className={styles.loginPage}><section className={styles.loginCard}>Checking admin session…</section></main>;
  }

  if (!authenticated) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.loginCard}>
          <p className={styles.eyebrow}>HIDI OPERATIONS</p>
          <h1>Admin access</h1>
          <p>Use your verified HIDI staff email for role-based access.</p>\n          <p><a href="/admin/sign-in">Staff sign in →</a></p>\n          <small>Development / break-glass key:</small>
          {error && <div className={styles.error}>{error}</div>}
          <form onSubmit={unlock}>
            <input type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Admin key" autoFocus />
            <button disabled={loading}>{loading ? "Opening…" : "Open dashboard"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>HIDI ADMIN</p>
          <AdminNav />
        </div>
        <button type="button" onClick={() => void lock()}>Lock admin</button>
      </header>

      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CUSTOMER RELATIONSHIPS</p>
          <h1>Customers</h1>
          <p>Purchase history, review follow-up and recent product context in one place.</p>
        </div>
        <div className={styles.headingActions}>
          <button type="button" onClick={() => void runAutomation()} disabled={loading}>Run automation now</button>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      <section className={styles.stats}>
        <div><span>Customers</span><strong>{customers.length}</strong></div>
        <div><span>Review ready</span><strong>{readyCount}</strong></div>
        <div><span>Followed up</span><strong>{contactedCount}</strong></div>
        <div><span>Lifetime sales</span><strong>{money(customers.reduce((sum, customer) => sum + customer.lifetimePaise, 0))}</strong></div>
      </section>

      <section className={styles.toolbar}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customer, mobile, email, order or product"
        />
        <label>
          <span>Review</span>
          <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)}>
            <option value="ALL">All customers</option>
            <option value="READY">Ready to contact</option>
            <option value="WAITING">Waiting 3 days</option>
            <option value="CONTACTED">Contacted</option>
          </select>
        </label>
        <span>{filtered.length} customer{filtered.length === 1 ? "" : "s"}</span>
      </section>

      {selected.length > 0 && (
        <section className={styles.batchBar}>
          <strong>{selected.length} selected</strong>
          <span>Use individual channel buttons to send. Batch marking records your follow-up status in this browser.</span>
          <button type="button" onClick={() => markContacted(selected)}>Mark selected contacted</button>
          <button type="button" onClick={() => setSelected([])}>Clear</button>
        </section>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <section className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th className={styles.checkColumn}>
                <input
                  type="checkbox"
                  aria-label="Select visible customers ready for follow-up"
                  checked={allVisibleSelected}
                  onChange={(event) => {
                    setSelected((current) => event.target.checked
                      ? Array.from(new Set([...current, ...visibleSelectable]))
                      : current.filter((key) => !visibleSelectable.includes(key)));
                  }}
                />
              </th>
              <th>Customer</th>
              <th>Mobile</th>
              <th>Orders</th>
              <th>Lifetime</th>
              <th>Last purchase</th>
              <th>Last amount</th>
              <th>Products</th>
              <th>Review follow-up</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer) => {
              const state = followUpState(customer);
              const record = followUps[customer.key];
              const serverRecord = serverFollowUps[customer.lastOrderNumber];
              const canContact = state !== "WAITING";
              return (
                <tr key={customer.key}>
                  <td className={styles.checkColumn}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${customer.name}`}
                      disabled={!canContact}
                      checked={selected.includes(customer.key)}
                      onChange={(event) => setSelected((current) =>
                        event.target.checked
                          ? [...current, customer.key]
                          : current.filter((key) => key !== customer.key))}
                    />
                  </td>
                  <td><strong>{customer.name}</strong><small>{customer.email || "No email"}</small><small>{customer.lastOrderNumber}</small></td>
                  <td>{customer.phone || "—"}</td>
                  <td>{customer.orders}</td>
                  <td>{money(customer.lifetimePaise)}</td>
                  <td>{dateTime(customer.lastPurchaseAt)}</td>
                  <td>{money(customer.lastPurchasePaise)}</td>
                  <td className={styles.products}>{customer.lastProducts}</td>
                  <td>
                    <div className={styles.followUpCell}>
                      <span className={styles.followUpStatus} data-state={state}>
                        {followUpLabel(customer, state)}
                      </span>
                      {serverRecord?.sentAt && <small>{dateTime(serverRecord.sentAt)} · automatic email</small>}
                      {serverRecord?.status === "FAILED" && serverRecord.lastError && <small>Last send failed · retry scheduled</small>}
                      {!serverRecord?.sentAt && record && <small>{dateTime(record.contactedAt)}{record.channel ? ` · ${record.channel.toLowerCase()}` : ""}</small>}
                      <div className={styles.contactActions}>
                        {customer.phone && state !== "WAITING" && <a href={whatsappUrl(customer)} target="_blank" rel="noreferrer" onClick={() => markContacted([customer.key], "WHATSAPP")}>WhatsApp</a>}
                        {customer.phone && state !== "WAITING" && <a href={smsUrl(customer)} onClick={() => markContacted([customer.key], "SMS")}>SMS</a>}
                        {customer.email && state !== "WAITING" && <a href={emailUrl(customer)} onClick={() => markContacted([customer.key], "EMAIL")}>Email</a>}
                        {state !== "WAITING" && <button type="button" onClick={() => void copyMessage(customer)}>Copy text</button>}
                        {state === "CONTACTED" && !serverRecord?.sentAt && <button type="button" onClick={() => resetFollowUp(customer.key)}>Reset</button>}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && <div className={styles.empty}>No customers match this view.</div>}
      </section>

      <p className={styles.footnote}>
        Automatic email follow-up runs hourly for delivered orders that are at least 3 days old. WhatsApp/SMS remain manual until a messaging provider is connected.
      </p>
    </main>
  );
}
