import { createContext, useContext, useEffect, useState } from "react";
import { supabase, Database } from "@/lib/supabase";

type Driver = Database["public"]["Tables"]["drivers"]["Row"];

interface AuthContextType {
  user: Driver | null;
  login: (phone: string, pin: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Driver | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      localStorage.removeItem("fleet_saved_pin");
    } catch {}
    const storedUser = localStorage.getItem("fleet_user") || sessionStorage.getItem("fleet_user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed && parsed.role) {
          parsed.role = parsed.role.toLowerCase().trim();
        }
        // Strip any legacy plain-text PIN stored in localStorage/sessionStorage
        if (parsed && "pin" in parsed) {
          delete parsed.pin;
          if (localStorage.getItem("fleet_user")) {
            localStorage.setItem("fleet_user", JSON.stringify(parsed));
          }
          if (sessionStorage.getItem("fleet_user")) {
            sessionStorage.setItem("fleet_user", JSON.stringify(parsed));
          }
        }
        setUser(parsed);
      } catch (e) {}
    }
    setIsLoading(false);
  }, []);

  const login = async (phone: string, pin: string, rememberMe: boolean = false) => {
    const trimmedPhone = phone.trim();
    const trimmedPin = pin.trim();

    const cleanInputPhone = trimmedPhone.replace(/\D/g, "");
    const last9Input = cleanInputPhone.slice(-9);

    // 1. Try exact match first
    const { data: exactData } = await supabase
      .from("drivers")
      .select("*")
      .eq("phone", trimmedPhone)
      .eq("pin", trimmedPin)
      .maybeSingle();

    let matchedDriver = exactData;

    // 2. If exact match fails, query by PIN and match phone flexibly (last 9 digits / normalized digits)
    if (!matchedDriver) {
      const { data: pinDrivers } = await supabase
        .from("drivers")
        .select("*")
        .eq("pin", trimmedPin);

      if (pinDrivers && pinDrivers.length > 0) {
        matchedDriver = pinDrivers.find(d => {
          const cleanDbPhone = d.phone.trim().replace(/\D/g, "");
          const last9Db = cleanDbPhone.slice(-9);
          return (
            d.phone === trimmedPhone ||
            cleanDbPhone === cleanInputPhone ||
            (last9Db.length === 9 && last9Input.length === 9 && last9Db === last9Input)
          );
        }) || null;
      }
    }

    if (!matchedDriver) {
      // Offline fallback & Built-in Admin / Manager test credentials (Fix A14)
      if ((cleanInputPhone === "0770000000" || cleanInputPhone === "0779999999" || last9Input === "770000000") && trimmedPin === "9999") {
        matchedDriver = {
          id: "admin-system-account",
          name: "System Admin",
          phone: "0770000000",
          role: "admin",
          license_expiry: "2030-12-31",
        };
      } else if ((cleanInputPhone === "0771234567" || last9Input === "771234567") && trimmedPin === "1234") {
        matchedDriver = {
          id: "manager-system-account",
          name: "Fleet Manager",
          phone: "0771234567",
          role: "manager",
          license_expiry: "2030-12-31",
        };
      }
    }

    if (!matchedDriver) {
      throw new Error("Invalid phone or PIN");
    }

    const { pin: _omittedPin, ...safeDriver } = matchedDriver as any;
    const sessionToken = `sess_${matchedDriver.id}_${Date.now().toString(36)}`;
    const normalizedDriver = {
      ...safeDriver,
      role: (matchedDriver.role || "driver").toLowerCase().trim() as any,
      session_token: sessionToken,
    };

    setUser(normalizedDriver);
    localStorage.removeItem("fleet_saved_pin");
    if (rememberMe) {
      localStorage.setItem("fleet_user", JSON.stringify(normalizedDriver));
      localStorage.setItem("fleet_session_token", sessionToken);
      sessionStorage.removeItem("fleet_user");
    } else {
      sessionStorage.setItem("fleet_user", JSON.stringify(normalizedDriver));
      sessionStorage.setItem("fleet_session_token", sessionToken);
      localStorage.removeItem("fleet_user");
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("fleet_user");
    localStorage.removeItem("fleet_session_token");
    localStorage.removeItem("fleet_saved_pin");
    sessionStorage.removeItem("fleet_user");
    sessionStorage.removeItem("fleet_session_token");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

