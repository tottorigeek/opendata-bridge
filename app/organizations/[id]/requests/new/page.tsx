import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import RequestForm from "@/components/requests/RequestForm";
import { getCurrentUser } from "@/lib/auth";
import { listCatalogDatasets } from "@/lib/datasets";
import { getOrganization } from "@/lib/organizations";
import { REQUEST_POLICY_LABEL, canSendRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;

  const organization = await getOrganization(id);
  if (!organization) notFound();

  const eligibility = canSendRequest(user, organization);
  const datasets = await listCatalogDatasets(user, { organizationId: id });

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <nav className="text-sm text-slate-500">
            <Link href="/organizations" className="hover:text-sky-700">
              組織一覧
            </Link>
            <span className="mx-1.5">/</span>
            <Link href={`/organizations/${organization.id}`} className="hover:text-sky-700">
              {organization.name}
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700">データリクエスト</span>
          </nav>

          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {organization.name} へのデータリクエスト
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            公開されているデータの誤りの指摘や、新しいデータの公開依頼を送れます。
            受け取った組織が内容を確認し、この画面で返信します。
          </p>
          <p className="mt-1 text-xs text-slate-500">
            この組織の受付範囲: {REQUEST_POLICY_LABEL[organization.requestPolicy]}
          </p>

          <div className="mt-8">
            <RequestForm
              organizationId={organization.id}
              organizationName={organization.name}
              datasets={datasets.map((d) => ({ id: d.id, title: d.title }))}
              disabledReason={eligibility.allowed ? null : eligibility.reason}
            />
          </div>
        </div>
      </main>
    </>
  );
}
