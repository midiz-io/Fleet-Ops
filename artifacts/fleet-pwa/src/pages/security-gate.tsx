import { useState } from "react";
import { useVehicles } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useChecklists } from "@/hooks/use-checklists";
import { useGateClearance, GateStatus } from "@/hooks/use-gate-clearance";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/language-toggle";
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Car, Clock, User, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function SecurityGatePage() {
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: checklists } = useChecklists();
  const { clearances, updateGateStatus, getVehicleGateStatus } = useGateClearance();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const todayStr = new Date().toISOString().split("T")[0];

  const filteredVehicles = vehicles?.filter(v =>
    v.vehicle_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.model.toLowerCase().includes(searchTerm.toLowerCase())
  ) ?? [];

  const handleSetStatus = (vehicleId: string, status: GateStatus, vehicleNo: string) => {
    updateGateStatus(vehicleId, status, "Security Officer");
    toast({
      title: status === "cleared" ? "Vehicle Cleared" : "Vehicle Stopped",
      description: `${vehicleNo} status set to ${status.toUpperCase()}`,
      variant: status === "stopped" ? "destructive" : "default",
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 text-primary p-3 rounded-xl">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("securityGate")}</h1>
            <p className="text-xs text-muted-foreground">Inspect driver checklists & approve vehicles for gate clearance</p>
          </div>
        </div>
        <LanguageToggle />
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by vehicle number or model..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVehicles.map(vehicle => {
          const driver = drivers?.find(d => d.id === vehicle.assigned_driver_id);
          const checklist = checklists?.find(c => c.vehicle_id === vehicle.id && c.date === todayStr);
          const currentGateStatus = getVehicleGateStatus(vehicle.id);

          const isCleared = currentGateStatus === "cleared";
          const isStopped = currentGateStatus === "stopped";

          return (
            <Card key={vehicle.id} className={`border transition-all ${
              isCleared ? "border-emerald-500/40 bg-emerald-950/10" :
              isStopped ? "border-red-500/40 bg-red-950/10" : "border-amber-500/40 bg-amber-950/10"
            }`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Car className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg font-bold">{vehicle.vehicle_no}</CardTitle>
                  </div>
                  <Badge variant="outline" className={`capitalize font-semibold ${
                    isCleared ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                    isStopped ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  }`}>
                    {currentGateStatus}
                  </Badge>
                </div>
                <CardDescription>{vehicle.model}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs space-y-1.5 bg-muted/40 p-3 rounded-lg">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Driver:</span>
                    <span className="font-medium text-foreground">{driver ? driver.name : "Unassigned"}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Today Checklist:</span>
                    <span className={`font-semibold ${checklist ? "text-emerald-400" : "text-amber-400"}`}>
                      {checklist ? "Submitted" : "Not Submitted"}
                    </span>
                  </div>
                  {checklist && (
                    <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-[11px]">
                      <div>Oil: <b className="capitalize text-foreground">{checklist.oil_status}</b></div>
                      <div>Tyres: <b className={checklist.tyres_ok ? "text-emerald-400" : "text-red-400"}>{checklist.tyres_ok ? "OK" : "Issue"}</b></div>
                      <div>Lights: <b className={checklist.lights_ok ? "text-emerald-400" : "text-red-400"}>{checklist.lights_ok ? "OK" : "Issue"}</b></div>
                      <div>Brakes: <b className={checklist.brakes_ok ? "text-emerald-400" : "text-red-400"}>{checklist.brakes_ok ? "OK" : "Issue"}</b></div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    onClick={() => handleSetStatus(vehicle.id, "cleared", vehicle.vehicle_no)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    {t("clearToLeave")}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="font-semibold"
                    onClick={() => handleSetStatus(vehicle.id, "stopped", vehicle.vehicle_no)}
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    {t("stopVehicle")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
