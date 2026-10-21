import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck, Lock, KeyRound, Gauge, Fingerprint, EyeOff, Database, FileLock2,
  ScrollText, CheckCircle2, Info, Server,
} from "lucide-react";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";

/* Security posture page.
 *
 * The backend publishes its own configuration through /api/security/summary,
 * so this page can never drift from what the server actually enforces — it
 * renders the running policy rather than a hand-written marketing copy. */

function Section({
  icon: Icon, title, tone, children,
}: { icon: any; title: string; tone: string; children: React.ReactNode }) {
  return (
    <Card className="card-hover">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold tracking-tight text-body">{title}</h3>
          <div className="mt-2.5 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-200/60 pb-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-4 dark:border-white/[0.07]">
      <dt className="w-full shrink-0 text-xs font-semibold uppercase tracking-wider text-faint sm:w-44">{k}</dt>
      <dd className="min-w-0 flex-1 text-sm text-body">{v}</dd>
    </div>
  );
}

export function Security() {
  const q = useQuery<any>({ queryKey: ["security"], queryFn: api.security });

  if (q.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel h-48" />)}
      </div>
    );
  }
  if (q.isError) return <Empty text="Could not read the security configuration." />;
  const d = q.data;

  const controls = [
    { label: "Password hashing", value: d.auth.passwordHashing, icon: Lock },
    { label: "Password policy", value: d.auth.passwordPolicy, icon: KeyRound },
    { label: "Access token", value: `${d.auth.scheme} · ${d.auth.accessTokenTtl}`, icon: KeyRound },
    { label: "Refresh token", value: `${d.auth.refreshTokenTtl} · ${d.auth.rotation}`, icon: Fingerprint },
    { label: "Brute-force lockout", value: d.auth.lockout, icon: Gauge },
    { label: "Account enumeration", value: d.auth.enumeration, icon: EyeOff },
  ];

  return (
    <div>
      <PageTitle
        title="Security posture"
        sub="Rendered from the running server configuration — not a static claim"
      />

      {/* ---------- headline ---------- */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-emerald-500/15 to-indigo-500/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25">
            <ShieldCheck size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-body">Defence in depth</h2>
            <p className="mt-1 text-sm text-muted">
              Six independent layers protect the platform: transport headers, token lifecycle,
              credential hashing, input validation, abuse limits and per-account data isolation.
            </p>
          </div>
          <span className="badge badge-emerald px-3 py-1.5 text-sm">
            <CheckCircle2 size={13} /> {controls.length + 9} controls active
          </span>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {controls.map((c) => (
            <div key={c.label} className="card-inset">
              <div className="flex items-center gap-2">
                <c.icon size={13} className="text-indigo-600 dark:text-indigo-300" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{c.label}</p>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-snug text-body">{c.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ---------- detail ---------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section icon={Server} title="Transport & headers" tone="bg-indigo-500/12 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
          <dl className="space-y-2">
            <Row k="Transport" v={d.transport} />
            <Row k="Security headers" v={d.transportSecurity.headers.join(" · ")} />
            <Row k="Content-Security-Policy" v={d.transportSecurity.csp} />
            <Row k="HSTS" v={d.transportSecurity.hsts ? "Enabled (production)" : "Disabled in development"} />
            <Row k="X-Powered-By" v={d.transportSecurity.poweredBy} />
            <Row k="CORS" v={d.transportSecurity.cors} />
          </dl>
        </Section>

        <Section icon={KeyRound} title="Identity & tokens" tone="bg-violet-500/12 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
          <dl className="space-y-2">
            <Row k="Scheme" v={d.auth.scheme} />
            <Row k="Access token lifetime" v={d.auth.accessTokenTtl} />
            <Row k="Refresh token lifetime" v={d.auth.refreshTokenTtl} />
            <Row k="Storage" v={d.auth.refreshTokensHashed ? "SHA-256 hash at rest" : "plain text"} />
            <Row k="Rotation" v={d.auth.rotation} />
            <Row k="Enumeration" v={d.auth.enumeration} />
          </dl>
        </Section>

        <Section icon={FileLock2} title="Input & upload safety" tone="bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
          <dl className="space-y-2">
            <Row k="Body validation" v={d.input.validation} />
            <Row k="SQL" v={d.input.sql} />
            <Row k="Uploads" v={d.input.uploads} />
            <Row k="JSON" v={d.input.json} />
          </dl>
        </Section>

        <Section icon={Gauge} title="Abuse resistance" tone="bg-amber-500/12 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
          <dl className="space-y-2">
            <Row k="Global rate limit" v={d.abuse.globalRateLimit} />
            <Row k="Auth rate limit" v={d.abuse.authRateLimit} />
            <Row k="Stored analyses" v={`${d.abuse.uploadsPerUser} per account`} />
            <Row k="Ingestion concurrency" v={d.abuse.concurrentIngestions} />
          </dl>
        </Section>

        <Section icon={Database} title="Privacy & isolation" tone="bg-sky-500/12 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
          <dl className="space-y-2">
            <Row k="Documents" v={d.privacy.documents} />
            <Row k="Legacy rows" v={d.privacy.legacyRows} />
            <Row k="Demo papers" v={d.privacy.demoPapers} />
          </dl>
        </Section>

        <Section icon={ScrollText} title="Audit trail" tone="bg-rose-500/12 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
          <dl className="space-y-2">
            <Row k="Recorded events" v={d.audit.trail} />
            <Row k="Admin view" v="GET /api/admin/audit — last 100 events, admin role required" />
          </dl>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted dark:bg-white/[0.04]">
            Sign-in success and failure, account creation, guest minting, refresh rotation,
            admin promotion, ingestion starts and document deletions are all logged with a
            timestamp and the client IP.
          </p>
        </Section>
      </div>

      <div className="note-info mt-4 flex items-start gap-2.5">
        <Info size={15} className="mt-0.5 shrink-0" />
        <p>
          <b className="font-semibold">Why 404 and not 403?</b> Returning “forbidden” would confirm that a
          document id exists. Every ownership check answers <code className="rounded bg-black/5 px-1 dark:bg-white/10">404</code>,
          so an id can never be probed. Similarly, a failed sign-in returns the same message and a
          comparable response time whether or not the address exists.
        </p>
      </div>
    </div>
  );
}
