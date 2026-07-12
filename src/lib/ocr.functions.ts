import { createServerFn } from "@tanstack/react-start";

interface OcrPayload {
  imageBase64: string; // pure base64, no data-url prefix
  mimeType: string;
}

export type OcrStatus = "ok" | "no_amount" | "error";
export type SlipType = "bank" | "wallet";

export interface OcrResult {
  amount: number | null;
  raw: string;
  status: OcrStatus;
  slipType: SlipType | null;
  error?: string;
}

export const extractSlipAmount = createServerFn({ method: "POST" })
  .inputValidator((data: OcrPayload) => {
    if (!data || typeof data.imageBase64 !== "string" || !data.imageBase64) {
      throw new Error("Invalid image payload");
    }
    if (!data.mimeType?.startsWith("image/")) {
      throw new Error("Only image files are supported");
    }
    return data;
  })
  .handler(async ({ data }): Promise<OcrResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              'You inspect a Thai payment slip/receipt image and extract two things: (1) the final TOTAL amount paid (ยอดรวม/จำนวนเงิน/รวมทั้งสิ้น), and (2) the slip source type: "bank" for bank transfer slips (KBank, SCB, BBL, KTB, BAY, TTB, GSB, etc.), or "wallet" for e-wallet slips (TrueMoney Wallet / ทรูมันนี่, Rabbit LINE Pay, ShopeePay, AirPay, Dolfin, etc.). Reply with ONLY compact JSON like {"amount": 123.45, "slipType": "bank"}. Use null when unclear, e.g. {"amount": null, "slipType": null}. No prose, no code fences.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "อ่านยอดเงินรวมจากสลิปนี้" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("ใช้งานเกินโควต้าชั่วคราว ลองใหม่ภายหลัง");
      if (res.status === 402) throw new Error("เครดิต AI หมด กรุณาเติมเครดิต");
      throw new Error(`AI ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let amount: number | null = null;
    let slipType: SlipType | null = null;
    try {
      const parsed = JSON.parse(cleaned) as {
        amount?: number | string | null; slipType?: string | null;
      };
      if (typeof parsed.amount === "number" && isFinite(parsed.amount)) {
        amount = parsed.amount;
      } else if (typeof parsed.amount === "string") {
        const n = parseFloat(parsed.amount.replace(/,/g, ""));
        if (isFinite(n)) amount = n;
      }
      if (parsed.slipType === "bank" || parsed.slipType === "wallet") {
        slipType = parsed.slipType;
      }
    } catch {
      const m = cleaned.match(/[\d,]+\.?\d*/);
      if (m) {
        const n = parseFloat(m[0].replace(/,/g, ""));
        if (isFinite(n)) amount = n;
      }
    }

    if (!slipType) {
      const lower = cleaned.toLowerCase();
      if (/truemoney|true\s*money|ทรูมัน|rabbit\s*line|shopeepay|airpay|dolfin|wallet|วอเล/i.test(cleaned) || lower.includes("wallet")) {
        slipType = "wallet";
      } else if (/kbank|kasikorn|scb|ไทยพาณิชย์|bangkok\s*bank|กรุงเทพ|krungthai|กรุงไทย|bay|krungsri|กรุงศรี|ttb|ทหารไทย|gsb|ออมสิน|ธนาคาร|bank|โอนเงิน|พร้อมเพย์|promptpay/i.test(cleaned)) {
        slipType = "bank";
      }
    }

    return {
      amount,
      raw: cleaned.slice(0, 2000),
      status: amount != null ? "ok" : "no_amount",
      slipType,
    };
  });
