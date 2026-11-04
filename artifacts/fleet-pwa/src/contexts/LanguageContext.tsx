import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "si";

interface Translations {
  [key: string]: {
    en: string;
    si: string;
  };
}

export const translations: Translations = {
  // Common / Navbar
  appName: { en: "FleetOps", si: "ෆ්ලීට්ඔප්ස්" },
  language: { en: "Language", si: "භාෂාව" },
  english: { en: "English", si: "English" },
  sinhala: { en: "සිංහල", si: "සිංහල" },
  login: { en: "Login", si: "ඇතුළු වන්න" },
  logout: { en: "Logout", si: "ඉවත් වන්න" },
  dashboard: { en: "Dashboard", si: "ප්‍රධාන පුවරුව" },
  checklist: { en: "Checklist", si: "පරීක්ෂා ලැයිස්තුව" },
  fuel: { en: "Fuel Log", si: "ඉන්ධන සටහන්" },
  dailyFuel: { en: "Daily Fuel", si: "දිනපතා ඉන්ධන" },
  repairs: { en: "Repairs", si: "අලුත්වැඩියා" },
  maintenance: { en: "Maintenance", si: "නඩත්තු" },
  vehicles: { en: "Vehicles", si: "වාහන" },
  drivers: { en: "Drivers", si: "රියදුරන්" },
  tasks: { en: "Tasks", si: "කාර්යයන්" },
  costs: { en: "Costs", si: "වියදම්" },
  alerts: { en: "Alerts", si: "ඇලර්ට්" },
  gateTv: { en: "Gate TV View", si: "ගේට්ටු TV දසුන" },
  securityGate: { en: "Security Gate", si: "ආරක්ෂක ගේට්ටුව" },
  tripRequests: { en: "Trip Requests", si: "ගමන් ඉල්ලීම්" },

  // Login
  phoneLabel: { en: "Phone Number", si: "දුරකථන අංකය" },
  pinLabel: { en: "PIN", si: "PIN අංකය" },
  enterPhonePin: { en: "Enter your phone number and 4-digit PIN", si: "ඔබගේ දුරකථන අංකය සහ 4-ඉලක්කම් PIN අංකය ඇතුළත් කරන්න" },
  rememberMe: { en: "Remember me", si: "මතක තබා ගන්න" },
  authenticating: { en: "Authenticating...", si: "තහවුරු කරමින්..." },
  roleManager: { en: "Manager", si: "ක කළමනාකරු" },
  roleDriver: { en: "Driver", si: "රියදුරු" },
  roleSecurity: { en: "Security Guard", si: "ආරක්ෂක නිලධාරී" },
  roleTeamLeader: { en: "Head of Teams", si: "කණ්ඩායම් ප්‍රධානී" },

  // Step-by-Step Driver Dashboard
  stepChecklist: { en: "1. Start Checklist", si: "1. පරීක්ෂා ලැයිස්තුව" },
  stepSecurity: { en: "2. Security Gate", si: "2. ආරක්ෂක පරීක්ෂාව" },
  stepTasks: { en: "3. Today's Tasks", si: "3. දෛනික කාර්යයන්" },
  stepEndDay: { en: "4. End Day", si: "4. දවස අවසන් කිරීම" },

  submitToSecurity: { en: "Submit checklist", si: "පිරික්සුම් ලැයිස්තුව ඉදිරිපත් කරන්න" },
  clearToLeave: { en: "Clear to Leave", si: "පිටවීමට අවසරයි" },
  stopVehicle: { en: "Stop Vehicle", si: "වාහනය නවත්වන්න" },
  pendingSecurity: { en: "Pending Security Clearance", si: "ආරක්ෂක පරීක්ෂාව බලපොරොත්තුවෙන්" },
  clearedBySecurity: { en: "Cleared by Security", si: "ආරක්ෂක අංශයෙන් අනුමතයි" },

  // End Day
  endDayTitle: { en: "End Day Odometer & Fuel", si: "දවස අවසාන මීටරය සහ ඉන්ධන" },
  finalOdometer: { en: "Final Odometer Reading", si: "අවසාන මීටර් අගය" },
  fuelGaugeLevel: { en: "Fuel Gauge Level", si: "ඉන්ධන මට්ටම" },
  attachDashboardPhoto: { en: "Attach Photo of Dashboard", si: "ඩෑෂ්බෝඩ් ඡායාරූපයක් එක් කරන්න" },
  completeEndDay: { en: "Submit & End Day", si: "තහවුරු කර දවස අවසන් කරන්න" },

  // Statuses
  statusCleared: { en: "Cleared (Green)", si: "අනුමතයි (කොළ)" },
  statusPending: { en: "Pending (Amber)", si: "පොරොත්තුවෙන් (තැඹිලි)" },
  statusStopped: { en: "Stopped (Red)", si: "නවත්වා ඇත (රතු)" },
  statusInactive: { en: "Inactive (Grey)", si: "අක්‍රියයි (අළු)" },

  // Maintenance & Parts
  partLifespan: { en: "Component Life Status", si: "කොටස්වල භාවිත කාලසීමාව" },
  replacePart: { en: "Replaced Part", si: "කොටස මාරු කරන ලදී" },
  amberAlert90: { en: "Warning: 90% lifespan reached", si: "අනතුරු ඇඟවීමයි: භාවිතයෙන් 90% ක් අවසන්" },
  redAlert100: { en: "Critical: 100% lifespan reached", si: "අවධානයට: භාවිතයෙන් 100% ක් අවසන් - වහාම මාරු කරන්න" },

  // Repairs Quick Buttons
  tyre: { en: "Tyre Issue", si: "ටයර් ගැටලුව" },
  lights: { en: "Lights Issue", si: "ලයිට් ගැටලුව" },
  brakes: { en: "Brakes Issue", si: "බ්‍රේක් ගැටලුව" },
  engine: { en: "Engine Issue", si: "එන්ජින් ගැටලුව" },
  body: { en: "Body Damage", si: "බොඩි ගැටලුව" },
  other: { en: "Other Repair", si: "වෙනත් ගැටලුව" },
  markFixed: { en: "Mark Fixed", si: "සදනු ලැබීය" },

  // Validation Alerts
  invalidOdoLower: { en: "Odometer reading cannot be less than previous record!", si: "මීටර් අගය පෙර වාර්තාවට වඩා අඩු විය නොහැක!" },
  invalidFuelOverTank: { en: "Fuel liters exceeds maximum vehicle tank capacity!", si: "ලබාගත් ඉන්ධන ප්‍රමාණය ටැංකියේ ධාරිතාවයට වඩා වැඩිය!" },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("fleetops_lang");
    return saved === "si" ? "si" : "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("fleetops_lang", lang);
  };

  const t = (key: string): string => {
    if (translations[key]) {
      return translations[key][language] || translations[key]["en"];
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
