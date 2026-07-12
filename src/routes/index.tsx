import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { sendDiscordNotification } from "@/lib/discord.functions";
import { sendLoginNotification } from "@/lib/discord-login.functions";
import { extractSlipAmount, type OcrStatus, type SlipType } from "@/lib/ocr.functions";
import {
  Upload, Save, Settings, Wallet, TrendingUp, X, Loader2, CheckCircle2,
  Image as ImageIcon, Plus, ChevronRight, Trash2, Pencil, Check, ScanText, Download,
  Landmark, Smartphone, UtensilsCrossed, SprayCan, Globe, Package, Tag, Sparkles,
  XCircle, FlaskConical, LogIn, LogOut, User as UserIcon,
} from "lucide-react";
import type { ComponentType, SVGProps, ReactNode } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export const SLIP_TYPES: { key: SlipType; label: string; icon: IconType }[] = [
  { key: "bank", label: "ธนาคาร", icon: Landmark },
  { key: "wallet", label: "วอเล็ท", icon: Smartphone },
];

export const Route = createFileRoute("/")({ component: Dashboard });

export type Category = string;

export const QUICK: { key: string; label: string; sub: string; token: string; icon: IconType }[] = [
  { key: "ซื้อข้าว", label: "ซื้อข้าว", sub: "Food", token: "cat-food", icon: UtensilsCrossed },
  { key: "กินของใช้", label: "กินของใช้", sub: "Daily Supplies", token: "cat-supplies", icon: SprayCan },
  { key: "จ่ายค่าเว็บ", label: "จ่ายค่าเว็บ", sub: "Web / API", token: "cat-web", icon: Globe },
  { key: "จ่ายค่าสต็อกของ", label: "จ่ายค่าสต็อกของ", sub: "Stock / Inventory", token: "cat-stock", icon: Package },
];

export interface ExpenseRow {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  slip_url: string | null;
  slip_urls: string[] | null;
  created_at: string;
  ocr_raw: string | null;
  ocr_amount: number | null;
  ocr_status: OcrStatus | null;
  ocr_at: string | null;
  slip_type: SlipType | null;
}

export const THB = (n: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(n);

export function tokenFor(cat: string): string {
  const found = QUICK.find((q) => q.key === cat);
  return found ? found.token : "cat-other";
}

export function iconFor(cat: string): IconType {
  return QUICK.find((q) => q.key === cat)?.icon ?? Tag;
}

export function slipsOf(e: ExpenseRow): string[] {
  const arr = e.slip_urls && e.slip_urls.length > 0 ? e.slip_urls : e.slip_url ? [e.slip_url] : [];
  return arr.filter(Boolean);
}

function Dashboard() {
  const { user: _authUser, loading: _authLoading } = useAuth();
  if (_authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!_authUser) return <LoginGate />;
  return <DashboardInner />;
}

function LoginGate() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-[color-mix(in_oklab,var(--primary)_6%,var(--background))] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card/80 p-8 text-center shadow-xl backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_60%,white)] text-primary-foreground shadow-lg shadow-primary/20">
          <Wallet className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Daily Expenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">กรุณาเข้าสู่ระบบเพื่อใช้งาน</p>
        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
        <button
          onClick={async () => {
            setErr(null); setLoading(true);
            try { await signInWithGoogle(); }
            catch (e) { setErr((e as Error).message); }
            finally { setLoading(false); }
          }}
          disabled={loading}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          เข้าสู่ระบบด้วย Google
        </button>
      </div>
    </div>
  );
}

function DashboardInner() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const sendDiscord = useServerFn(sendDiscordNotification);
  const runOcr = useServerFn(extractSlipAmount);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [webhookInput, setWebhookInput] = useState("");
  const [webhookBankInput, setWebhookBankInput] = useState("");
  const [webhookWalletInput, setWebhookWalletInput] = useState("");
  const [webhookLoginInput, setWebhookLoginInput] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<{
    amount: number | null; raw: string; status: OcrStatus; at: string;
  } | null>(null);
  const [slipType, setSlipType] = useState<SlipType | "">("");
  const [fileTypes, setFileTypes] = useState<(SlipType | null)[]>([]);
  const [fileAmounts, setFileAmounts] = useState<(number | null)[]>([]);
  const [amountEditedManually, setAmountEditedManually] = useState(false);
  const [splitNotifications, setSplitNotifications] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("splitNotifications");
    return v == null ? true : v === "1";
  });
  useEffect(() => {
    try { localStorage.setItem("splitNotifications", splitNotifications ? "1" : "0"); } catch { /* ignore */ }
  }, [splitNotifications]);

  const perSlipSum = useMemo(
    () => fileAmounts.reduce<number>((s, a) => s + (a ?? 0), 0),
    [fileAmounts],
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const typeCounts = useMemo(() => {
    let bank = 0, wallet = 0, unknown = 0;
    for (const t of fileTypes) {
      if (t === "bank") bank++;
      else if (t === "wallet") wallet++;
      else unknown++;
    }
    return { bank, wallet, unknown };
  }, [fileTypes]);

  // Auto-pick slipType when all detected slips agree (only when user hasn't manually set)
  useEffect(() => {
    if (typeCounts.bank > 0 && typeCounts.wallet === 0) setSlipType("bank");
    else if (typeCounts.wallet > 0 && typeCounts.bank === 0) setSlipType("wallet");
    else if (typeCounts.bank > 0 && typeCounts.wallet > 0) setSlipType("");
  }, [typeCounts.bank, typeCounts.wallet]);

  async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    let s = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  async function autoFillAmount(file: File) {
    if (!file.type.startsWith("image/")) return;
    setOcrLoading(true);
    setOcrMsg(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const result = await runOcr({ data: { imageBase64, mimeType: file.type } });
      const at = new Date().toISOString();
      setOcrResult({ amount: result.amount, raw: result.raw, status: result.status, at });
      // Always sync with the latest slip; reset to "" if OCR can't tell
      setSlipType(result.slipType ?? "");
      if (result.amount != null && result.amount > 0) {
        setAmount(String(result.amount));
        const typeLabel = result.slipType === "wallet" ? " (วอเล็ท)" : result.slipType === "bank" ? " (ธนาคาร)" : "";
        setOcrMsg(`อ่านยอดจากสลิปได้: ${result.amount.toLocaleString("th-TH")} บาท${typeLabel}`);
      } else {
        setOcrMsg("ไม่พบยอดเงินในสลิป กรุณากรอกเอง");
      }
    } catch (e) {
      const at = new Date().toISOString();
      setOcrResult({ amount: null, raw: (e as Error).message, status: "error", at });
      setOcrMsg(`อ่านสลิปไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setOcrLoading(false);
    }
  }


  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase.from("expenses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      return data as {
        discord_webhook_url: string | null;
        discord_webhook_bank_url: string | null;
        discord_webhook_wallet_url: string | null;
        discord_webhook_login_url: string | null;
      } | null;
    },
  });
  useEffect(() => {
    if (settings) {
      setWebhookInput(settings.discord_webhook_url ?? "");
      setWebhookBankInput(settings.discord_webhook_bank_url ?? "");
      setWebhookWalletInput(settings.discord_webhook_wallet_url ?? "");
      setWebhookLoginInput(settings.discord_webhook_login_url ?? "");
    }
  }, [settings]);

  const saveWebhook = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_settings").upsert({
        id: 1,
        discord_webhook_url: webhookInput.trim() || null,
        discord_webhook_bank_url: webhookBankInput.trim() || null,
        discord_webhook_wallet_url: webhookWalletInput.trim() || null,
        discord_webhook_login_url: webhookLoginInput.trim() || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setShowSettings(false); },
  });

  const { user: authUser, profile: authProfile } = useAuth();
  const sendLogin = useServerFn(sendLoginNotification);
  const testWebhook = useMutation({
    mutationFn: async (which: "default" | "bank" | "wallet" | "login") => {
      const url = (
        which === "bank" ? webhookBankInput :
        which === "wallet" ? webhookWalletInput :
        which === "login" ? webhookLoginInput : webhookInput
      ).trim();
      if (!url) throw new Error("Webhook URL is empty");
      if (which === "login") {
        await sendLogin({ data: {
          webhookUrl: url,
          email: authUser?.email ?? null,
          displayName: authProfile?.display_name ?? null,
          avatarUrl: authProfile?.avatar_url ?? (authUser?.user_metadata?.avatar_url as string | undefined) ?? null,
        }});
      } else {
        await sendDiscord({ data: {
          webhookUrl: url, category: "ทดสอบ", amount: 0,
          note: `Test message (${which}) from Daily Expense Tracker`,
          slipUrls: [],
          slipType: which === "bank" ? "bank" : which === "wallet" ? "wallet" : null,
        }});
      }
    },
    onSuccess: () => setWebhookStatus({ ok: true, text: "ส่งข้อความทดสอบสำเร็จ" }),
    onError: (e: Error) => setWebhookStatus({ ok: false, text: e.message }),
  });

  async function signedUrl(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from("slips").createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl ?? null;
  }

  // Persist user-created custom categories across sessions
  useEffect(() => {
    try {
      const raw = localStorage.getItem("customCategories");
      if (raw) setCustomCategories(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("customCategories", JSON.stringify(customCategories)); } catch { /* ignore */ }
  }, [customCategories]);

  // Merge with categories already used in DB
  const allCustomCats = useMemo(() => {
    const quickKeys = new Set(QUICK.map((q) => q.key));
    const fromDb = expenses.map((e) => e.category).filter((c) => !quickKeys.has(c));
    return Array.from(new Set([...customCategories, ...fromDb]));
  }, [customCategories, expenses]);

  const saveExpense = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      const cat = category as string;
      if (!amt || amt <= 0) throw new Error("กรุณาใส่จำนวนเงินที่ถูกต้อง");
      if (!cat) throw new Error("กรุณาเลือกหมวดหมู่");

      // Upload all files first
      const uploaded: { path: string; signed: string | null; type: SlipType | null; amount: number | null }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("slips").upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) throw upErr;
        const s = await signedUrl(path);
        uploaded.push({ path, signed: s, type: fileTypes[i] ?? null, amount: fileAmounts[i] ?? null });
      }

      // Group by slip type when there are multiple distinct detected types
      const distinctTypes = new Set(uploaded.map((u) => u.type).filter((t): t is SlipType => t != null));
      const allAmountsKnown = uploaded.length > 0 && uploaded.every((u) => u.amount != null && u.amount > 0);
      const shouldSplit = splitNotifications && distinctTypes.size > 1 && allAmountsKnown;

      type Group = { type: SlipType | null; paths: string[]; signed: string[]; amount: number };
      const groups: Group[] = shouldSplit
        ? Array.from(distinctTypes).map((t) => {
            const items = uploaded.filter((u) => u.type === t);
            return {
              type: t,
              paths: items.map((u) => u.path),
              signed: items.map((u) => u.signed).filter((x): x is string => !!x),
              amount: items.reduce((s, u) => s + (u.amount ?? 0), 0),
            };
          })
        : [{
            type: (slipType || null) as SlipType | null,
            paths: uploaded.map((u) => u.path),
            signed: uploaded.map((u) => u.signed).filter((x): x is string => !!x),
            amount: amt,
          }];

      const inserted: unknown[] = [];
      for (const g of groups) {
        const { data, error } = await supabase.from("expenses").insert({
          amount: g.amount, category: cat, note: note.trim() || null,
          slip_url: g.paths[0] ?? null, slip_urls: g.paths,
          ocr_raw: shouldSplit ? null : ocrResult?.raw ?? null,
          ocr_amount: shouldSplit ? g.amount : ocrResult?.amount ?? null,
          ocr_status: shouldSplit ? "ok" : ocrResult?.status ?? null,
          ocr_at: shouldSplit ? new Date().toISOString() : ocrResult?.at ?? null,
          slip_type: g.type,
        }).select().single();
        if (error) throw error;
        inserted.push(data);

        const typedHook =
          g.type === "bank" ? settings?.discord_webhook_bank_url :
          g.type === "wallet" ? settings?.discord_webhook_wallet_url : null;
        const hook = typedHook || settings?.discord_webhook_url;
        if (hook) {
          try {
            await sendDiscord({ data: {
              webhookUrl: hook, category: cat, amount: g.amount, note: note.trim() || null,
              slipUrls: g.signed, slipType: g.type,
            }});
          } catch (e) { console.warn("Discord webhook failed", e); }
        }
      }
      return inserted;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setAmount(""); setNote(""); setCategory("");
      setNewCatOpen(false); setNewCatInput("");
      setFiles([]); setFileTypes([]); setFileAmounts([]); setAmountEditedManually(false); if (fileRef.current) fileRef.current.value = "";
      setOcrMsg(null); setOcrResult(null); setSlipType("");
    },
  });

  const monthly = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const inMonth = expenses.filter((e) => {
      const d = new Date(e.created_at);
      return d.getFullYear() === y && d.getMonth() === m;
    });
    const total = inMonth.reduce((s, e) => s + Number(e.amount), 0);
    const byCat = new Map<string, number>();
    inMonth.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount)));
    const breakdown = Array.from(byCat.entries())
      .map(([cat, amt]) => ({ cat, amt, pct: total ? (amt / total) * 100 : 0 }))
      .sort((a, b) => b.amt - a.amt);
    return { total, count: inMonth.length, breakdown };
  }, [expenses]);

  const selectedCat = category;

  function confirmNewCategory() {
    const name = newCatInput.trim();
    if (!name) return;
    const quickKeys = new Set(QUICK.map((q) => q.key));
    if (!quickKeys.has(name) && !customCategories.includes(name)) {
      setCustomCategories((prev) => [...prev, name]);
    }
    setCategory(name);
    setNewCatInput("");
    setNewCatOpen(false);
  }

  function removeCustomCategory(name: string) {
    setCustomCategories((prev) => prev.filter((c) => c !== name));
    if (category === name) setCategory("");
  }

  async function ocrOne(file: File): Promise<{ amount: number | null; raw: string; status: OcrStatus; slipType: SlipType | null } | null> {
    if (!file.type.startsWith("image/")) return null;
    try {
      const imageBase64 = await fileToBase64(file);
      const r = await runOcr({ data: { imageBase64, mimeType: file.type } });
      return { amount: r.amount, raw: r.raw, status: r.status, slipType: r.slipType ?? null };
    } catch (e) {
      return { amount: null, raw: (e as Error).message, status: "error", slipType: null };
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    const startIndex = files.length;
    setFiles((prev) => [...prev, ...arr]);
    setFileTypes((prev) => [...prev, ...arr.map(() => null)]);
    setFileAmounts((prev) => [...prev, ...arr.map(() => null)]);
    if (fileRef.current) fileRef.current.value = "";

    // If this is the very first batch, clear stale OCR/amount so the new slips drive it
    if (startIndex === 0) {
      setOcrResult(null);
      setOcrMsg(null);
      setSlipType("");
      setAmount("");
      setAmountEditedManually(false);
    }

    setOcrLoading(true);
    void (async () => {
      const results = await Promise.all(arr.map(ocrOne));
      setFileTypes((prev) => {
        const next = [...prev];
        results.forEach((r, i) => { next[startIndex + i] = r?.slipType ?? null; });
        return next;
      });
      setFileAmounts((prev) => {
        const next = [...prev];
        results.forEach((r, i) => { next[startIndex + i] = r?.amount ?? null; });
        return next;
      });

      // Record ocrResult from the first image that produced an amount (for OCR audit)
      const firstAmountIdx = results.findIndex((r) => r?.amount != null && r.amount > 0);
      const primary = firstAmountIdx >= 0 ? results[firstAmountIdx] : results.find((r) => r != null) ?? null;
      if (primary) {
        const at = new Date().toISOString();
        setOcrResult({ amount: primary.amount, raw: primary.raw, status: primary.status, at });
      }
      setOcrLoading(false);
    })();
  }

  // Auto-fill amount as the sum of all detected slip amounts (unless user typed manually)
  useEffect(() => {
    if (amountEditedManually) return;
    if (perSlipSum > 0) setAmount(String(perSlipSum));
  }, [perSlipSum, amountEditedManually]);



  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-[color-mix(in_oklab,var(--primary)_6%,var(--background))]">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_60%,white)] text-primary-foreground shadow-lg shadow-primary/20">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Daily Expenses</h1>
              <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">บันทึกรายจ่าย · แนบสลิป · แจ้งเตือน Discord</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AuthBadge />
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <TrendingUp className="h-4 w-4" /> <span className="hidden sm:inline">แดชบอร์ด</span>
            </Link>
            <button
              onClick={() => { setShowSettings(true); setWebhookStatus(null); }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </header>


        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* LOG FORM */}
          <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-xl shadow-black/10 backdrop-blur md:p-6">
            <h2 className="mb-4 text-base font-semibold">บันทึกรายการใหม่</h2>

            <div>
              <span className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">สลิป / ใบเสร็จ ({previews.length})</span>
              {previews.length === 0 ? (
                <label className="relative flex min-h-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 transition hover:border-primary/60 hover:bg-muted/50">
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <Upload className="h-6 w-6" />
                    <span className="text-sm">คลิกเพื่อเลือกรูป (เพิ่มได้หลายรูป)</span>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => addFiles(e.target.files)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {previews.map((src, i) => (
                    <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                      <img src={src} alt={`slip-${i}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setFiles((prev) => prev.filter((_, idx) => idx !== i));
                          setFileTypes((prev) => prev.filter((_, idx) => idx !== i));
                          setFileAmounts((prev) => prev.filter((_, idx) => idx !== i));
                          if (files.length - 1 === 0) {
                            setSlipType("");
                            setOcrResult(null);
                            setOcrMsg(null);
                            setAmount("");
                            setAmountEditedManually(false);
                          }
                        }}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
                        aria-label="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground transition hover:border-primary/60 hover:text-foreground">
                    <Plus className="h-5 w-5" />
                    <span className="text-[10px]">เพิ่มรูป</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => addFiles(e.target.files)}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {files.length > 1 && (
                <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      แยกยอดแต่ละสลิป ({files.length})
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      รวม {THB(perSlipSum)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {files.map((f, i) => {
                      const t = fileTypes[i];
                      const a = fileAmounts[i];
                      const TypeIcon = t === "bank" ? Landmark : t === "wallet" ? Smartphone : ImageIcon;
                      return (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                            <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${t === "bank" ? "text-blue-600" : t === "wallet" ? "text-orange-600" : "text-muted-foreground"}`} />
                            <span className="truncate">{f.name}</span>
                          </span>
                          <span className="shrink-0 tabular-nums font-medium">
                            {ocrLoading && a == null ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            ) : a != null ? (
                              THB(a)
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}


              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground">ประเภทสลิป</span>
                  {files.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {typeCounts.bank > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-medium text-blue-600 dark:text-blue-400">
                          <Landmark className="h-3 w-3" /> สลิปธนาคาร {typeCounts.bank}
                        </span>
                      )}
                      {typeCounts.wallet > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 font-medium text-orange-600 dark:text-orange-400">
                          <Smartphone className="h-3 w-3" /> สลิปวอเล็ท {typeCounts.wallet}
                        </span>
                      )}
                      {typeCounts.unknown > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
                          ? ไม่ระบุ {typeCounts.unknown}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {SLIP_TYPES.map((s) => {
                    const active = slipType === s.key;
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setSlipType(active ? "" : s.key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {s.label}
                        {active && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                  {ocrResult && !slipType && typeCounts.bank > 0 && typeCounts.wallet > 0 && (
                    <span className="inline-flex items-center text-[11px] text-muted-foreground">— สลิปผสม เลือกประเภทหลักได้</span>
                  )}
                  {ocrResult && !slipType && typeCounts.bank === 0 && typeCounts.wallet === 0 && (
                    <span className="inline-flex items-center text-[11px] text-muted-foreground">— AI ไม่แน่ใจ เลือกเองได้</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr]">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Amount (THB)
                  {ocrLoading && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium normal-case text-primary">
                      <Loader2 className="h-3 w-3 animate-spin" /> กำลังอ่านสลิป...
                    </span>
                  )}
                </span>
                <input
                  inputMode="decimal"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setAmountEditedManually(true); }}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-lg font-medium outline-none transition focus:border-primary"
                />
                {ocrMsg && !ocrLoading && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3" />{ocrMsg}</p>
                )}
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">Short note</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น กาแฟตอนเช้า"
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 outline-none transition focus:border-primary"
                />
              </label>
            </div>

            <div className="mt-5">
              <span className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">Category</span>
              <div className="grid grid-cols-2 gap-2">
                {QUICK.map((q) => {
                  const active = category === q.key;
                  return (
                    <button
                      key={q.key}
                      type="button"
                      onClick={() => setCategory(q.key)}
                      className="group relative flex items-center gap-3 rounded-xl border p-3 text-left transition hover:-translate-y-0.5"
                      style={{
                        borderColor: active ? `var(--${q.token})` : "var(--color-border)",
                        background: active
                          ? `color-mix(in oklab, var(--${q.token}) 20%, var(--color-card))`
                          : "var(--color-card)",
                        boxShadow: active ? `0 8px 24px -12px color-mix(in oklab, var(--${q.token}) 60%, transparent)` : undefined,
                      }}
                    >
                      <q.icon className="h-6 w-6" style={{ color: `var(--${q.token})` }} />
                      {/* icon */}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{q.label}</span>
                        <span className="truncate text-xs text-muted-foreground">{q.sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {allCustomCats.length > 0 && (
                <div className="mt-3">
                  <span className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">หมวดที่สร้างไว้</span>
                  <div className="flex flex-wrap gap-2">
                    {allCustomCats.map((c) => {
                      const active = category === c;
                      return (
                        <div key={c} className="group relative">
                          <button
                            type="button"
                            onClick={() => setCategory(c)}
                            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition"
                            style={{
                              borderColor: active ? "var(--cat-other)" : "var(--color-border)",
                              background: active
                                ? "color-mix(in oklab, var(--cat-other) 22%, var(--color-card))"
                                : "var(--color-card)",
                            }}
                          >
                            <Tag className="h-3.5 w-3.5" />
                            <span className="truncate max-w-[160px]">{c}</span>
                          </button>
                          {customCategories.includes(c) && (
                            <button
                              type="button"
                              onClick={() => removeCustomCategory(c)}
                              className="absolute -right-1 -top-1 hidden rounded-full border border-border bg-background p-0.5 group-hover:block"
                              aria-label={`ลบหมวด ${c}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-3">
                {!newCatOpen ? (
                  <button
                    type="button"
                    onClick={() => setNewCatOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" /> สร้างหมวดหมู่ใหม่
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={newCatInput}
                      onChange={(e) => setNewCatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmNewCategory(); } }}
                      placeholder="ชื่อหมวดหมู่ใหม่..."
                      className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={confirmNewCategory}
                      disabled={!newCatInput.trim()}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
                    >
                      เพิ่ม
                    </button>
                    <button
                      type="button"
                      onClick={() => { setNewCatOpen(false); setNewCatInput(""); }}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>
            </div>


            {saveExpense.error && (
              <p className="mt-4 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
                {(saveExpense.error as Error).message}
              </p>
            )}
            {saveExpense.isSuccess && !saveExpense.isPending && (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" /> บันทึกสำเร็จ
              </p>
            )}

            <button
              onClick={() => saveExpense.mutate()}
              disabled={!isAdmin || saveExpense.isPending || !amount || !selectedCat}
              title={!isAdmin ? "เฉพาะแอดมินเท่านั้นที่บันทึกได้" : undefined}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:opacity-40"
            >
              {saveExpense.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isAdmin ? "Save Record" : "อ่านอย่างเดียว (ต้องเป็นแอดมิน)"}
            </button>
          </section>

          {/* SUMMARY */}
          <section className="space-y-6">
            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-xl shadow-black/10 backdrop-blur md:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5" /> รวมเดือนนี้
                  </div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{THB(monthly.total)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {monthly.count} รายการ · {new Date().toLocaleDateString("th-TH", { month: "long", year: "numeric" })}
                  </div>
                </div>
                <TrendingUp className="h-8 w-8 text-primary/60" />
              </div>

              <div className="mt-6 space-y-3">
                {monthly.breakdown.length === 0 && (
                  <p className="text-sm text-muted-foreground">ยังไม่มีรายการในเดือนนี้</p>
                )}
                {monthly.breakdown.map(({ cat, amt, pct }) => {
                  const token = tokenFor(cat);
                  return (
                    <Link
                      to="/c/$name"
                      params={{ name: encodeURIComponent(cat) }}
                      key={cat}
                      className="block rounded-lg p-2 -mx-2 transition hover:bg-accent/40"
                    >
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {(() => { const Icon = iconFor(cat); return <Icon className="h-4 w-4" style={{ color: `var(--${token})` }} />; })()}
                          <span className="truncate">{cat}</span>
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <span className="tabular-nums">{THB(amt)}</span>
                          <span className="text-xs">· {pct.toFixed(0)}%</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `var(--${token})` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <CategoryGrid expenses={expenses} />

            <RecentLog expenses={expenses.slice(0, 12)} />
          </section>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          value={webhookInput}
          bankValue={webhookBankInput}
          walletValue={webhookWalletInput}
          loginValue={webhookLoginInput}
          onChange={setWebhookInput}
          onChangeBank={setWebhookBankInput}
          onChangeWallet={setWebhookWalletInput}
          onChangeLogin={setWebhookLoginInput}
          onClose={() => setShowSettings(false)}
          onSave={() => saveWebhook.mutate()}
          onTest={(which) => { setWebhookStatus(null); testWebhook.mutate(which); }}
          saving={saveWebhook.isPending}
          testing={testWebhook.isPending}
          status={webhookStatus}
          splitNotifications={splitNotifications}
          onChangeSplit={setSplitNotifications}
        />
      )}
    </div>
  );
}

function CategoryGrid({ expenses }: { expenses: ExpenseRow[] }) {
  const qc = useQueryClient();
  const totals = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const map = new Map<string, { amt: number; count: number }>();
    expenses.forEach((e) => {
      const d = new Date(e.created_at);
      if (d.getFullYear() !== y || d.getMonth() !== m) return;
      const cur = map.get(e.category) ?? { amt: 0, count: 0 };
      cur.amt += Number(e.amount); cur.count += 1;
      map.set(e.category, cur);
    });
    return map;
  }, [expenses]);

  const allTimeCount = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + 1));
    return map;
  }, [expenses]);

  const cats = [...QUICK.map((q) => q.key), ...Array.from(totals.keys()).filter((k) => !QUICK.find((q) => q.key === k))];

  const [pendingCat, setPendingCat] = useState<string | null>(null);
  const delCat = useMutation({
    mutationFn: async (cat: string) => {
      const { error } = await supabase.from("expenses").delete().eq("category", cat);
      if (error) throw error;
    },
    onSettled: () => { setPendingCat(null); qc.invalidateQueries({ queryKey: ["expenses"] }); },
  });

  function askDeleteCat(cat: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (delCat.isPending) return;
    const count = allTimeCount.get(cat) ?? 0;
    if (count === 0) return;
    if (window.confirm(`คุณจะลบรายการทั้งหมดในหมวด "${cat}" ใช่ไหม?\n\nจำนวน ${count} รายการจะถูกลบและไม่สามารถย้อนกลับได้`)) {
      setPendingCat(cat);
      delCat.mutate(cat);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-xl shadow-black/10 backdrop-blur md:p-6">
      <h3 className="mb-4 text-base font-semibold">หมวดหมู่ทั้งหมด</h3>
      <div className="grid grid-cols-2 gap-2">
        {cats.map((cat) => {
          const t = totals.get(cat) ?? { amt: 0, count: 0 };
          const token = tokenFor(cat);
          const total = allTimeCount.get(cat) ?? 0;
          const isPending = pendingCat === cat && delCat.isPending;
          return (
            <div key={cat} className="group relative">
              <Link
                to="/c/$name"
                params={{ name: encodeURIComponent(cat) }}
                className="flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 pr-10 transition hover:-translate-y-0.5 hover:border-primary/40"
              >
                {(() => { const Icon = iconFor(cat); return <Icon className="h-6 w-6" style={{ color: `var(--${token})` }} />; })()}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{cat}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t.count} รายการ · {THB(t.amt)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: `var(--${token})` }} />
              </Link>
              {total > 0 && (
                <button
                  type="button"
                  onClick={(e) => askDeleteCat(cat, e)}
                  disabled={isPending || delCat.isPending}
                  aria-label={`ลบรายการทั้งหมดในหมวด ${cat}`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-40"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}



function RecentLog({ expenses }: { expenses: ExpenseRow[] }) {
  const qc = useQueryClient();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [ocrOpen, setOcrOpen] = useState<Record<string, boolean>>({});
  const [typeFilter, setTypeFilter] = useState<"all" | SlipType | "none">("all");

  const filtered = useMemo(() => {
    if (typeFilter === "all") return expenses;
    if (typeFilter === "none") return expenses.filter((e) => !e.slip_type);
    return expenses.filter((e) => e.slip_type === typeFilter);
  }, [expenses, typeFilter]);

  useEffect(() => {
    const missing = expenses
      .map((e) => ({ id: e.id, path: slipsOf(e)[0] }))
      .filter((x) => x.path && !thumbs[x.id]);
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(missing.map(async (x) => {
        const { data } = await supabase.storage.from("slips").createSignedUrl(x.path!, 60 * 60);
        return [x.id, data?.signedUrl ?? ""] as const;
      }));
      setThumbs((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [expenses, thumbs]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const update = useMutation({
    mutationFn: async (payload: { id: string; amount: number; note: string | null }) => {
      const { error } = await supabase.from("expenses")
        .update({ amount: payload.amount, note: payload.note }).eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); setEditingId(null); },
  });

  function askDelete(e: ExpenseRow) {
    const label = `${e.category} · ${THB(Number(e.amount))}${e.note ? ` · ${e.note}` : ""}`;
    if (window.confirm(`คุณจะลบรายการนี้ใช่ไหม?\n\n${label}\n\nการลบไม่สามารถย้อนกลับได้`)) {
      del.mutate(e.id);
    }
  }

  function startEdit(e: ExpenseRow) {
    setEditingId(e.id);
    setEditAmount(String(e.amount));
    setEditNote(e.note ?? "");
  }

  function exportCsv() {
    const headers = [
      "id","created_at","category","amount","note","slip_type",
      "ocr_status","ocr_amount","ocr_at","ocr_raw",
      "slip_urls",
    ];
    const esc = (v: unknown) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = filtered.map((e) => [
      e.id, e.created_at, e.category, e.amount, e.note ?? "", e.slip_type ?? "",
      e.ocr_status ?? "", e.ocr_amount ?? "", e.ocr_at ?? "", e.ocr_raw ?? "",
      (slipsOf(e).join(" | ")),
    ].map(esc).join(","));
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const filterOptions: { key: "all" | SlipType | "none"; label: ReactNode }[] = [
    { key: "all", label: "ทั้งหมด" },
    { key: "bank", label: <><Landmark className="h-3 w-3" /> ธนาคาร</> },
    { key: "wallet", label: <><Smartphone className="h-3 w-3" /> วอเล็ท</> },
    { key: "none", label: "ไม่ระบุ" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-xl shadow-black/10 backdrop-blur md:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Recent transactions</h3>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {filterOptions.map((opt) => {
          const active = typeFilter === opt.key;
          const count =
            opt.key === "all" ? expenses.length :
            opt.key === "none" ? expenses.filter((x) => !x.slip_type).length :
            expenses.filter((x) => x.slip_type === opt.key).length;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTypeFilter(opt.key)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                active
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
              <span className="tabular-nums opacity-70">({count})</span>
            </button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {expenses.length === 0 ? "ยังไม่มีรายการ" : "ไม่มีรายการตรงกับตัวกรอง"}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((e) => {
            const token = tokenFor(e.category);
            const d = new Date(e.created_at);
            const slips = slipsOf(e);
            const isEditing = editingId === e.id;
            return (
              <div key={e.id} className="py-3">
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {slips[0] ? (
                    thumbs[e.id] ? (
                      <img src={thumbs[e.id]} alt="slip" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>
                  )}
                  {slips.length > 1 && (
                    <span className="absolute right-0.5 bottom-0.5 rounded bg-background/80 px-1 text-[10px] tabular-nums">+{slips.length - 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--${token})` }} />
                    <span className="truncate text-sm font-medium">{e.category}</span>
                    {e.slip_type && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          e.slip_type === "bank"
                            ? "bg-blue-500/10 text-blue-600"
                            : "bg-orange-500/10 text-orange-600"
                        }`}
                        title={e.slip_type === "bank" ? "สลิปธนาคาร" : "สลิปวอเล็ท"}
                      >
                        {e.slip_type === "bank" ? <Landmark className="h-2.5 w-2.5" /> : <Smartphone className="h-2.5 w-2.5" />}
                        {e.slip_type === "bank" ? "ธนาคาร" : "วอเล็ท"}
                      </span>
                    )}
                    {e.ocr_at && (
                      <button
                        type="button"
                        onClick={() => setOcrOpen((p) => ({ ...p, [e.id]: !p[e.id] }))}
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition ${
                          e.ocr_status === "ok" ? "bg-primary/10 text-primary hover:bg-primary/20" :
                          e.ocr_status === "no_amount" ? "bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20" :
                          "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        }`}
                        aria-label="ดูผล OCR"
                      >
                        <ScanText className="h-3 w-3" />
                        OCR
                        {e.ocr_status === "ok" && e.ocr_amount != null && Number(e.ocr_amount) !== Number(e.amount) && (
                          <span className="ml-0.5">⚠</span>
                        )}
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <input
                        type="number" step="0.01" value={editAmount}
                        onChange={(ev) => setEditAmount(ev.target.value)}
                        className="w-24 rounded-md border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
                      />
                      <input
                        value={editNote} onChange={(ev) => setEditNote(ev.target.value)}
                        placeholder="โน้ต"
                        className="min-w-0 flex-1 rounded-md border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  ) : (
                    <div className="truncate text-xs text-muted-foreground">
                      {d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} · {d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                      {e.note ? ` · ${e.note}` : ""}
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const amt = parseFloat(editAmount);
                        if (!amt || amt <= 0) return;
                        update.mutate({ id: e.id, amount: amt, note: editNote.trim() || null });
                      }}
                      disabled={update.isPending}
                      className="rounded-md p-1.5 text-primary hover:bg-primary/10 disabled:opacity-40"
                      aria-label="Save"
                    >
                      {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-right text-sm font-semibold tabular-nums">{THB(Number(e.amount))}</div>
                    <button
                      onClick={() => startEdit(e)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => askDelete(e)}
                      disabled={del.isPending}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {e.ocr_at && ocrOpen[e.id] && (
                <div className="mt-2 ml-14 rounded-lg border border-border bg-muted/40 p-2.5 text-[11px]">
                  <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                    <span>สถานะ: <b className="text-foreground">{
                      e.ocr_status === "ok" ? "อ่านสำเร็จ" :
                      e.ocr_status === "no_amount" ? "ไม่พบยอดเงิน" : "ผิดพลาด"
                    }</b></span>
                    <span>ยอดที่อ่านได้: <b className="text-foreground tabular-nums">{
                      e.ocr_amount != null ? Number(e.ocr_amount).toLocaleString("th-TH") : "—"
                    }</b></span>
                    <span>บันทึกยอด: <b className="text-foreground tabular-nums">{Number(e.amount).toLocaleString("th-TH")}</b></span>
                    <span>เวลาอ่าน: <b className="text-foreground">{new Date(e.ocr_at).toLocaleString("th-TH")}</b></span>
                  </div>
                  {e.ocr_raw && (
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-[10px] leading-snug text-foreground/80">{e.ocr_raw}</pre>
                  )}
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsModal({
  value, bankValue, walletValue, loginValue,
  onChange, onChangeBank, onChangeWallet, onChangeLogin,
  onClose, onSave, onTest, saving, testing, status,
  splitNotifications, onChangeSplit,
}: {
  value: string; bankValue: string; walletValue: string; loginValue: string;
  onChange: (v: string) => void;
  onChangeBank: (v: string) => void;
  onChangeWallet: (v: string) => void;
  onChangeLogin: (v: string) => void;
  onClose: () => void;
  onSave: () => void; onTest: (which: "default" | "bank" | "wallet" | "login") => void;
  saving: boolean; testing: boolean; status: { ok: boolean; text: string } | null;
  splitNotifications: boolean; onChangeSplit: (v: boolean) => void;
}) {
  const row = (
    label: ReactNode,
    hint: string,
    val: string,
    setVal: (v: string) => void,
    which: "default" | "bank" | "wallet" | "login",
  ) => (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <input
          type="url"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => onTest(which)}
          disabled={testing || !val.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium transition hover:bg-accent disabled:opacity-40"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Test
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Discord Webhooks</h3>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          {row(<><Landmark className="h-3.5 w-3.5" /> ช่องธนาคาร (Bank)</>, "ใช้เมื่อสลิปเป็นประเภทธนาคาร", bankValue, onChangeBank, "bank")}
          {row(<><Smartphone className="h-3.5 w-3.5" /> ช่องวอเล็ท (Wallet)</>, "ใช้เมื่อสลิปเป็นประเภทวอเล็ท", walletValue, onChangeWallet, "wallet")}
          {row("Default (fallback)", "ใช้เมื่อไม่ระบุประเภท หรือช่องด้านบนว่าง", value, onChange, "default")}
          {row(<><LogIn className="h-3.5 w-3.5" /> ล็อกอิน (Login)</>, "แจ้งเตือนเมื่อมีผู้เข้าสู่ระบบ (โปรไฟล์ / อีเมล / วันที่)", loginValue, onChangeLogin, "login")}
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <input
            type="checkbox"
            checked={splitNotifications}
            onChange={(e) => onChangeSplit(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">แยกแจ้งเตือน Discord ต่อสลิป</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              เมื่อยัดสลิปหลายประเภท (ธนาคาร + วอเล็ท) จะบันทึกและแจ้งเตือนแยกกันตามช่อง Webhook ของแต่ละประเภท
            </span>
          </span>
        </label>
        {status && (
          <p className={`mt-3 flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs ${status.ok ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {status.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {status.text}
          </p>
        )}
        <div className="mt-5">
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthBadge() {
  const { user, profile, isAdmin, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (loading) return null;
  if (!user) {
    return (
      <Link
        to="/auth"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">เข้าสู่ระบบ</span>
      </Link>
    );
  }
  const name = profile?.display_name || user.email || "ผู้ใช้";
  const avatar = profile?.avatar_url || (user.user_metadata?.avatar_url as string | undefined) || null;
  const initial = (name.match(/\S/)?.[0] ?? "?").toUpperCase();
  const roleBadge = (size: "sm" | "md" = "sm") => (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider ${
        size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      } ${
        isAdmin
          ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
          : "border-border bg-muted text-muted-foreground"
      }`}
    >
      {isAdmin ? <Sparkles className="h-2.5 w-2.5" /> : <UserIcon className="h-2.5 w-2.5" />}
      {isAdmin ? "Admin" : "User"}
    </span>
  );
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 text-sm text-foreground transition hover:bg-accent"
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_60%,white)] text-xs font-semibold text-primary-foreground">
            {initial}
          </span>
        )}
        <span className="hidden max-w-[120px] truncate sm:inline">{name}</span>
        {roleBadge("sm")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-popover p-2 shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-2 py-2">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{name}</p>
                  {roleBadge("md")}
                </div>
                {user.email && (
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                )}
              </div>
            </div>

            <button
              onClick={async () => { setOpen(false); await signOut(); }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> ออกจากระบบ
            </button>
          </div>
        </>
      )}
    </div>
  );
}

