/**
 * Transactional email via Brevo API — OTP delivery for Telegram linking.
 */

export async function sendOTPEmail(recipientEmail: string, otpCode: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Ledger Dashboard";

  if (!apiKey) {
    console.error("Missing BREVO_API_KEY. Unable to send verification email.");
    return false;
  }
  if (!senderEmail) {
    console.error("Missing BREVO_SENDER_EMAIL. Unable to send verification email.");
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail }],
        subject: "Ledger Bot Verification OTP",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #21633e; margin: 0;">Ledger Dashboard</h2>
            <p style="color: #64748b; font-size: 14px;">Telegram Bot Verification</p>
            <hr />
            <p>မင်္ဂလာပါ,</p>
            <p>Telegram Bot ဝင်ရောက်ခွင့် အတည်ပြုရန် OTP ကုဒ် -</p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 10px 30px; border-radius: 6px; border: 1px solid #cbd5e1;">${otpCode}</span>
            </div>
            <p style="color: #ef4444; font-size: 14px;">* ဤကုဒ်သည် ၁၀ မိနစ်သာ အကျုံးဝင်ပါသည်။ မည်သူ့ကိုမျှ မျှဝေခြင်း မပြုပါရန်။</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      console.error("Brevo API error:", response.status, await response.json().catch(() => ({})));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to send OTP email via Brevo:", error);
    return false;
  }
}
