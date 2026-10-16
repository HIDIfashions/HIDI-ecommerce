import { Suspense } from 'react';
import { AdminQueue } from '@/components/admin/admin-queue';
export const dynamic = 'force-dynamic';
export default function ReturnsPage() { return <Suspense fallback={<p>Loading returns…</p>}><AdminQueue kind="returns"/></Suspense>; }
