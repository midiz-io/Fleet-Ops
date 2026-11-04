import { supabase } from "./supabase";

const WHATSAPP_API_BASE =
  (import.meta.env.VITE_WHATSAPP_API_URL as string) ||
  "https://api.geekhirusha.com/vehicle.php";

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return digits;
  if (digits.startsWith("0")) return "94" + digits.slice(1);
  return digits;
}

let messageQueue: Array<() => Promise<void>> = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (messageQueue.length > 0) {
    const task = messageQueue.shift();
    if (task) {
      await task();
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  isProcessingQueue = false;
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  const url = `${WHATSAPP_API_BASE}?number=${encodeURIComponent(formatPhone(phone))}&type=text&message=${encodeURIComponent(message)}`;
  
  messageQueue.push(async () => {
    try {
      await fetch(url, { mode: 'no-cors' });
    } catch (err) {
      console.warn("WhatsApp notification failed:", err);
    }
  });

  processQueue();
}

export async function notifyManagers(message: string): Promise<void> {
  const { data, error } = await supabase.from("drivers").select("phone").eq("role", "manager");
  if (error || !data) {
    console.warn("Failed to load managers for WhatsApp notification:", error);
    return;
  }
  data.forEach((m) => {
    sendWhatsAppMessage(m.phone, message);
  });
}

export async function getDriverAndVehicle(driverId: string, vehicleId: string) {
  const [{ data: driver }, { data: vehicle }] = await Promise.all([
    supabase.from("drivers").select("name").eq("id", driverId).single(),
    supabase.from("vehicles").select("vehicle_no").eq("id", vehicleId).single(),
  ]);
  return { driverName: driver?.name ?? "A driver", vehicleNo: vehicle?.vehicle_no ?? "a vehicle" };
}
