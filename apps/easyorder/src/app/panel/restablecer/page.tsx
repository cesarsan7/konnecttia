import type { Metadata } from "next";
import { ResetPassword } from "@/components/panel/ResetPassword";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function ResetPasswordPage() {
  return <ResetPassword />;
}
