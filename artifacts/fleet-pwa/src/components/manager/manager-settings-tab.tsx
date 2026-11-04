import { useState, useEffect } from "react";
import { useFuelPrices, useUpdateFuelPrices, OutstationOtRule } from "@/hooks/use-fuel";
import { useToast } from "@/hooks/use-toast";
import { Wrench, Fuel, Clock, DollarSign, Check, MapPin, Plus, Trash2 } from "lucide-react";

export function ManagerSettingsTab() {
  const { data: fuelPrices } = useFuelPrices();
  const updatePrices = useUpdateFuelPrices();
  const { toast } = useToast();

  const [dieselPrice, setDieselPrice] = useState("392");
  const [petrolPrice, setPetrolPrice] = useState("370");
  const [eveningAlertTime, setEveningAlertTime] = useState("18:00");
  const [eveningAlertCovers, setEveningAlertCovers] = useState<"Tropical" | "Centres" | "All">("Tropical");
  const [outstationRules, setOutstationRules] = useState<OutstationOtRule[]>([
    { area: "Vavuniya", hours: 2.0 },
    { area: "Jaffna", hours: 3.0 },
    { area: "Anuradhapura", hours: 2.0 },
    { area: "Trincomalee", hours: 2.5 },
  ]);
  const [normalOtBlockMinutes, setNormalOtBlockMinutes] = useState("30");
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaHours, setNewAreaHours] = useState("2.0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fuelPrices) {
      setDieselPrice(String(fuelPrices.diesel || 392));
      setPetrolPrice(String(fuelPrices.petrol || 370));
      setEveningAlertTime(fuelPrices.eveningAlertTime || (fuelPrices as any).evening_alert_time || "18:00");
      setEveningAlertCovers(fuelPrices.eveningAlertCovers || "Tropical");
      if (Array.isArray(fuelPrices.outstationOtRules)) {
        setOutstationRules(fuelPrices.outstationOtRules);
      }
      if (fuelPrices.normalOtBlockMinutes) {
        setNormalOtBlockMinutes(String(fuelPrices.normalOtBlockMinutes));
      }
    }
  }, [fuelPrices]);

  const handleAddOutstationRule = () => {
    const trimmed = newAreaName.trim();
    const hrs = parseFloat(newAreaHours);
    if (!trimmed || isNaN(hrs) || hrs <= 0) {
      toast({ title: "Enter a valid area name and fixed OT hours", variant: "destructive" });
      return;
    }
    setOutstationRules(prev => [
      ...prev.filter(r => r.area.toLowerCase() !== trimmed.toLowerCase()),
      { area: trimmed, hours: hrs },
    ]);
    setNewAreaName("");
    setNewAreaHours("2.0");
  };

  const handleRemoveOutstationRule = (area: string) => {
    setOutstationRules(prev => prev.filter(r => r.area !== area));
  };

  const handleSave = async () => {
    const dVal = parseFloat(dieselPrice);
    const pVal = parseFloat(petrolPrice);

    if (isNaN(dVal) || dVal <= 0 || isNaN(pVal) || pVal <= 0) {
      toast({ title: "Invalid fuel price", description: "Prices must be positive numbers.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await updatePrices.mutateAsync({
        diesel: dVal,
        petrol: pVal,
        eveningAlertTime,
        eveningAlertCovers,
        outstationOtRules: outstationRules,
        normalOtBlockMinutes: parseInt(normalOtBlockMinutes, 10) || 30,
      });
      toast({ title: "Settings saved successfully" });
    } catch (err: any) {
      toast({ title: "Failed to save settings", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <p className="text-sm font-bold text-foreground">Global Fleet Settings</p>
        <p className="text-xs text-muted-foreground">Manage dual fuel prices, evening fuel alerts, and driver overtime rules</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Fuel className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-foreground text-sm">Dual Fuel Prices</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
              Diesel Price (Rs. / L)
            </label>
            <input
              type="number"
              step="0.01"
              value={dieselPrice}
              onChange={e => setDieselPrice(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Used for vans and diesel fleet</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
              Petrol Price (Rs. / L)
            </label>
            <input
              type="number"
              step="0.01"
              value={petrolPrice}
              onChange={e => setPetrolPrice(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Used for Dio bike (BIC 6942) &amp; petrol fleet</p>
          </div>
        </div>

        <div className="pt-3 border-t border-border space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground text-sm">Daily Evening Fuel Alert</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
                Scheduled Alert Time
              </label>
              <input
                type="time"
                value={eveningAlertTime}
                onChange={e => setEveningAlertTime(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
                Evening Alert Covers
              </label>
              <div className="flex bg-background border border-input rounded-xl p-1 gap-1">
                {(["Tropical", "Centres", "All"] as const).map(grp => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setEveningAlertCovers(grp)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      eveningAlertCovers === grp
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            At this time daily, manager receives the &ldquo;Fuel needed tonight&rdquo; alert calculating (6 &minus; bars) &times; tank size for {eveningAlertCovers} vehicles with completed End Day.
          </p>
        </div>

        {/* Overtime Rules Card (Issue A9) */}
        <div className="pt-3 border-t border-border space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground text-sm">Overtime (OT) Calculation Rules</h3>
          </div>

          <div className="bg-secondary/30 border border-border rounded-xl p-3 space-y-2.5">
            <div>
              <p className="text-xs font-bold text-foreground">Rule 1 · Outstation Fixed OT</p>
              <p className="text-[11px] text-muted-foreground">
                Fixed overtime hours awarded automatically when a driver completes a trip to an outstation area.
              </p>
            </div>

            <div className="space-y-1.5">
              {outstationRules.map(rule => (
                <div
                  key={rule.area}
                  className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-1.5 text-xs"
                >
                  <span className="font-semibold text-foreground">{rule.area}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-400">+{rule.hours.toFixed(1)} h fixed OT</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOutstationRule(rule.area)}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                      title="Remove area"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Area (e.g. Vavuniya)"
                value={newAreaName}
                onChange={e => setNewAreaName(e.target.value)}
                className="flex-1 bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground"
              />
              <input
                type="number"
                step="0.5"
                placeholder="Hours"
                value={newAreaHours}
                onChange={e => setNewAreaHours(e.target.value)}
                className="w-20 bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono"
              />
              <button
                type="button"
                onClick={handleAddOutstationRule}
                className="px-2.5 py-1.5 bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground rounded-lg text-xs font-bold border border-border flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          <div className="bg-secondary/30 border border-border rounded-xl p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">Rule 2 · Normal Day OT</p>
              <p className="text-[11px] text-muted-foreground">
                End Day time &minus; Scheduled Shift End, counted in blocks of:
              </p>
            </div>
            <select
              value={normalOtBlockMinutes}
              onChange={e => setNormalOtBlockMinutes(e.target.value)}
              className="bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-foreground"
            >
              <option value="15">15 min blocks</option>
              <option value="30">30 min blocks</option>
              <option value="60">60 min blocks</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] mt-2 shadow-md"
        >
          {saving ? "Saving Changes..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
