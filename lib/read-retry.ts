/** Only wrap read-only operations. Never retry writes after an uncertain commit. */
export async function retryRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (!["P1001", "P1002", "P1017", "P2024", "ECONNRESET", "ETIMEDOUT"].includes(code)
      && !/timeout exceeded when trying to connect|Connection terminated unexpectedly/i.test(message)) throw error;
    await new Promise(resolve => setTimeout(resolve, 250));
    return read();
  }
}
