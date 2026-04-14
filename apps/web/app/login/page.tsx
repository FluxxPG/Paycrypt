import Link from "next/link";
import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl items-center px-6 py-12">
      <div className="grid w-full gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-center">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">CryptoPay Cloud</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white">Sign in to the merchant console.</h1>
          <p className="mt-4 max-w-xl text-slate-300">
            Use the seeded demo account to test payments, API keys, hosted checkout, and admin controls.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 text-sm text-cyan-200">
            <Link href="/">Back to home</Link>
            <Link href="/admin/login">Go to admin login</Link>
          </div>
        </section>
        <LoginForm variant="merchant" />
      </div>
    </main>
  );
}
