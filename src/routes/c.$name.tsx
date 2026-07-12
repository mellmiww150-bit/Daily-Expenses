import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Image as ImageIcon, Wallet, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { THB, tokenFor, iconFor, slipsOf, type ExpenseRow } from "./index";

export const Route = createFileRoute("/c/$name")({
  component: CategoryPage,
  head: ({ params }) => ({
    meta: [{ title: `${decodeURIComponent(params.name)} · Daily Expenses` }],
  }),
});

function CategoryPage() {
  const { name } = useParams({ from: "/c/$name" });
  const category = decodeURIComponent(name);
  const token = tokenFor(category);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", "cat", category],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from("expenses").select("*").eq("category", category).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });

  const stats = useMemo(() => {
    const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const now = new Date();
    const monthTotal = expenses
      .filter((e) => { const d = new Date(e.created_at); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
      .reduce((s, e) => s + Number(e.amount), 0);
    return { total, count: expenses.length, monthTotal };
  }, [expenses]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-[color-mix(in_oklab,var(--primary)_6%,var(--background))]">
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> กลับหน้าแรก
        </Link>

        <div
          className="mb-6 rounded-2xl border p-6 shadow-xl shadow-black/10"
          style={{
            borderColor: `color-mix(in oklab, var(--${token}) 40%, var(--color-border))`,
            background: `linear-gradient(135deg, color-mix(in oklab, var(--${token}) 15%, var(--color-card)), var(--color-card))`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `color-mix(in oklab, var(--${token}) 25%, transparent)` }}>
                {(() => { const Icon = iconFor(category); return <Icon className="h-7 w-7" style={{ color: `var(--${token})` }} />; })()}
              </div>
              <div>
                <h1 className="text-2xl font-semibold md:text-3xl">{category}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{stats.count} รายการทั้งหมด</p>
              </div>
            </div>
            <Wallet className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <Stat label="เดือนนี้" value={THB(stats.monthTotal)} />
            <Stat label="รวมทั้งหมด" value={THB(stats.total)} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-xl shadow-black/10 md:p-6">
          <h2 className="mb-4 text-base font-semibold">รายการทั้งหมด</h2>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : expenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการในหมวดนี้</p>
          ) : (
            <div className="space-y-3">
              {expenses.map((e) => <ExpenseCard key={e.id} expense={e} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums md:text-2xl">{value}</div>
    </div>
  );
}

function ExpenseCard({ expense }: { expense: ExpenseRow }) {
  const [urls, setUrls] = useState<string[]>([]);
  const slips = slipsOf(expense);
  const d = new Date(expense.created_at);

  useEffect(() => {
    if (slips.length === 0) return;
    let cancelled = false;
    (async () => {
      const list = await Promise.all(slips.map(async (p) => {
        const { data } = await supabase.storage.from("slips").createSignedUrl(p, 60 * 60);
        return data?.signedUrl ?? "";
      }));
      if (!cancelled) setUrls(list.filter(Boolean));
    })();
    return () => { cancelled = true; };
  }, [expense.id]);

  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });

  function askDelete() {
    const label = `${THB(Number(expense.amount))}${expense.note ? ` · ${expense.note}` : ""}`;
    if (window.confirm(`คุณจะลบรายการนี้ใช่ไหม?\n\n${label}\n\nการลบไม่สามารถย้อนกลับได้`)) {
      del.mutate();
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} · {d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
          </div>
          {expense.note && <p className="mt-1 text-sm">{expense.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right text-lg font-semibold tabular-nums">{THB(Number(expense.amount))}</div>
          <button
            onClick={askDelete}
            disabled={del.isPending}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            aria-label="Delete"
          >
            {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {slips.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {urls.length === 0 ? (
            slips.map((_, i) => (
              <div key={i} className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ))
          ) : (
            urls.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer" className="block h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                <img src={u} alt={`slip-${i}`} className="h-full w-full object-cover transition hover:scale-105" />
              </a>
            ))
          )}
        </div>
      )}
      {slips.length === 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" /> ไม่มีสลิปแนบ
        </div>
      )}
    </div>
  );
}
