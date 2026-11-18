// Figure 14 (V07 Access denied).
import Link from "next/link";

export default function DeniedPage() {
  return (
    <div className="card max-w-lg">
      <h1 className="text-xl font-semibold">You do not have access to this record</h1>
      <p className="mt-2 text-sm text-muted">This attempt was recorded in the audit log.</p>
      <Link href="/home" className="btn-secondary mt-6 inline-block">
        Go back
      </Link>
    </div>
  );
}
