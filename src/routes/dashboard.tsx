import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowLeft, TrendingUp, Wallet, Landmark, Smartphone, Loader2, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { THB, tokenFor, iconFor, type ExpenseRow } from "./index";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "แดชบอร์ด · Daily Expenses" },
      { name: "description", content: "สรุปยอดค่าใช้จ่ายรายวัน รายเดือน แยกตามหมวดและประเภทสลิป" },
    ],
  }),
});

function DashboardPage() {
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from("expenses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });

  const stats = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const today = now.toDateString();

    let total = 0, monthTotal = 0, todayTotal = 0;
    let bankTotal = 0, walletTotal = 0;
    let bankCount = 0, walletCount = 0;
    const byCat = new Map<string, { total: number; count: number }>();
    const byDay = new Map<string, number>();

    for (const e of expenses) {
      const amt = Number(e.amount);
      const d = new Date(e.created_at);
      total += amt;
      if (d.getFullYear() === y && d.getMonth() === m) monthTotal += amt;
      if (d.toDateString() === today) todayTotal += amt;
      if (e.slip_type === "bank") { bankTotal += amt; bankCount++; }
      else if (e.slip_type === "wallet") { walletTotal += amt; walletCount++; }

      const c = byCat.get(e.category) ?? { total: 0, count: 0 };
      c.total += amt; c.count++;
      byCat.set(e.category, c);

      const key = d.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + amt);
    }

    const cats = [...byCat.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);

    // Last 7 days chart data
    const days: { label: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        label: d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric" }),
        amount: byDay.get(key) ?? 0,
      });
    }
    const maxDay = Math.max(1, ...days.map((d) => d.amount));

    return { total, monthTotal, todayTotal, bankTotal, walletTotal, bankCount, walletCount, count: expenses.length, cats, days, maxDay };
  }, [expenses]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-[color-mix(in_oklab,var(--primary)_4%,var(--background))]">
      <div className="mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-6 md:py-10">
        <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:mb-6">
          <Link to="/" className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 shrink-0" /> <span className="truncate">กลับหน้าแรก</span>
          </Link>
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">แดชบอร์ด</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
              <SummaryCard icon={TrendingUp} label="วันนี้" value={THB(stats.todayTotal)} tint="var(--primary)" />
              <SummaryCard icon={Wallet} label="เดือนนี้" value={THB(stats.monthTotal)} tint="var(--cat-web)" />
              <SummaryCard icon={Receipt} label="รวมทั้งหมด" value={THB(stats.total)} sub={`${stats.count} รายการ`} tint="var(--cat-stock)" />
              <SummaryCard icon={Landmark} label="เฉลี่ย/รายการ" value={THB(stats.count ? stats.total / stats.count : 0)} tint="var(--cat-food)" />
            </div>

            {/* Slip type breakdown */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SlipTypeCard icon={Landmark} label="สลิปธนาคาร" total={stats.bankTotal} count={stats.bankCount} tint="var(--cat-web)" />
              <SlipTypeCard icon={Smartphone} label="สลิปวอเล็ท" total={stats.walletTotal} count={stats.walletCount} tint="var(--cat-stock)" />
            </div>

            {/* 7-day trend */}
            <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-sm sm:p-5 md:p-6">
              <h2 className="mb-4 text-sm font-semibold sm:text-base">แนวโน้ม 7 วันล่าสุด</h2>
              <div className="flex h-32 items-end justify-between gap-1.5 sm:h-40 sm:gap-2">
                {stats.days.map((d, i) => (
                  <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:gap-2">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t-md transition-all"
                        style={{
                          height: `${(d.amount / stats.maxDay) * 100}%`,
                          minHeight: d.amount > 0 ? "4px" : "2px",
                          background: d.amount > 0
                            ? "linear-gradient(to top, color-mix(in oklab, var(--primary) 40%, transparent), var(--primary))"
                            : "color-mix(in oklab, var(--muted) 70%, transparent)",
                        }}
                        title={THB(d.amount)}
                      />
                    </div>
                    <div className="w-full truncate text-center text-[9px] leading-tight text-muted-foreground sm:text-[10px]">{d.label}</div>
                  </div>
                ))}
              </div>
            </div>



            {/* By category */}
            <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-lg shadow-black/20 backdrop-blur-sm sm:p-5 md:p-6">
              <h2 className="mb-4 text-sm font-semibold sm:text-base">แยกตามหมวดหมู่</h2>
              {stats.cats.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
              ) : (
                <div className="space-y-2.5 sm:space-y-3">
                  {stats.cats.map((c) => {
                    const Icon = iconFor(c.category);
                    const token = tokenFor(c.category);
                    const pct = stats.total > 0 ? (c.total / stats.total) * 100 : 0;
                    return (
                      <Link
                        key={c.category}
                        to="/c/$name"
                        params={{ name: c.category }}
                        className="block rounded-xl border border-border/60 bg-background/30 p-3 transition hover:border-primary/40 hover:bg-background/50 sm:p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                            style={{ background: `color-mix(in oklab, var(--${token}) 20%, transparent)` }}>
                            <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: `var(--${token})` }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 truncate text-sm font-medium">{c.category}</div>
                              <div className="shrink-0 text-sm font-semibold tabular-nums">{THB(c.total)}</div>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, background: `var(--${token})` }} />
                              </div>
                              <div className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:text-xs">
                                {c.count} · {pct.toFixed(0)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, tint }: {
  icon: IconType; label: string; value: string; sub?: string; tint: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-lg shadow-black/20 backdrop-blur-sm sm:p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:gap-2 sm:text-xs">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tint }} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 truncate text-lg font-semibold tabular-nums sm:mt-2 sm:text-xl md:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">{sub}</div>}
    </div>
  );
}

function SlipTypeCard({ icon: Icon, label, total, count, tint }: {
  icon: IconType; label: string; total: number; count: number; tint: string;
}) {
  return (
    <div className="rounded-2xl border p-4 shadow-lg shadow-black/20 backdrop-blur-sm sm:p-5"
      style={{
        borderColor: `color-mix(in oklab, ${tint} 30%, var(--color-border))`,
        background: `linear-gradient(135deg, color-mix(in oklab, ${tint} 10%, color-mix(in oklab, var(--color-card) 85%, transparent)), color-mix(in oklab, var(--color-card) 70%, transparent))`,
      }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12"
            style={{ background: `color-mix(in oklab, ${tint} 20%, transparent)` }}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: tint }} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs text-muted-foreground sm:text-sm">{label}</div>
            <div className="truncate text-lg font-semibold tabular-nums sm:text-xl md:text-2xl">{THB(total)}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-muted-foreground sm:text-xs">รายการ</div>
          <div className="text-base font-semibold tabular-nums sm:text-lg">{count}</div>
        </div>
      </div>
    </div>
  );
}


type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;
