import type { Metadata } from "next";
import { CustomersView } from "@/components/panel/customers/CustomersView";

export const metadata: Metadata = { title: "Clientes" };

export default function CustomersPage() {
  return <CustomersView />;
}
