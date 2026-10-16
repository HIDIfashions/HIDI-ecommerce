"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "./staff.module.css";

type StaffRole = "OWNER" | "OPERATIONS" | "SUPPORT" | "CATALOG";

type Staff = {
  id: string;
  email: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  authSubject?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

const ROLES: StaffRole[] = ["OWNER", "OPERATIONS", "SUPPORT", "CATALOG"];

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AdminStaffClient() {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("OPERATIONS");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/staff", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace("/admin/sign-in");
        return;
      }
      if (!response.ok) throw new Error(body?.message ?? "Unable to load admin staff");
      setStaff(body.staff ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load admin staff");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email, role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to add staff member");
      setDisplayName("");
      setEmail("");
      setRole("OPERATIONS");
      setNotice("Staff member added. They can now sign in with their verified email.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add staff member");
    } finally {
      setSaving(false);
    }
  }

  async function updateStaff(member: Staff, changes: Partial<Pick<Staff, "role" | "active" | "displayName">>) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/staff/${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to update staff member");
      setNotice("Admin access updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update staff member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>HIDI ADMIN</p>
          <AdminNav />
        </div>
        <button type="button" onClick={() => void fetch("/api/admin/session", { method: "DELETE" }).then(() => router.replace("/admin/sign-in"))}>
          Sign out
        </button>
      </header>

      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ACCESS CONTROL</p>
          <h1>Staff & roles</h1>
          <p>Only HIDI Owners can add staff or change permissions.</p>
        </div>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.grid}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>ADD STAFF</p>
          <h2>Authorize a staff account</h2>
          <form className={styles.form} onSubmit={createStaff}>
            <label>
              <span>Name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={120} placeholder="Team member name" />
            </label>
            <label>
              <span>Verified email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="name@hidi.in" />
            </label>
            <label>
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>
                {ROLES.map((option) => <option key={option} value={option}>{label(option)}</option>)}
              </select>
            </label>
            <button type="submit" disabled={saving}>{saving ? "Saving…" : "Add staff"}</button>
          </form>
          <div className={styles.roleHelp}>
            <span><strong>Owner</strong> Full access including staff management.</span>
            <span><strong>Operations</strong> Orders, returns, refunds, inventory and follow-ups.</span>
            <span><strong>Support</strong> Read-only customer/order support access.</span>
            <span><strong>Catalog</strong> Products, SKU media and catalog maintenance.</span>
          </div>
        </section>

        <section className={styles.card}>
          <p className={styles.eyebrow}>AUTHORIZED STAFF</p>
          <h2>{loading ? "Loading…" : `${staff.length} account${staff.length === 1 ? "" : "s"}`}</h2>
          <div className={styles.list}>
            {staff.map((member) => (
              <article className={styles.member} key={member.id}>
                <div className={styles.memberTop}>
                  <div>
                    <strong>{member.displayName}</strong>
                    <span>{member.email}</span>
                  </div>
                  <span className={member.active ? styles.active : styles.inactive}>{member.active ? "Active" : "Disabled"}</span>
                </div>
                <div className={styles.memberMeta}>
                  <span>Identity: {member.authSubject ? "Linked" : "Awaiting first sign-in"}</span>
                  <span>Last sign-in: {dateTime(member.lastLoginAt)}</span>
                </div>
                <div className={styles.actions}>
                  <label>
                    <span>Role</span>
                    <select
                      value={member.role}
                      disabled={saving}
                      onChange={(event) => void updateStaff(member, { role: event.target.value as StaffRole })}
                    >
                      {ROLES.map((option) => <option key={option} value={option}>{label(option)}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void updateStaff(member, { active: !member.active })}
                  >
                    {member.active ? "Disable access" : "Restore access"}
                  </button>
                </div>
              </article>
            ))}
            {!loading && staff.length === 0 && <p>No staff accounts yet.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
