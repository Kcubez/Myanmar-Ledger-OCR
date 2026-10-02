import { redirect } from "next/navigation";
import { ownerPageOrRedirect } from "../../../lib/owner-page";

export default async function RetiredLedgerPage() {
  await ownerPageOrRedirect();
  redirect("/inventory");
}
