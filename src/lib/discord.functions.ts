import { createServerFn } from "@tanstack/react-start";

interface DiscordPayload {
  webhookUrl: string;
  category: string;
  amount: number;
  note: string | null;
  slipUrls: string[];
  slipType?: "bank" | "wallet" | null;
}

export const sendDiscordNotification = createServerFn({ method: "POST" })
  .inputValidator((data: DiscordPayload) => {
    if (!data || typeof data.webhookUrl !== "string" || !data.webhookUrl.startsWith("https://")) {
      throw new Error("Invalid webhook payload");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(data.amount);
    const slipTypeLabel =
      data.slipType === "bank" ? "🏦 ธนาคาร" :
      data.slipType === "wallet" ? "📱 วอเล็ท" : "—";
    const embeds = [
      {
        title: "💸 บันทึกค่าใช้จ่ายใหม่",
        color: 0x22d3ee,
        fields: [
          { name: "หมวดหมู่", value: data.category, inline: true },
          { name: "จำนวน", value: thb, inline: true },
          { name: "ประเภทสลิป", value: slipTypeLabel, inline: true },
          { name: "บันทึก", value: data.note?.trim() || "—", inline: false },
        ],
        image: data.slipUrls[0] ? { url: data.slipUrls[0] } : undefined,
        timestamp: new Date().toISOString(),
        footer: { text: "Daily Expense Tracker" },
      },
      ...data.slipUrls.slice(1).map((url) => ({ image: { url }, color: 0x22d3ee })),
    ];

    const res = await fetch(data.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Discord ${res.status}: ${text.slice(0, 200)}`);
    }
    return { ok: true };
  });
