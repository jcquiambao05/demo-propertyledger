import Link from "next/link";

// Page 07: shown when a Tenant opens a parcel that is not assigned to them.
export default function AccessDenied() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-8 text-center">
      <h1 className="text-xl font-bold">Access denied</h1>
      <p className="mt-2 text-sm">You do not have access to this property.</p>
      <p role="status" className="mt-3 rounded-md bg-pill-bg px-3 py-2 text-sm text-pill-fg">
        This attempt was recorded in the audit log.
      </p>
      <p className="mt-3 text-sm text-muted">
        If you need access, ask the Legal Department to give you view access.
      </p>
      <Link
        href="/my-properties"
        className="mt-5 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
      >
        Back to my properties
      </Link>
    </div>
  );
}
