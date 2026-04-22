import Link from "next/link";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";

export default function PreviewCancelPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-12">
      <Card className="w-full p-8">
        <Badge>Preview result</Badge>
        <h1 className="mt-5 text-3xl font-semibold text-white">Payment preview ended.</h1>
        <p className="mt-3 text-sm text-slate-300">
          This is the cancel/failure redirect used by the checkout preview flow.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/preview/demo"
            className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Back to demo preview
          </Link>
          <Link
            href="/"
            className="glass-soft inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-slate-100"
          >
            Back to home
          </Link>
        </div>
      </Card>
    </main>
  );
}

