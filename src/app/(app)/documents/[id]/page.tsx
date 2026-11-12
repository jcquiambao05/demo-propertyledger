import Link from "next/link";
import { findDoc, hashes } from "@/demo/documents";

export default function DocumentPage({ params }: { params: { id: string } }) {
  const doc = findDoc(params.id);

  if (!doc || doc.status !== "failed") {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">Not part of this demo build</h1>
        <p className="mt-2 text-sm text-muted">The viewer for verified documents is not built yet.</p>
        <Link href="/properties/norzagaray/documents" className="mt-4 inline-block text-sm font-medium text-brand">
          Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted">
        <Link href="/properties/norzagaray/documents" className="text-brand">
          Norzagaray Quarry Parcel A / Documents
        </Link>{" "}
        / {doc.name}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{doc.name}</h1>

      <div role="alert" className="mt-4 rounded-lg border border-danger-dot bg-danger-bg p-5 text-danger-fg">
        <p className="text-lg font-semibold">Integrity check failed</p>
        <p className="mt-1 text-sm">
          This file no longer matches the fingerprint (SHA-256) saved when it was uploaded. It may have been changed or
          damaged. Download and viewing are blocked. This event was recorded in the audit log.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 cursor-not-allowed rounded-md border border-danger-dot px-4 py-2 text-sm font-medium opacity-60"
        >
          Download blocked
        </button>
      </div>

      <section className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">Fingerprint comparison</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-muted">Saved at upload</dt>
            <dd className="break-all font-mono">{hashes.surveyStored}</dd>
          </div>
          <div>
            <dt className="text-muted">Computed just now</dt>
            <dd className="break-all font-mono text-danger-fg">{hashes.surveyComputed}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-muted">The two values differ, so the file is not trusted.</p>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">What to do next</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Find the original paper copy.</li>
          <li>Scan it again and upload it as a new version.</li>
          <li>Tell your IT Administrator if this keeps happening.</li>
        </ol>
        <button type="button" className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">
          Upload replacement
        </button>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">File history</h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          <li className="py-2">
            <span className="text-muted">Today</span> · Integrity check failed on view
          </li>
          <li className="py-2">
            <span className="text-muted">At upload</span> · Version 1 uploaded by Atty. Juan Ramos, hash saved
          </li>
        </ul>
      </section>
    </div>
  );
}
