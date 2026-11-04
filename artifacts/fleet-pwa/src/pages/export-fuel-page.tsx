import { useEffect, useState } from "react";
import { generateFuelCsv } from "@/lib/fuel-csv-exporter";

export function ExportFuelPage() {
  const [csvContent, setCsvContent] = useState<string>("Loading CSV data...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = (params.get("type") || "daily") as "daily" | "vehicle" | "monthly";
    const from = params.get("from");
    const to = params.get("to");
    const vehicleId = params.get("vehicleId") || params.get("vehicle_id");
    const vehicleNo = params.get("vehicle") || params.get("vehicle_no");
    const driverId = params.get("driverId") || params.get("driver_id");
    const group = params.get("group");

    generateFuelCsv(type, { from, to, vehicleId, vehicleNo, driverId, group })
      .then(csv => {
        setCsvContent(csv);

        // If requested with download=true or opened in browser
        if (params.get("download") === "true") {
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", `fuel-export-${type}-${new Date().toISOString().split("T")[0]}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      })
      .catch(err => {
        setCsvContent("Error generating CSV: " + err.message);
      });
  }, []);

  return (
    <pre style={{
      margin: 0,
      padding: "16px",
      fontFamily: "monospace",
      fontSize: "12px",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      backgroundColor: "#0b0f19",
      color: "#e2e8f0",
      minHeight: "100vh"
    }}>
      {csvContent}
    </pre>
  );
}
