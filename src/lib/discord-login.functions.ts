import { createServerFn } from "@tanstack/react-start";

interface LoginPayload {
  webhookUrl: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export const sendLoginNotification = createServerFn({ method: "POST" })
  .inputValidator((data: LoginPayload) => {
    if (!data || typeof data.webhookUrl !== "string" || !data.webhookUrl.startsWith("https://")) {
      throw new Error("Invalid webhook payload");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const now = new Date();
    const dateStr = now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full", timeStyle: "medium" });
    const embed = {
      title: "🔐 มีผู้เข้าสู่ระบบ",
      color: 0x22c55e,
      thumbnail: data.avatarUrl ? { url: data.avatarUrl } : undefined,
      fields: [
        { name: "ชื่อ", value: data.displayName || "—", inline: true },
        { name: "อีเมล", value: data.email || "—", inline: true },
        { name: "วันที่ล้อกอิน", value: dateStr, inline: false },
      ],
      timestamp: now.toISOString(),
      footer: { text: "Daily Expense Tracker" },
    };
    const res = await fetch(data.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Discord ${res.status}: ${text.slice(0, 200)}`);
    }
    return { ok: true };
  });
