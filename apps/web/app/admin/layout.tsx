import type { Metadata } from 'next';
import { AdminWorkspace } from '@/components/admin/admin-workspace';
export const metadata: Metadata = { title: 'Admin | HIDI', robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) { return <AdminWorkspace>{children}</AdminWorkspace>; }
