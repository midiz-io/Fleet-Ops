import { supabase } from "./supabase";

export type PushPermissionStatus = "granted" | "denied" | "default" | "unsupported";

/**
 * Check current notification permission state
 */
export function getNotificationPermissionStatus(): PushPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as PushPermissionStatus;
}

/**
 * Request notification permissions from driver's device
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      // Play a short confirmation tone
      playPhoneRingChime();
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Failed to request notification permission:", err);
    return false;
  }
}

/**
 * Play audible phone ring chime (Change 6: Page 11-12)
 */
export function playPhoneRingChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Two-tone double chime (ring pattern: A5 -> D6, pause, A5 -> D6)
    playTone(880, now, 0.15);
    playTone(1174.66, now + 0.14, 0.22);
    playTone(880, now + 0.45, 0.15);
    playTone(1174.66, now + 0.59, 0.25);
  } catch (e) {
    // Non-blocking fallback
  }
}

/**
 * Trigger physical phone vibration (300ms on, 150ms off, 300ms on, 150ms off, 450ms on)
 */
export function triggerPhoneVibration() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate([300, 150, 300, 150, 450]);
    } catch (e) {}
  }
}

/**
 * Trigger Complete Task Ringing: Sound + Vibration + Service Worker OS Notification (Change 6)
 */
export async function triggerTaskRing(title: string, body: string, dataUrl: string = "/") {
  // 1. Audio chime
  playPhoneRingChime();

  // 2. Physical phone vibration
  triggerPhoneVibration();

  // 3. Native Service Worker Push / OS Notification
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          if (registration && registration.showNotification) {
            await registration.showNotification(title, {
              body,
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              vibrate: [300, 150, 300, 150, 450],
              tag: "fleetops-task-ring-" + Date.now(),
              renotify: true,
              requireInteraction: true,
              data: { url: dataUrl },
              actions: [
                { action: "open_app", title: "View in FleetOps" },
                { action: "dismiss", title: "Dismiss" }
              ]
            } as any);
            return;
          }
        }
      } catch (err) {
        console.warn("ServiceWorker showNotification failed, attempting fallback:", err);
      }

      // Fallback to standard window Notification if SW is not ready
      try {
        new Notification(title, {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
        });
      } catch (e) {}
    }
  }
}

/**
 * Register Driver Push Subscription in Supabase
 */
export async function registerPushSubscription(userId: string, driverName?: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Use existing subscription or create one
      // Public VAPID key placeholder or auto-subscription
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          // Generic 65-byte uncompressed P-256 test public key if available
          applicationServerKey: undefined
        });
      } catch (subErr) {
        console.info("Standard PushManager subscribe requires VAPID key, caching registration.");
      }
    }

    if (subscription) {
      const subJson = subscription.toJSON();
      await supabase.from("push_subscriptions").upsert({
        user_id: userId,
        driver_name: driverName || "Driver",
        endpoint: subscription.endpoint,
        p256dh: subJson.keys?.p256dh || null,
        auth: subJson.keys?.auth || null,
        subscription_json: subJson,
        updated_at: new Date().toISOString()
      }, { onConflict: "endpoint" });
      return subscription;
    }
  } catch (err) {
    console.warn("Could not register push subscription in DB:", err);
  }
  return null;
}
