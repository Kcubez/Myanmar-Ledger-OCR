"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main className="route-feedback">
      <h1>Unable to load this page</h1>
      <p role="alert">စာမျက်နှာကို ရယူမရပါ။ ပြန်လည်ကြိုးစားပေးပါ။</p>
      <p className="muted">If you just saved or deleted something, check the latest records before repeating the action.</p>
      <button disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset(); })}>
        {pending ? "Retrying…" : "Try again"}
      </button>
    </main>
  );
}
