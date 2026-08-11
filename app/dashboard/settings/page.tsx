import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ORG_TYPE_LABEL, formatRegion } from "@/lib/datasets";
import OrgRegionForm from "@/components/settings/OrgRegionForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = user.organization;
  const region = formatRegion(org);
  const isAdmin = user.role === "ADMIN";

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">組織設定</h1>
      <p className="mt-1 text-slate-600">組織情報やメンバーを管理します。</p>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">組織情報</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">組織名</dt>
            <dd className="mt-0.5 text-slate-900">{org.name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">種別</dt>
            <dd className="mt-0.5 text-slate-900">
              {ORG_TYPE_LABEL[org.type] ?? org.type}
              {!org.verified && (
                <span className="ml-1 text-xs text-slate-500">(未確認)</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">所在地</h2>
        <p className="mt-1 text-sm text-slate-600">
          公開カタログの地域絞り込みで使われます。データセット側に「対象地域」が
          設定されている場合はそちらが優先され、未設定のデータセットにこの所在地が
          適用されます。
        </p>

        {isAdmin ? (
          <div className="mt-5">
            <OrgRegionForm
              prefecture={org.prefecture}
              municipality={org.municipality}
            />
          </div>
        ) : (
          <div className="mt-4 text-sm">
            <p className="text-slate-900">{region ?? "未設定"}</p>
            <p className="mt-1 text-xs text-slate-500">
              変更できるのは組織の ADMIN のみです。
            </p>
          </div>
        )}
      </section>

      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        メンバー管理など、その他の組織設定は後続フェーズで実装予定です。
      </div>
    </div>
  );
}
