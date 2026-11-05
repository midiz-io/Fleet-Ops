import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  Database, 
  Download, 
  RotateCcw, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  Layers, 
  HardDrive, 
  Users, 
  Car, 
  Fuel, 
  ClipboardCheck, 
  Wrench, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Lock,
  Unlock
} from "lucide-react";
import { 
  generateFullDatabaseSqlBackup, 
  triggerSqlDownload, 
  performSystemHardReset, 
  BackupResult 
} from "@/lib/db-backup-service";
import { useToast } from "@/hooks/use-toast";

export function DbBackupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupDownloaded, setBackupDownloaded] = useState(false);

  // Hard Reset state
  const [isResetting, setIsResetting] = useState(false);
  const [resetStep, setResetStep] = useState("");
  const [resetFinished, setResetFinished] = useState(false);

  // Swipe-to-reset slider state
  // Track width ~ 300px. Thumb moves from right (offset 0) to left (negative offset)
  const [sliderPosition, setSliderPosition] = useState(0); // 0 = default at right, -100% = fully left
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  // Handle backup generation & download
  const handleGenerateAndDownload = async () => {
    try {
      setIsGenerating(true);
      setProgressMsg("Connecting to Supabase...");
      
      const result = await generateFullDatabaseSqlBackup((msg) => {
        setProgressMsg(msg);
      });

      setBackupResult(result);
      triggerSqlDownload(result.sql);
      setBackupDownloaded(true);

      toast({
        title: "Backup Complete & Downloaded!",
        description: `Exported ${result.totalRows} data rows with 100% complete schema & RLS policies.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Backup Error",
        description: err.message || "Failed to generate backup",
      });
    } finally {
      setIsGenerating(false);
      setProgressMsg("");
    }
  };

  // Perform Hard Reset
  const executeHardReset = async () => {
    setIsResetting(true);
    setResetStep("Initiating hard reset...");

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([60, 40, 80]);
    }

    const res = await performSystemHardReset((step) => {
      setResetStep(step);
    });

    if (res.success) {
      setResetFinished(true);
      // Wait for Welcome Back animation then refresh into /login
      setTimeout(() => {
        window.location.href = "/login";
      }, 3500);
    } else {
      setIsResetting(false);
      toast({
        variant: "destructive",
        title: "Reset Warning",
        description: res.error || "Reset completed with fallback. Local session purged.",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 2500);
    }
  };

  // Touch & Mouse handlers for Swipe Left Slider
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (!backupDownloaded) return;
    setIsDragging(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    startXRef.current = clientX;
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || !trackRef.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - startXRef.current; // Negative if moving left
    const trackWidth = trackRef.current.clientWidth - 56; // thumb width ~ 56px

    // We only care about dragging LEFT (deltaX <= 0)
    if (deltaX <= 0) {
      const percentage = Math.min(100, Math.max(0, (Math.abs(deltaX) / trackWidth) * 100));
      setSliderPosition(-percentage);

      // Trigger threshold at 85%
      if (percentage >= 85) {
        setIsDragging(false);
        setSliderPosition(-100);
        executeHardReset();
      }
    } else {
      setSliderPosition(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    // If not reached 85%, snap back to right (0)
    if (sliderPosition > -85) {
      setSliderPosition(0);
    }
  };

  useEffect(() => {
    const handleMouseUpGlobal = () => {
      if (isDragging) {
        setIsDragging(false);
        setSliderPosition(0);
      }
    };
    window.addEventListener("mouseup", handleMouseUpGlobal);
    return () => window.removeEventListener("mouseup", handleMouseUpGlobal);
  }, [isDragging]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                FleetOps Database Console
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30">
                  /dbbackup
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Full Database Backup (.sql) with live data rows & System Hard Reset
              </p>
            </div>
          </div>

          <button
            onClick={() => setLocation("/login")}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 transition-all active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to App
          </button>
        </div>

        {/* Main 2-Step Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* STEP 1: BACKUP DOWNLOAD */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Step 1: Backup
                </span>
                {backupDownloaded && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Downloaded
                  </span>
                )}
              </div>

              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-400" />
                Full Database & Data Backup
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Generates a standalone, 100% idempotent <code className="text-orange-300 font-mono">.sql</code> file containing:
              </p>

              <ul className="text-xs text-slate-300 space-y-2 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Full DDL schema (11 tables, constraints, foreign keys, types)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  All active User Profiles (Drivers, Managers, Admins, Security)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Live Operational Data (Fuel Logs, Checklists, Tasks, Repairs)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  100% RLS policies & 5 Supabase Storage Buckets configuration
                </li>
              </ul>

              {backupResult && (
                <div className="mb-6 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                  <div className="font-semibold text-slate-200 mb-2 flex items-center justify-between">
                    <span>Exported Rows Breakdown:</span>
                    <span className="text-orange-400 font-bold">{backupResult.totalRows} Total Rows</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-slate-400">
                    {backupResult.stats.map((s) => (
                      <div key={s.table} className="flex justify-between items-center bg-slate-900/60 px-2 py-1 rounded">
                        <span className="capitalize">{s.table}:</span>
                        <span className={s.count > 0 ? "text-emerald-400 font-medium" : "text-slate-500"}>
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                onClick={handleGenerateAndDownload}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-all active:scale-[.98] disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{progressMsg || "Generating Backup..."}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>{backupDownloaded ? "Re-Download Full Backup (.sql)" : "Download Full System Backup (.sql)"}</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-center text-slate-500 mt-2">
                Running this file in any Supabase project restores 100% of your data.
              </p>
            </div>
          </div>

          {/* STEP 2: HARD RESET & DATABASE CLEAR */}
          <div className={`rounded-2xl bg-slate-900/80 border p-6 flex flex-col justify-between shadow-xl relative overflow-hidden transition-all duration-300 ${
            backupDownloaded ? "border-red-500/40" : "border-slate-800 opacity-80"
          }`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Step 2: System Hard Reset
                </span>

                <span className={`text-xs flex items-center gap-1 font-medium px-2 py-0.5 rounded-full ${
                  backupDownloaded ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                }`}>
                  {backupDownloaded ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {backupDownloaded ? "Unlocked" : "Locked (Download Backup First)"}
                </span>
              </div>

              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-red-400" />
                Hard Reset (Database Clear)
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Completely wipes all recorded operational activity from the database:
              </p>

              <div className="rounded-xl bg-red-950/20 border border-red-500/20 p-3 mb-6 text-xs text-red-200/90 space-y-1.5">
                <p className="font-semibold text-red-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" /> What will be wiped:
                </p>
                <p>• All Checklists, Fuel Logs, and Meter Photos</p>
                <p>• All Driver Daily Tasks, Routes, and Delivery Proofs</p>
                <p>• All Repair Requests, Voice Memos, and Cost Entries</p>
                <p>• Local Browser Cache & Stored Sessions</p>
                <p className="text-slate-400 text-[11px] pt-1">
                  (Core Admin and Manager accounts will be preserved for fresh login).
                </p>
              </div>
            </div>

            <div>
              {/* SWIPE LEFT TO RESET INTERACTIVE SLIDER */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                  <span>Swipe Left to Confirm Hard Reset:</span>
                  <span className="text-[11px] text-red-400">Irreversible Action</span>
                </label>

                <div
                  ref={trackRef}
                  onMouseDown={handleTouchStart}
                  onMouseMove={handleTouchMove}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`relative w-full h-14 rounded-2xl border flex items-center px-1.5 overflow-hidden select-none transition-all ${
                    backupDownloaded
                      ? "bg-gradient-to-l from-red-950/40 via-red-900/20 to-slate-900 border-red-500/40 cursor-pointer shadow-inner"
                      : "bg-slate-950 border-slate-800 cursor-not-allowed opacity-50"
                  }`}
                >
                  {/* Background Track Label */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs font-semibold text-red-400/70 pointer-events-none">
                    <span className="animate-pulse">⬅️ Drag thumb to the LEFT to Reset</span>
                  </div>

                  {/* Left Target Zone */}
                  <div className="absolute left-2 w-10 h-10 rounded-xl bg-red-600/30 border border-red-500/40 flex items-center justify-center pointer-events-none text-red-400">
                    <RotateCcw className="w-4 h-4 animate-spin-slow" />
                  </div>

                  {/* Draggable Thumb (starts at right, drags to left) */}
                  <div
                    style={{
                      transform: `translateX(${sliderPosition}%)`,
                      right: "6px",
                      position: "absolute",
                      transition: isDragging ? "none" : "transform 0.3s ease-out",
                    }}
                    className={`w-11 h-11 rounded-xl shadow-lg flex items-center justify-center text-white font-bold transition-shadow ${
                      backupDownloaded
                        ? "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-500/30 active:scale-95 cursor-grab active:cursor-grabbing"
                        : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    <ArrowLeft className="w-5 h-5 animate-pulse" />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    {backupDownloaded
                      ? "Drag the red thumb from right to left"
                      : "🔒 Download backup to unlock reset slider"}
                  </span>

                  {backupDownloaded && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("CONFIRM HARD RESET:\nAre you sure you want to completely clear the database?")) {
                          executeHardReset();
                        }
                      }}
                      className="text-[11px] text-red-400 hover:text-red-300 underline underline-offset-2"
                    >
                      Or click here to reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Banner at bottom */}
        <div className="mt-8 rounded-xl bg-slate-900/50 border border-slate-800 p-4 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              All operations are protected with atomic rollbacks and offline local storage synchronization.
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">FleetOps v2.4 (Build Safe)</span>
        </div>
      </div>

      {/* FULLSCREEN RESET LOADING & WELCOME BACK ANIMATION MODAL */}
      {isResetting && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
            {/* Glow effects */}
            <div className={`absolute -top-20 -left-20 w-48 h-48 rounded-full blur-3xl transition-all duration-700 ${
              resetFinished ? "bg-emerald-500/20" : "bg-red-500/20"
            }`} />

            {!resetFinished ? (
              // Stage 1: Loading & Progress
              <div className="space-y-6">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 relative">
                  <RotateCcw className="w-9 h-9 animate-spin text-red-500" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Executing Hard Reset...</h3>
                  <p className="text-sm text-slate-400 h-10 flex items-center justify-center">
                    {resetStep}
                  </p>
                </div>

                {/* Progress track */}
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div className="bg-gradient-to-r from-red-500 to-rose-400 h-full w-full animate-pulse" />
                </div>

                <p className="text-xs text-slate-500">
                  Please do not close this browser window.
                </p>
              </div>
            ) : (
              // Stage 2: Welcome Back Animation
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
                  <Sparkles className="w-10 h-10 animate-bounce text-emerald-400" />
                </div>

                <div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 inline-block mb-3">
                    System Reset Complete
                  </span>
                  <h3 className="text-2xl font-black text-white tracking-tight mb-2">
                    Welcome Back to FleetOps!
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
                    All operational logs have been cleared. Initializing fresh session and redirecting to login...
                  </p>
                </div>

                {/* Smooth Progress into login */}
                <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full w-full transition-all duration-3000 ease-linear animate-pulse" />
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Ready for clean deployment
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default DbBackupPage;

