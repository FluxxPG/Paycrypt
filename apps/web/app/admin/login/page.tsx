import Link from "next/link";
import { LoginForm } from "../../../components/login-form";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl items-center px-6 py-12">
      <div className="grid w-full gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex flex-col justify-center">
          <p className="text-sm uppercase tracking-[0.3em] text-violet-300">CryptoPay Cloud</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white">Sign in to the admin command deck.</h1>
          <p className="mt-4 max-w-xl text-slate-300">
            Sign in with an admin account to manage merchants, subscriptions, custody approvals, and platform controls.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 text-sm text-violet-200">
            <Link href="/">Back to home</Link>
            <Link href="/login">Merchant login</Link>
          </div>
        </section>
        <LoginForm variant="admin" onSuccessRedirect="/admin" />
      </div>
    </main>
  );
}
