import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={`flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 ${className || ""}`}>
      <Globe className="w-4 h-4 text-muted-foreground ml-1 mr-0.5" />
      <Button
        type="button"
        size="sm"
        variant={language === "en" ? "default" : "ghost"}
        className={`h-7 px-2 text-xs font-semibold rounded-md ${
          language === "en" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => setLanguage("en")}
      >
        EN
      </Button>
      <Button
        type="button"
        size="sm"
        variant={language === "si" ? "default" : "ghost"}
        className={`h-7 px-2 text-xs font-semibold rounded-md ${
          language === "si" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => setLanguage("si")}
      >
        සිංහල
      </Button>
    </div>
  );
}
