import { redirect } from "next/navigation";

import { InventoryApp } from "@/components/inventory-app";
import { hasValidSession } from "@/lib/auth";

export default async function HomePage() {
  if (!(await hasValidSession())) redirect("/login");
  return <InventoryApp />;
}
