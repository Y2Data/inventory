import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { hasValidSession } from "@/lib/auth";

export default async function LoginPage() {
  if (await hasValidSession()) redirect("/");
  return <LoginForm />;
}
