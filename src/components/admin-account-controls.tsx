"use client";
import { useCallback, useEffect, useState } from "react";

type Account = { id: string; name: string; email: string; role: string; onboarded: boolean; loginProviders: string[]; activeSessions: number; isSelf: boolean };
type Overview = { total: number; limit: number; remaining: number; page: number; pageSize: number; accounts: Account[] };

export function AdminAccountControls() {
  const [page, setPage] = useState(1), [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [confirmAccount, setConfirmAccount] = useState<Account | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const timeout = AbortSignal.timeout(15000);
      const response = await fetch(`/api/admin/accounts?page=${page}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error || "Could not load accounts.");
      setData(payload);
    } catch (cause) { if (!(cause instanceof Error && cause.name === "AbortError")) setError("Could not load account access. Please retry."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [page]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function act(account: Account, action: "reset" | "revoke") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(action === "reset" ? `/api/admin/users/${encodeURIComponent(account.id)}/password-reset` : "/api/admin/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000),
        body: JSON.stringify(action === "reset" ? {} : { userId: account.id, action: "revoke_sessions", confirmed: true }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw Error(result.error || "Action could not be confirmed.");
      setMessage(`${account.email}: ${result.message}`); setConfirmAccount(null); await load();
    } catch (cause) { setError(cause instanceof Error && cause.name === "TimeoutError" ? "The outcome is unknown. Refresh before retrying." : cause instanceof Error ? cause.message : "Action could not be confirmed."); }
    finally { setBusy(false); }
  }

  return <section className="card space-y-4" aria-labelledby="account-access-title">
    <h2 id="account-access-title" className="font-display text-xl font-bold">Registered accounts and sign-in access</h2>
    <p className="text-sm">All roles count toward the free JMM pilot limit: athletes, coaches and administrators. External services may have their own costs. Passwords cannot be viewed; recovery emails let users set their own password.</p>
    {data && <p className="font-semibold">{data.total} / {data.limit} registered accounts · {data.remaining} places remaining</p>}
    <button type="button" className="btn-secondary" disabled={busy || loading} onClick={() => void load()}>Refresh accounts</button>
    {loading && <p role="status">Loading account access…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status">{message}</p>}
    <div className="space-y-3">{data?.accounts.map(account => <article key={account.id} className="border rounded-lg p-3 space-y-2">
      <h3 className="font-semibold">{account.name} {account.isSelf ? "(you)" : ""}</h3><p className="text-sm break-all">{account.email}</p>
      <p className="text-sm">{account.role} · Setup {account.onboarded ? "completed" : "not completed"} · {account.activeSessions} unexpired sessions</p>
      <p className="text-sm">Linked social sign-in: {account.loginProviders.length ? account.loginProviders.join(", ") : "none"}. Email password recovery is available separately.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy || loading} onClick={() => void act(account, "reset")}>Send password-reset email</button>
      <button type="button" className="btn-secondary" disabled={busy || loading || account.isSelf} onClick={() => { setConfirmAccount(account); setMessage(""); }}>Revoke existing sessions</button></div>
    </article>)}</div>
    {confirmAccount && <div role="group" aria-label="Confirm session revocation" className="border border-amber-400 rounded-lg p-4 space-y-3">
      <p>Revoke all current sessions for <strong>{confirmAccount.email}</strong>? They can sign in again. This does not suspend the account or disconnect devices.</p>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void act(confirmAccount, "revoke")}>Confirm revocation</button>{" "}<button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmAccount(null)}>Cancel</button>
    </div>}
    {data && <div className="flex gap-3 items-center"><button type="button" className="btn-secondary" disabled={busy || loading || page <= 1} onClick={() => { setConfirmAccount(null); setPage(page - 1); }}>Previous</button><span>Page {page}</span><button type="button" className="btn-secondary" disabled={busy || loading || page * data.pageSize >= data.total} onClick={() => { setConfirmAccount(null); setPage(page + 1); }}>Next</button></div>}
  </section>;
}
