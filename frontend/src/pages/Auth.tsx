import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogIn, UserPlus, Sparkles, AlertCircle, ArrowRight, ShieldCheck, Lock } from "lucide-react";
import { api } from "../lib/api";
import { Card } from "../components/Layout";

export function Auth() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr("Enter a valid email address.");
    if (password.length < 6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const r: any = tab === "login" ? await api.login(email, password) : await api.register(email, password, name);
      api.setToken(r.token);
      nav("/app");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-6 text-center">
        <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/30">
          <Sparkles size={26} />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-body">Your research, private to you</h1>
        <p className="mt-1.5 text-sm text-muted">
          Log in to keep your upload history and bookmarks across devices. Or browse as a guest.
        </p>
      </div>

      <Card>
        <div className="segment mb-5">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setErr(""); }}
              className={`segment-item ${tab === t ? "segment-item-active" : ""}`}
            >
              {t === "login" ? <LogIn size={15} /> : <UserPlus size={15} />}
              {t === "login" ? "Log in" : "Create account"}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (!busy) submit(); }}
          className="space-y-3"
        >
          {tab === "register" && (
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input
                id="name" className="input" placeholder="Ada Lovelace"
                value={name} onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email" className="input" type="email" placeholder="you@university.edu"
              value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password" className="input" type="password" placeholder="At least 6 characters"
              value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
          </div>

          {err && (
            <p className="field-ok flex items-start gap-2 !border-rose-200 !bg-rose-50 !text-rose-700 dark:!border-rose-500/30 dark:!bg-rose-500/10 dark:!text-rose-300">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {err}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Please wait…" : tab === "login" ? "Log in" : "Create account"}
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>

        <div className="card-inset mt-5 flex items-start gap-2.5 text-xs leading-relaxed text-muted">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Guest uploads merge into your account automatically when you log in.</span>
        </div>
      </Card>

      <p className="mt-4 text-center text-sm">
        <Link to="/app" className="link">Continue as guest →</Link>
      </p>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-faint">
        <Lock size={12} /> Passwords are hashed with bcrypt. Tokens expire after 7 days.
      </p>
    </div>
  );
}
