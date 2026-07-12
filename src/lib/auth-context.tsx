import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { sendLoginNotification } from "@/lib/discord-login.functions";

export type Profile = {
  id: string;
  user_id: string;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, profile: null, isAdmin: false, loading: true,
  signInWithGoogle: async () => {}, signOut: async () => {},
});

export function useAuth() { return useContext(Ctx); }

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, user_id, phone, display_name, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUserExtras(userId: string) {
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, user_id, phone, display_name, avatar_url").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      setProfile((p as Profile | null) ?? null);
      setIsAdmin((roles ?? []).some((r: { role: string }) => r.role === "admin"));
    }

    async function fireLoginWebhook(u: User) {
      const key = `login-webhook-fired:${u.id}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch { /* ignore */ }
      const { data } = await supabase.from("app_settings").select("discord_webhook_login_url").eq("id", 1).maybeSingle();
      const url = (data as { discord_webhook_login_url: string | null } | null)?.discord_webhook_login_url;
      if (!url) return;
      const { data: p } = await supabase.from("profiles").select("display_name, avatar_url").eq("user_id", u.id).maybeSingle();
      const prof = p as { display_name: string | null; avatar_url: string | null } | null;
      await sendLoginNotification({ data: {
        webhookUrl: url,
        email: u.email ?? null,
        displayName: prof?.display_name ?? (u.user_metadata?.full_name as string | undefined) ?? (u.user_metadata?.name as string | undefined) ?? null,
        avatarUrl: prof?.avatar_url ?? (u.user_metadata?.avatar_url as string | undefined) ?? null,
      }});
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED" && event !== "INITIAL_SESSION") return;
      setSession(s);
      if (s?.user) {
        setTimeout(() => { loadUserExtras(s.user.id).catch(console.error); }, 0);
        if (event === "SIGNED_IN") {
          setTimeout(() => { fireLoginWebhook(s.user).catch(console.error); }, 0);
        }
      } else {
        setProfile(null); setIsAdmin(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadUserExtras(data.session.user.id).catch(console.error);
      setLoading(false);
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const signInWithGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) throw result.error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, profile, isAdmin, loading, signInWithGoogle, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
