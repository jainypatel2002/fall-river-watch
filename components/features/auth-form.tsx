"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";

export function AuthForm() {
  const supabase = useSupabaseBrowser();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  async function handleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Signed in");
    router.push("/");
    router.refresh();
  }

  async function handleSignup() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName.trim() || undefined
        }
      }
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Account created. If email confirmation is enabled, check your inbox.");
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="mx-auto mt-12 w-full max-w-md border-zinc-200 bg-white/90 backdrop-blur">
      <CardHeader>
        <CardTitle style={{ fontFamily: "var(--font-heading)" }}>Welcome</CardTitle>
        <CardDescription>Sign in or create your account to report and verify incidents.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1">
              Login
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              Sign up
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-3">
            <label className="text-sm font-medium">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <Input type="email" className="pl-9" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </div>

            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <Input type="password" className="pl-9" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
            </div>

            <Button disabled={loading} onClick={handleLogin} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </TabsContent>

          <TabsContent value="signup" className="space-y-3">
            <label className="text-sm font-medium">Display name</label>
            <div className="relative">
              <UserCircle2 className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <Input value={displayName} className="pl-9" onChange={(event) => setDisplayName(event.target.value)} placeholder="Neighbor Jane" />
            </div>

            <label className="text-sm font-medium">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <Input type="email" className="pl-9" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </div>

            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <Input type="password" className="pl-9" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
            </div>

            <Button disabled={loading} onClick={handleSignup} className="w-full">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
