import { CheckCircle2, Fuel, Gauge, DollarSign, Calendar, Truck, ArrowRight, ShieldCheck } from "lucide-react";

export interface FuelSuccessData {
  vehicleNo: string;
  odometer: number;
  liters: number;
  amount: number;
  isFullTank: boolean;
  kmpl: number | null;
  benchmarkKmpl: number;
  isBelowBenchmark: boolean;
  coverageKm?: number;
  photos: {
    label: string;
    url: string;
  }[];
  date: string;
}

interface FuelSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: FuelSuccessData | null;
}

export function FuelSuccessModal({ isOpen, onClose, data }: FuelSuccessModalProps) {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden p-6 text-foreground flex flex-col max-h-[92vh]">
        {/* Top Celebration Glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header with animated icon */}
        <div className="text-center space-y-2 mb-4 relative z-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 mx-auto shadow-lg shadow-emerald-500/20 animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground tracking-tight">
              Fuel Log Submitted!
            </h2>
            <p className="text-xs font-semibold text-emerald-400 mt-0.5">
              ඉන්ධන සටහන සහ ඡායාරූප සාර්ථකව ඇතුළත් විය!
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-[11px] font-bold text-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>4 Proof Photos Synced in Real Time ✓</span>
          </div>
        </div>

        {/* Scrollable details container */}
        <div className="overflow-y-auto space-y-3 pr-1 py-1 flex-1">
          {/* Vehicle & Date strip */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-secondary/60 border border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Vehicle</span>
                <span className="text-sm font-black text-foreground">{data.vehicleNo}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 justify-end">
                <Calendar className="w-3 h-3" /> Date
              </span>
              <span className="text-xs font-mono font-bold text-foreground">{data.date}</span>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground mb-1">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                <span>Odometer</span>
              </div>
              <p className="text-base font-black font-mono text-foreground">
                {data.odometer.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">km</span>
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground mb-1">
                <Fuel className="w-3.5 h-3.5 text-blue-400" />
                <span>Liters Added</span>
              </div>
              <p className="text-base font-black font-mono text-foreground">
                {data.liters} <span className="text-xs font-normal text-muted-foreground">L</span>
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground mb-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Amount Paid</span>
              </div>
              <p className="text-base font-black font-mono text-foreground">
                Rs. {data.amount.toLocaleString()}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">
                <span>Tank Status</span>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-extrabold ${
                data.isFullTank
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              }`}>
                {data.isFullTank ? "Full Tank ✓" : "Partial Fill"}
              </span>
            </div>
          </div>

          {/* Estimated coverage km */}
          {data.coverageKm !== undefined && data.coverageKm > 0 && (
            <div className="p-3 rounded-2xl bg-secondary/50 border border-primary/30 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Estimated Coverage
                </span>
                <span className="text-sm font-black text-primary">
                  ≈ {data.coverageKm.toLocaleString()} km
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground font-semibold">
                This fill should cover
              </span>
            </div>
          )}

          {/* KMPL efficiency banner if available */}
          {data.kmpl !== null && data.kmpl > 0 && (
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              data.isBelowBenchmark
                ? "bg-amber-950/40 border-amber-500/30 text-amber-200"
                : "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
            }`}>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80">
                  Calculated Mileage
                </span>
                <span className="text-sm font-black">
                  {data.kmpl.toFixed(2)} km/L
                </span>
              </div>
              <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${
                data.isBelowBenchmark ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
              }`}>
                {data.isBelowBenchmark ? "Below Benchmark" : "Good Mileage ✓"}
              </span>
            </div>
          )}

          {/* 4 Proof Photos Thumbnails */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              Attached Proof Photos ({data.photos.length}/4 Verified)
            </span>
            <div className="grid grid-cols-4 gap-2">
              {data.photos.map((photo, i) => (
                <div
                  key={i}
                  className="relative rounded-xl overflow-hidden border border-emerald-500/40 aspect-square bg-black/50 group"
                >
                  <img
                    src={photo.url}
                    alt={photo.label}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center text-[10px] font-black shadow">
                    ✓
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1 py-0.5 text-[8px] font-bold text-center truncate text-muted-foreground">
                    {photo.label.replace(/^\d+\.\s*/, "")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-border mt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-extrabold py-3.5 rounded-2xl text-sm shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
          >
            <span>Done / හරි (Close)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
