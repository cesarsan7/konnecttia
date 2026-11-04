import type { Metadata } from "next";
import { JoinView } from "@/components/panel/team/JoinView";

export const metadata: Metadata = { title: "Invitación al equipo" };

export default async function JoinPage({
  params,
}: {
  readonly params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinView token={token} />;
}
