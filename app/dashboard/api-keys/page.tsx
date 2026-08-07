import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { maskApiKey } from "@/lib/api-auth";
import ApiKeysManager, {
  type ApiKeyRow,
  type UsageSummary,
} from "@/components/api-keys/ApiKeysManager";

export default async function ApiKeysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const initialKeys: ApiKeyRow[] = keys.map((k) => ({
    id: k.id,
    label: k.label,
    maskedKey: maskApiKey(k.keyPrefix),
    callCount: k.callCount,
    revoked: k.revokedAt !== null,
    createdAt: k.createdAt.toISOString(),
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
  }));

  const initialUsage: UsageSummary = {
    totalCalls: keys.reduce((sum, k) => sum + k.callCount, 0),
    activeKeys: keys.filter((k) => k.revokedAt === null).length,
    totalKeys: keys.length,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">APIキー</h1>
      <p className="mt-1 text-slate-600">
        公開REST APIを利用するためのキーを発行・管理します。発行時に表示される全文は一度だけ表示されます。
      </p>
      <div className="mt-8">
        <ApiKeysManager initialKeys={initialKeys} initialUsage={initialUsage} />
      </div>
    </div>
  );
}
