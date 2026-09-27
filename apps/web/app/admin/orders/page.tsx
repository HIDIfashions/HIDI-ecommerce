import { Suspense } from 'react';
import { AdminQueue } from '@/components/admin/admin-queue';
export const dynamic = 'force-dynamic';
export default function OrdersPage() { return <Suspense fallback={<p>Loading orders…</p>}><AdminQueue kind="orders"/></Suspense>; }
