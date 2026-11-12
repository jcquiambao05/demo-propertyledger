import Link from "next/link";

// Demo placeholder for pages that are not in this prototype build.
export default function NotInDemo() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold">Not part of this demo build</h1>
      <p className="mt-2 text-sm text-muted">
        This page is planned but not built in the prototype yet.
      </p>
      <Link href="/home" className="mt-4 inline-block text-sm font-medium text-brand">
        Back to home
      </Link>
    </div>
  );
}
