import { properties, TENANT_ASSIGNED } from "@/demo/mock-data";


export default function MyProperties() {
  const mine = properties.filter((p) => TENANT_ASSIGNED.includes(p.id));
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">My properties</h1>
      <p className="mt-2 rounded-md bg-brand-soft px-3 py-2 text-sm text-brand">
        You have view-only access. Contact the Legal Department to change anything.
      </p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {mine.map((p) => (
          <li key={p.id} className="rounded-lg border border-line bg-surface p-5">
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-muted">
              {p.province} · {p.area}
            </p>
            <p className="mt-1 text-xs text-muted">{p.titleRef}</p>
            <p className="mt-3 text-sm">
              {p.problems.length === 0 ? "No problems." : p.problems.map((q) => q.text).join("; ")}
            </p>
            <a href={`/properties/${p.id}`} className="mt-3 inline-block text-sm font-medium text-brand">
              View property
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
