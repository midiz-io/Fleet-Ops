import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wrench, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const loginSchema = z.object({
  phone: z.string().min(10, "Phone number is required"),
  pin: z.string().length(4, "PIN must be 4 digits"),
  rememberMe: z.boolean().default(false),
});

export function Login() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Purge any legacy plain-text saved PIN from localStorage on mount
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("fleet_saved_pin");
    } catch {}
  }

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: localStorage.getItem("fleet_saved_phone") || "",
      pin: "",
      rememberMe: localStorage.getItem("fleet_remember_me") === "true",
    },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    try {
      setIsLoading(true);
      await login(values.phone, values.pin, values.rememberMe);

      // Never store plain-text PIN in localStorage
      localStorage.removeItem("fleet_saved_pin");
      if (values.rememberMe) {
        localStorage.setItem("fleet_remember_me", "true");
        localStorage.setItem("fleet_saved_phone", values.phone);
      } else {
        localStorage.removeItem("fleet_remember_me");
        localStorage.removeItem("fleet_saved_phone");
      }

      toast({
        title: "Success",
        description: "Logged in successfully",
      });
      setLocation("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to login",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      <Card className="w-full max-w-sm border-border shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center">
            <Wrench className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold uppercase tracking-wider">{t("appName")}</CardTitle>
            <CardDescription>{t("enterPhonePin")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("phoneLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder="07XXXXXXXX" type="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("pinLabel")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          placeholder="••••" 
                          type={showPin ? "text" : "password"} 
                          maxLength={4} 
                          inputMode="numeric" 
                          {...field} 
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPin(!showPin)}
                        >
                          {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md py-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal text-sm cursor-pointer">
                        {t("rememberMe")}
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full font-semibold" disabled={isLoading}>
                {isLoading ? t("authenticating") : t("login")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
