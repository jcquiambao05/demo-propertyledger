import Link from "next/link";

export default function DeniedPage() {
  return (
    <div className="card max-w-lg">
      <h1 className="text-lg font-semibold tracking-[-0.015em] text-ink">
        You do not have access to this record
      </h1>
      <p className="mt-2 text-xs text-muted">
        This attempt was recorded in the audit log.
      </p>
      <Link href="/home" className="btn-secondary mt-5">
        Go back
      </Link>
    </div>
  );
}
