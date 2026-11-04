import { useState, useRef, useEffect } from "react";
import { Bell, Wrench, AlertTriangle, TrendingDown, X } from "lucide-react";
import { useNotifications, AppAlert } from "@/hooks/use-notifications";

function AlertIcon({ type }: { type: AppAlert["type"] }) {
  if (type === "repair") return <Wrench className="w-4 h-4 text-amber-400" />;
  if (type === "expiry") return <AlertTriangle className="w-4 h-4 text-red-400" />;
  if (type === "kmpl") return <TrendingDown className="w-4 h-4 text-orange-400" />;
  return <Bell className="w-4 h-4 text-blue-400" />;
}

function severityDot(s: AppAlert["severity"]) {
  if (s === "high") return "bg-red-400";
  if (s === "medium") return "bg-amber-400";
  return "bg-blue-400";
}

export function NotificationBell() {
  const alerts = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const count = alerts.length;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        data-testid="btn-notification-bell"
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl hover:bg-secondary transition-colors"
      >
        <Bell className={`w-5 h-5 ${count > 0 ? "text-amber-400" : "text-muted-foreground"}`} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="font-bold text-foreground text-sm">Alerts</span>
              {count > 0 && <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">{count}</span>}
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">All clear - no alerts</p>
              </div>
            ) : (
              alerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertIcon type={alert.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${severityDot(alert.severity)}`} />
                      <p className="text-xs font-bold text-foreground truncate">{alert.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{alert.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {alerts.length > 0 && (
            <div className="px-4 py-2.5 bg-secondary/20 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">{alerts.filter(a => a.severity === "high").length} high priority alerts</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

