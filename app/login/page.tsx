import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">ログイン</h1>
            <p className="mt-1 text-sm text-slate-600">
              登録済みのアカウントでログインします。
            </p>
            <div className="mt-6">
              <LoginForm />
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-slate-600">
            アカウントをお持ちでないですか?{" "}
            <Link href="/signup" className="font-medium text-sky-600 hover:underline">
              組織を登録
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
