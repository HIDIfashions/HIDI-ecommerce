'use client';
import Link from 'next/link';
import { useAdminStaff } from './admin-workspace';
/** The workspace provides persistent navigation; legacy pages keep this safe fallback. */
export function AdminNav() { const staff = useAdminStaff(); if (staff) return null; return <nav aria-label="Admin navigation"><Link href="/admin">Admin overview</Link></nav>; }
