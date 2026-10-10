import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogIn, UserPlus, Sparkles } from "lucide-react";
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr("Enter a valid email.");
    if (password.length < 6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const r: any = tab === "login" ? await api.login(email, password) : await api.register(email, password, name);
      api.setToken(r.token);
      nav("/app");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-5 text-center">
        <span className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Sparkles size={22} /></span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Your research, private to you</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Login to see your upload history on any device. Without login you browse as a guest.</p>
      </div>
      <Card>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {(["login", "register"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setErr(""); }} className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${tab === t ? "bg-white shadow dark:bg-white/10" : "text-slate-500"}`}>
              {t === "login" ? <LogIn size={15} /> : <UserPlus size={15} />} {t === "login" ? "Login" : "Register"}
            </button>
          ))}
        </div>
        {tab === "register" && <input className="input mb-2" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />}
        <input className="input mb-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <input className="input" placeholder="Password (min 6 chars)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <p className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{err}</p>}
        <button className="btn-primary mt-3 w-full justify-center" disabled={busy} onClick={submit}>{busy ? "Please wait…" : tab === "login" ? "Login" : "Create account"}</button>
        <p className="mt-3 text-center text-xs text-slate-500">Guest uploads merge into your account automatically on login.</p>
      </Card>
      <p className="mt-3 text-center text-sm text-slate-500"><Link to="/app" className="underline">Continue as guest →</Link></p>
    </div>
  );
}
