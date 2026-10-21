import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogIn, UserPlus, Sparkles, AlertCircle, ArrowRight, ShieldCheck, Lock, User } from "lucide-react";
import { api } from "../lib/api";
import { Card } from "../components/Layout";

/* Client-side mirror of the server's password policy. The server is the
 * authority — this only gives instant feedback before the round trip. */
function strength(pw: string): { score: number; label: string; tone: string; hints: string[] } {
  const hints: string[] = [];
  let score = 0;
  if (pw.length >= 8) score++; else hints.push("At least 8 characters");
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (classes >= 2) score++; else if (pw) hints.push("Mix two character classes");
  if (pw.length >= 12) score++;
  if (/^(.)\1+$/.test(pw)) { score = 0; hints.push("Not a single repeated character"); }
  const label = score >= 3 ? "Strong" : score === 2 ? "Good" : score === 1 ? "Weak" : "Too weak";
  const tone =
    score >= 3 ? "bg-emerald-500" : score === 2 ? "bg-amber-500" : score === 1 ? "bg-orange-500" : "bg-rose-500";
  return { score, label, tone, hints };
}

export function Auth() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const pw = strength(password);

  async function submit() {
    setErr("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr("Enter a valid email address.");
    if (password.length < 6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const r: any = tab === "login" ? await api.login(email, password) : await api.register(email, password, name);
      api.setToken(r.token);
      if (r.refreshToken) api.setRefreshToken(r.refreshToken);
      nav("/app");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-6 text-center animate-rise">
        <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/30 transition-transform duration-500 hover:scale-105">
          <Sparkles size={26} />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-body">Your research, private to you</h1>
        <p className="mt-1.5 text-sm text-muted">
          Create an account to keep your analyses and bookmarks across devices — or keep browsing as a guest.
        </p>
      </div>

      <Card className="animate-rise" >
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

        {/* noValidate: the component runs its own validation and shows
            purpose-built messages; the browser's native bubbles would
            pre-empt them with a generic tooltip. */}
        <form onSubmit={(e) => { e.preventDefault(); if (!busy) submit(); }} className="space-y-3" noValidate>
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
              id="password" className="input" type="password"
              placeholder={tab === "register" ? "At least 8 characters" : "Your password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
            {tab === "register" && password.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${pw.tone}`}
                      style={{ width: `${(pw.score / 3) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-muted">{pw.label}</span>
                </div>
                {pw.hints.length > 0 && (
                  <p className="mt-1 text-[11px] text-faint">{pw.hints.join(" · ")}</p>
                )}
              </div>
            )}
          </div>

          {err && (
            <p className="field-error flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {err}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? (
              <>Please wait…</>
            ) : tab === "login" ? (
              <>Log in to your account <ArrowRight size={15} /></>
            ) : (
              <>Create your account <ArrowRight size={15} /></>
            )}
          </button>
        </form>

        <div className="card-inset mt-5 flex items-start gap-2.5 text-xs leading-relaxed text-muted">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            Guest uploads merge into your account automatically when you log in — nothing is lost.
          </span>
        </div>
      </Card>

      <p className="mt-4 text-center text-sm">
        <Link to="/app" className="link inline-flex items-center gap-1.5">
          <User size={14} /> Continue as guest →
        </Link>
      </p>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-faint">
        <Lock size={12} /> Passwords are hashed with bcrypt. Access tokens are short-lived and refresh
        tokens are single-use.
      </p>
    </div>
  );
}
