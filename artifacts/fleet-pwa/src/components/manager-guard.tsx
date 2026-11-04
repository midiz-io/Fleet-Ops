import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Shield, Lock, Eye, EyeOff, Phone, Hash, LogIn, AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isManagerRole, isHeadOfTeamsRole, isSecurityRole } from "@/lib/roles";

const SESSION_KEY = "fleet_admin_unlocked";
const REMEMBER_KEY = "fleet_manager_remember_me";
const SAVED_PHONE_KEY = "fleet_manager_saved_phone";
const SAVED_PIN_KEY = "fleet_manager_saved_pin";

export function ManagerGuard({ children }: { children: React.ReactNode }) {
  const { user, login, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user && !isManagerRole(user.role)) {
      if (isHeadOfTeamsRole(user.role)) {
        setLocation("/trip-requests");
      } else if (isSecurityRole(user.role)) {
        setLocation("/security-gate");
      } else {
        setLocation("/");
      }
    }
  }, [user, isLoading, setLocation]);

  // Step 1 state - passcode
  const [unlocked, setUnlocked] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) === "1" || localStorage.getItem(SESSION_KEY) === "1";
  });
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [passcodeError, setPasscodeError] = useState("");
  const [passcodeShake, setPasscodeShake] = useState(false);
  const [dots, setDots] = useState(0);

  // Step 2 state - manager login
  const [phone, setPhone] = useState(() => localStorage.getItem(SAVED_PHONE_KEY) || "");
  const [pin, setPin] = useState(() => localStorage.getItem(SAVED_PIN_KEY) || "");
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBER_KEY) === "true");
  const [showPin, setShowPin] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Animated dots
  useEffect(() => {
    if (unlocked) return;
    const t = setInterval(() => setDots(d => (d + 1) % 4), 600);
    return () => clearInterval(t);
  }, [unlocked]);

  // ── STEP 1: Passcode gate ───────────────────────────────────────────────────
  const submitPasscode = () => {
    if (pw.toLowerCase() === "manager") {
      sessionStorage.setItem(SESSION_KEY, "1");
      if (localStorage.getItem(REMEMBER_KEY) === "true") {
        localStorage.setItem(SESSION_KEY, "1");
      }
      setUnlocked(true);
    } else {
      setPasscodeError("Incorrect admin password");
      setPasscodeShake(true);
      setPw("");
      setTimeout(() => { setPasscodeShake(false); setPasscodeError(""); }, 1200);
    }
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_1px_1px,#f97316_1px,transparent_0)] [background-size:32px_32px]" />
        <div className="relative z-10 w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center relative">
              <Shield className="w-10 h-10 text-primary" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-background border border-primary/40 rounded-full flex items-center justify-center">
                <Lock className="w-3 h-3 text-primary" />
              </div>
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-foreground tracking-tight">Admin Access</h1>
            <p className="text-muted-foreground text-sm mt-1.5">FleetOps Manager Panel{"·".repeat(dots + 1)}</p>
          </div>
          <div
            className="bg-card border border-border rounded-2xl p-6 shadow-xl"
            style={passcodeShake ? { animation: "shake 0.4s ease-in-out" } : {}}
          >
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Admin Password</p>
            <div className="relative mb-4">
              <input
                type={showPw ? "text" : "password"}
                placeholder="Enter admin password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitPasscode()}
                autoFocus
                className="w-full bg-background border border-input rounded-xl px-4 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary pr-12 text-sm font-medium tracking-widest"
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passcodeError && <p className="text-red-400 text-sm text-center mb-3 font-medium animate-pulse">{passcodeError}</p>}
            <button onClick={submitPasscode} disabled={!pw} className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-base disabled:opacity-40 active:scale-[.98] transition-all">
              Unlock Admin Panel
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">Protected management interface · FleetOps v1.0</p>
        </div>
        <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-8px)} 30%{transform:translateX(8px)} 45%{transform:translateX(-6px)} 60%{transform:translateX(6px)} 75%{transform:translateX(-4px)} 90%{transform:translateX(4px)} }`}</style>
      </div>
    );
  }

  // ── STEP 2: If user is logged in as non-manager, redirect or prompt to go to portal
  if (!isLoading && user && !isManagerRole(user.role)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mb-4 text-primary">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Admin Access Restricted</h2>
        <p className="text-muted-foreground text-sm mt-1.5 max-w-xs">
          Logged in as <span className="text-foreground font-semibold">{user.name}</span> ({user.role}). This section is reserved for Fleet Managers.
        </p>
        <button
          onClick={() => {
            if (isHeadOfTeamsRole(user.role)) setLocation("/trip-requests");
            else if (isSecurityRole(user.role)) setLocation("/security-gate");
            else setLocation("/");
          }}
          className="mt-5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center gap-2 hover:opacity-95 shadow-md active:scale-95 transition-all"
        >
          {isHeadOfTeamsRole(user.role) ? "Go to Trip Requests" : "Go to Dashboard"}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── STEP 3: If passcode passed but no manager session, show inline login ─────
  if (!isLoading && (!user || !isManagerRole(user.role))) {
    const submitLogin = async () => {
      if (!phone.trim() || !pin.trim()) { setLoginError("Phone and PIN required"); return; }
      setLoginLoading(true);
      setLoginError("");
      try {
        await login(phone.trim(), pin.trim(), rememberMe);
        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, "true");
          localStorage.setItem(SAVED_PHONE_KEY, phone.trim());
          localStorage.setItem(SAVED_PIN_KEY, pin.trim());
          localStorage.setItem(SESSION_KEY, "1");
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(SAVED_PHONE_KEY);
          localStorage.removeItem(SAVED_PIN_KEY);
        }
      } catch (e: unknown) {
        setLoginError(e instanceof Error ? e.message : "Login failed");
      } finally {
        setLoginLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_1px_1px,#f97316_1px,transparent_0)] [background-size:32px_32px]" />
        <div className="relative z-10 w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <LogIn className="w-10 h-10 text-primary" />
            </div>
          </div>
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full mb-3">
              <Shield className="w-3 h-3" /> Admin unlocked
            </div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Manager Sign In</h1>
            <p className="text-muted-foreground text-sm mt-1.5">Sign in with your manager account to continue</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                <Phone className="w-3 h-3 inline mr-1" />Phone Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 07X XXXXXXX"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitLogin()}
                autoFocus
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                <Hash className="w-3 h-3 inline mr-1" />PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  placeholder="4-digit PIN"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submitLogin()}
                  maxLength={4}
                  className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary pr-12 text-sm tracking-widest"
                />
                <button type="button" onClick={() => setShowPin(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me Toggle */}
            <div className="flex items-center justify-between py-1 px-0.5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                />
                <span className="text-xs text-foreground font-medium">Remember Me</span>
              </label>
              <span className="text-[11px] text-muted-foreground">Save credentials permanently</span>
            </div>

            {loginError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-xs font-medium">{loginError}</p>
              </div>
            )}

            <button
              onClick={submitLogin}
              disabled={loginLoading || !phone || !pin}
              className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-base disabled:opacity-40 active:scale-[.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              {loginLoading
                ? <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />Signing in…</>
                : <><LogIn className="w-4 h-4" />Enter Dashboard</>
              }
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 3: Fully authenticated manager - render dashboard ───────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

