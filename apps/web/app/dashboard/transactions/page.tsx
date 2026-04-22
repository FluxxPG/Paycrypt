import { redirect } from "next/navigation";

export default function TransactionsPage() {
  redirect("/dashboard/payments");
}
