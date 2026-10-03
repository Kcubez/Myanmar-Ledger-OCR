/** Better Auth hides database causes behind this specific session lookup error.
 * Retry once; never turn an unavailable session into an authenticated session.
 */
export async function retrySessionLookup<T>(lookup: () => Promise<T>): Promise<T> {
  try { return await lookup(); }
  catch (error) {
    const failure = error as { statusCode?: number; body?: { code?: string } } | null;
    if (failure?.statusCode !== 500 || failure.body?.code !== "FAILED_TO_GET_SESSION") throw error;
    await new Promise(resolve => setTimeout(resolve, 300));
    return lookup();
  }
}
