'use client';
import { useCallback, useEffect, useState } from 'react';

export type Staff = { id: string; displayName: string; email: string | null; role: 'OWNER' | 'OPERATIONS' | 'SUPPORT' | 'CATALOG' };
export type OrderRow = { id: string; orderNumber: string; status: string; totalPaise: number; createdAt: string; customerPhone: string; customerEmail?: string | null; itemCount: number; payments: { status: string }[]; shipments: { provider: string | null; awb: string | null; status: string; shippedAt: string | null; deliveredAt: string | null; updatedAt: string }[] };
export type ReturnRow = { id: string; type: string; status: string; reason: string; quantity: number; refundPaise: number; createdAt: string; order: { orderNumber: string; customerPhone: string }; orderItem: { productName: string; size: string } };
export type SeriesRow = { day: string; orders: number; salesPaise: number; previousSalesPaise: number; previousOrders: number };
export type Overview = { asOf: string; period: { from: string; to: string; days: number }; metrics: { salesPaise: number; previousSalesPaise: number; salesChange: number | null; orders: number; ordersChange: number | null; aovPaise: number; processedCashRefundsPaise: number; pendingReturns: number; lowStock: number }; series: SeriesRow[]; pipeline: { status: string; count: number }[]; recentOrders: OrderRow[]; bestsellers: { productId: string; name: string; quantity: number; salesPaise: number }[]; definitions: Record<string, string> };
export type Queue = { kind: string; page: number; pageSize: number; total: number; rows: OrderRow[] | ReturnRow[]; asOf: string };
let refreshing: Promise<boolean> | null = null;
export async function refreshAdminSession() {
  if (!refreshing) refreshing = fetch('/api/admin/session', { method: 'PUT', cache: 'no-store' }).then(r => r.ok).catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
}
export class AdminError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function adminFetch<T>(path: string, signal?: AbortSignal, retry = true): Promise<T> {
  if (!path.startsWith('/api/admin/')) throw new Error('Invalid admin request');
  const response = await fetch(path, { cache: 'no-store', signal, headers: { Accept: 'application/json' } });
  if (response.status === 401 && retry && await refreshAdminSession()) return adminFetch<T>(path, signal, false);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('hidi-admin-expired'));
    throw new AdminError(response.status === 403 ? 'Your role does not have access to this view.' : (typeof body.message === 'string' ? body.message : 'Unable to load this view. Please retry.'), response.status);
  }
  return body as T;
}
export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setError(null); setData(null);
    void adminFetch<T>(path, controller.signal).then(body => { if (active) setData(body); }).catch(err => { if (active && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load data'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [path, revision]);
  return { data, error, loading, reload };
}
export const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
export const count = (n: number) => new Intl.NumberFormat('en-IN').format(n);
export const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase());
export const when = (value: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export function startForDays(days: number, end = today()) { return new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10); }
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(value => {
    let text = String(value); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
