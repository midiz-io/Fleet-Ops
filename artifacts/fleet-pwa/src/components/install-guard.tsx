import { useState, useEffect, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface InstallGuardProps {
  children: ReactNode;
}

export function InstallGuard({ children }: InstallGuardProps) {
  const [isStandalone, setIsStandalone] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode
    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia("(display-mode: standalone)").matches || 
                               (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);
      setIsLoaded(true);
    };

    checkStandalone();
    
    // Also check on resize/change
    window.matchMedia("(display-mode: standalone)").addEventListener("change", checkStandalone);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsStandalone(false);
    };

    // Check if it already fired and was captured globally
    if ((window as any).deferredPrompt) {
      handleBeforeInstallPrompt((window as any).deferredPrompt);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.matchMedia("(display-mode: standalone)").removeEventListener("change", checkStandalone);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        // Sometimes the app takes a moment to switch contexts
      }
    }
  };

  // Prevent flicker before initial check
  if (!isLoaded) return null;

  // Bypass the force-install screen to allow mobile browser usage
  return <>{children}</>;

  // Otherwise, render the force-install screen
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
      <div className="max-w-md w-full bg-card border shadow-xl rounded-3xl p-8 space-y-8 relative overflow-hidden">
        {/* Decorative background circle */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10" />
        
        <div className="flex justify-center">
          <img 
            src="/pwa-192x192.png" 
            alt="Fleet App Logo" 
            className="w-28 h-28 rounded-2xl shadow-lg ring-4 ring-background" 
          />
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertCircle className="w-6 h-6" />
            <h1 className="text-2xl font-bold tracking-tight">Installation Required</h1>
          </div>
          <p className="text-muted-foreground text-[15px] leading-relaxed">
            This application is designed as a standalone Progressive Web App. For the best experience and offline support, please install it on your device to continue.
          </p>
        </div>

        <div className="pt-4">
          {deferredPrompt ? (
            <Button onClick={handleInstallClick} className="w-full text-lg h-14 rounded-xl shadow-lg hover:shadow-xl transition-all" size="lg">
              Install App Now
            </Button>
          ) : isIOS ? (
            <div className="bg-muted/50 border p-5 rounded-2xl text-sm text-left space-y-3">
              <p className="font-semibold text-foreground flex items-center gap-2">
                <span className="bg-background shadow-sm px-2 py-1 rounded text-xs border">iOS Device Detected</span>
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-muted-foreground font-medium">
                <li>Tap the <strong className="text-foreground">Share</strong> icon in the safari menu bar.</li>
                <li>Scroll down and select <strong className="text-foreground">Add to Home Screen</strong>.</li>
              </ol>
            </div>
          ) : (
            <div className="bg-muted/50 border p-5 rounded-2xl text-sm text-left space-y-2">
              <p className="font-semibold text-foreground">How to install:</p>
              <p className="text-muted-foreground font-medium">Look for the install icon <span className="inline-block translate-y-1 bg-background shadow-sm p-1 rounded border">âŠ•</span> in your browser's address bar or select "Install App" from the browser menu.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

