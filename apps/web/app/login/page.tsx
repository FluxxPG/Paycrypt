import Link from "next/link";
import { LoginSwitcher } from "../../components/login-switcher";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <div className="grid w-full gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex flex-col justify-center">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">CryptoPay Cloud</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white">Unified access for merchants and admins.</h1>
          <p className="mt-4 max-w-xl text-slate-300">
            Use the switcher to sign in as a merchant or a super admin. Each path lands on a dedicated console with separate navigation, analytics, and controls.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 text-sm text-cyan-200">
            <Link href="/">Back to home</Link>
            <Link href="/admin/login">Go to admin login page</Link>
          </div>
        </section>
        <LoginSwitcher />
      </div>
    </main>
  );
}
