import { Suspense } from 'react';
import { AdminQueue } from '@/components/admin/admin-queue';
export const dynamic = 'force-dynamic';
export default function DeliveriesPage() { return <Suspense fallback={<p>Loading deliveries…</p>}><AdminQueue kind="deliveries"/></Suspense>; }
