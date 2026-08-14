import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { consumeEmailVerification } from "@/lib/verification";

export const dynamic = "force-dynamic";

const FAILURE_MESSAGE: Record<string, string> = {
  invalid: "確認リンクが正しくありません。メールのリンクをもう一度お確かめください。",
  expired: "確認リンクの有効期限(24 時間)が切れています。ダッシュボードから再送してください。",
  used: "この確認リンクは既に使用されています。ダッシュボードから再送してください。",
  email_changed:
    "リンクの発行後にメールアドレスが変更されています。ダッシュボードから再送してください。",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await consumeEmailVerification(token ?? "");

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-xl px-4 py-16">
          {result.ok ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
              <h1 className="text-xl font-bold text-emerald-900">
                {result.alreadyVerified
                  ? "確認は完了しています"
                  : "メールアドレスを確認しました"}
              </h1>
              <p className="mt-2 text-sm text-emerald-800">
                データの修正リクエストなど、本人確認が必要な機能を利用できます。
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-block rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                ダッシュボードへ
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
              <h1 className="text-xl font-bold text-amber-900">確認できませんでした</h1>
              <p className="mt-2 text-sm text-amber-800">
                {FAILURE_MESSAGE[result.reason] ?? FAILURE_MESSAGE.invalid}
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-block rounded-md bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
              >
                ダッシュボードへ
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
