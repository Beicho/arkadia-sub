import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import Fingerprint from "@/components/Fingerprint";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  return (
    <div className="flex min-h-dvh">
      <Fingerprint />
      <AdminShell username={admin.username}>{children}</AdminShell>
    </div>
  );
}
