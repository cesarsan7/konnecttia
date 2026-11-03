import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Tracking } from "@/components/Tracking";
import { publicApiUrl, serverApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false, follow: false } };

type Props = { readonly params: Promise<{ readonly slug: string; readonly token: string }> };

export default async function OrderPage({ params }: Props) {
  const { slug, token } = await params;
  const order = await serverApi().tracking(token);
  if (!order.ok) notFound();
  return <Tracking apiUrl={publicApiUrl()} slug={slug} token={token} initialOrder={order.data} />;
}
