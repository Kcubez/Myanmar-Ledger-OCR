/**
 * Thin Telegram Bot API HTTP client. No database access —
 * every function takes an explicit botToken.
 */

export async function sendTelegramMessage({
  botToken,
  chatId,
  text,
  replyMarkup,
}: {
  botToken: string | null | undefined;
  chatId: bigint | number | string;
  text: string;
  replyMarkup?: Record<string, unknown>;
}): Promise<{ message_id: number } | null> {
  if (!botToken) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.result : null;
  } catch (err) {
    console.error("Error sending Telegram message:", err);
    return null;
  }
}

export async function answerCallbackQuery(
  botToken: string | null | undefined,
  callbackQueryId: string,
  text: string,
) {
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch((err) => console.error("Error answering callback:", err));
}

export async function editTelegramMessage({
  botToken,
  chatId,
  messageId,
  text,
  replyMarkup,
}: {
  botToken: string | null | undefined;
  chatId: bigint | number | string;
  messageId: number;
  text: string;
  replyMarkup?: Record<string, unknown>;
}): Promise<boolean> {
  if (!botToken) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        message_id: messageId,
        text,
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    if (!res.ok) {
      console.error("Error editing Telegram message:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error editing Telegram message:", err);
    return false;
  }
}

export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
): Promise<{ buffer: Buffer; filePath: string } | null> {
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) return null;

    return { buffer: Buffer.from(await downloadRes.arrayBuffer()), filePath: fileData.result.file_path as string };
  } catch (err) {
    console.error("Error downloading Telegram file:", err);
    return null;
  }
}

/** Pick the largest photo (or document) from an incoming message. */
export function getFileInfoFromMessage(message: Record<string, unknown>): {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
} | null {
  const doc = message.document as Record<string, unknown> | undefined;
  if (doc) {
    return {
      fileId: doc.file_id as string,
      fileName: (doc.file_name as string) || "document",
      mimeType: (doc.mime_type as string) || "application/octet-stream",
      fileSize: (doc.file_size as number) || 0,
    };
  }
  const photos = message.photo as Array<Record<string, unknown>> | undefined;
  if (photos && photos.length > 0) {
    const largest = photos[photos.length - 1];
    return {
      fileId: largest.file_id as string,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: (largest.file_size as number) || 0,
    };
  }
  return null;
}
