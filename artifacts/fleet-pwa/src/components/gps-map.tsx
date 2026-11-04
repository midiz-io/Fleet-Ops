import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { MapPin, Wifi, AlertTriangle, Zap } from "lucide-react";

type Vehicle = { id: string; vehicle_no: string; model: string; sim_gps_number: string | null; assigned_driver_id: string | null };
type ChecklistEntry = { vehicle_id: string; gps_lat: number | null; gps_lng: number | null; submitted_at: string; meter_reading: number };
type Driver = { id: string; name: string };
type EVStation = { name: string; lat: number; lng: number; type: string; available: boolean };

const SL_EV_STATIONS: EVStation[] = [
  { name: "LECO Fast Charger - Borella", lat: 6.9168, lng: 79.8608, type: "DC Fast", available: true },
  { name: "Keells EV Hub - Colombo 3", lat: 6.9018, lng: 79.8567, type: "AC Type 2", available: true },
  { name: "Dialog EV - Dehiwala", lat: 6.8535, lng: 79.8658, type: "DC Fast", available: false },
  { name: "Lanka IOC - Nugegoda", lat: 6.8729, lng: 79.8932, type: "AC Type 2", available: true },
  { name: "My EV Lanka - Negombo", lat: 7.2094, lng: 79.8384, type: "DC Fast", available: true },
  { name: "HTEMS Charger - Kandy", lat: 7.2906, lng: 80.6337, type: "AC Type 2", available: true },
  { name: "Lanka IOC EV - Galle", lat: 6.0535, lng: 80.2218, type: "DC Fast", available: true },
  { name: "Dialog EV - Kurunegala", lat: 7.4875, lng: 80.3647, type: "AC Type 2", available: false },
  { name: "Lanka IOC - Ratnapura", lat: 6.6827, lng: 80.4005, type: "AC Type 2", available: true },
  { name: "LECO Charger - Jaffna", lat: 9.6615, lng: 80.0255, type: "AC Type 2", available: true },
  { name: "Nestlé EV Hub - Colombo 7", lat: 6.9106, lng: 79.8627, type: "DC Fast", available: true },
  { name: "Aitken Spence - Bentota", lat: 6.4249, lng: 79.9948, type: "AC Type 2", available: true },
];

interface GPSMapProps {
  vehicles: Vehicle[];
  checklists: ChecklistEntry[];
  drivers: Driver[];
  showEV?: boolean;
}

export function GPSMap({ vehicles, checklists, drivers, showEV = true }: GPSMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (!mapRef.current || !mounted) return;

      // Fix default icon
      (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl = undefined;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([7.8731, 80.7718], 8);
      mapInstanceRef.current = map;

      // Dark tile layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      // Vehicle markers
      const vehicleIcon = (color: string) => L.divIcon({
        html: `<div style="background:${color};width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: "",
      });

      const evIcon = L.divIcon({
        html: `<div style="background:#10b981;width:26px;height:26px;border-radius:6px;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.5);font-size:14px;line-height:1">âš¡</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        className: "",
      });

      vehicles.forEach(v => {
        const lastCheck = checklists
          .filter(c => c.vehicle_id === v.id && c.gps_lat && c.gps_lng)
          .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0];

        if (lastCheck?.gps_lat && lastCheck?.gps_lng) {
          const driver = drivers.find(d => d.id === v.assigned_driver_id);
          const marker = L.marker([lastCheck.gps_lat, lastCheck.gps_lng], { icon: vehicleIcon("#f97316") });
          marker.bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
              <div style="font-weight:700;font-size:14px;color:#f97316;margin-bottom:4px">${v.vehicle_no}</div>
              <div style="font-size:12px;color:#64748b;margin-bottom:2px">${v.model}</div>
              ${driver ? `<div style="font-size:12px;margin-bottom:2px">Driver: <b>${driver.name}</b></div>` : ""}
              <div style="font-size:11px;color:#64748b">Meter: ${Number(lastCheck.meter_reading).toLocaleString()} km</div>
              ${v.sim_gps_number ? `<div style="font-size:11px;color:#64748b;margin-top:2px">SIM: ${v.sim_gps_number}</div>` : ""}
            </div>
          `);
          marker.addTo(map);
          markersRef.current.push(marker);
        }
      });

      // EV charging markers
      if (showEV) {
        SL_EV_STATIONS.forEach(station => {
          const marker = L.marker([station.lat, station.lng], { icon: evIcon });
          marker.bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
              <div style="font-weight:700;font-size:13px;color:#10b981;margin-bottom:4px">âš¡ EV Station</div>
              <div style="font-size:12px;font-weight:600;margin-bottom:2px">${station.name}</div>
              <div style="font-size:11px;color:#64748b">Type: ${station.type}</div>
              <div style="font-size:11px;margin-top:2px"><span style="color:${station.available?"#10b981":"#ef4444"}">${station.available ? "â- Available" : "â- Busy"}</span></div>
            </div>
          `);
          marker.addTo(map);
        });
      }

      // Fit bounds if we have GPS data
      const allCoords: [number, number][] = [];
      vehicles.forEach(v => {
        const last = checklists.filter(c => c.vehicle_id === v.id && c.gps_lat).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0];
        if (last?.gps_lat && last?.gps_lng) allCoords.push([last.gps_lat, last.gps_lng]);
      });
      if (allCoords.length > 1) map.fitBounds(allCoords, { padding: [40, 40] });
    }

    initMap().catch(console.error);

    return () => {
      mounted = false;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [vehicles, checklists, drivers, showEV]);

  const vehiclesWithGPS = vehicles.filter(v =>
    checklists.some(c => c.vehicle_id === v.id && c.gps_lat && c.gps_lng)
  );
  const vehiclesNoGPS = vehicles.filter(v =>
    !checklists.some(c => c.vehicle_id === v.id && c.gps_lat && c.gps_lng)
  );

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-2.5 py-1.5">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <span className="text-foreground font-medium">{vehiclesWithGPS.length}</span> live GPS
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-2.5 py-1.5">
          <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">{vehiclesNoGPS.length}</span> SIM only
        </div>
        {showEV && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-2.5 py-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-foreground font-medium">{SL_EV_STATIONS.length}</span> EV stations
          </div>
        )}
      </div>

      {/* Map */}
      <div
        ref={mapRef}
        className="w-full rounded-xl overflow-hidden border border-border"
        style={{ height: "360px" }}
      />

      {/* No-GPS vehicles */}
      {vehiclesNoGPS.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Vehicles without GPS data</p>
          {vehiclesNoGPS.map(v => (
            <div key={v.id} className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-foreground text-sm font-medium">{v.vehicle_no} - {v.model}</p>
                {v.sim_gps_number
                  ? <p className="text-xs text-muted-foreground flex items-center gap-1"><Wifi className="w-3 h-3" />SIM: {v.sim_gps_number} - GPS pending first checklist</p>
                  : <p className="text-xs text-muted-foreground">No SIM/GPS configured</p>
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

