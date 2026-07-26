import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import SignupForm from "./SignupForm";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">組織を新規登録</h1>
            <p className="mt-1 text-sm text-slate-600">
              組織を作成し、あなたが管理者(ADMIN)として登録されます。
            </p>
            <div className="mt-6">
              <SignupForm />
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-slate-600">
            既にアカウントをお持ちですか?{" "}
            <Link href="/login" className="font-medium text-sky-600 hover:underline">
              ログイン
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
