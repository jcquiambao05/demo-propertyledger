"use client";

export function PaginationBar({
  page,
  totalItems,
  pageSize,
  onPageChange,
  compact = false,
}: {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  compact?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  if (compact) {
    return (
      <div className="flex items-center justify-between border-t border-[#DCE3DC] pt-2.5 text-xs">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="rounded-lg border border-[#DCE3DC] bg-white px-2.5 py-1 text-[11px] font-medium text-[#2A3B31] transition-colors hover:bg-[#F4F6F3] disabled:opacity-40 disabled:pointer-events-none"
        >
          ← Prev
        </button>
        <span className="font-mono text-[11px] tabular-nums text-muted">
          Page <strong className="font-semibold text-ink">{safePage}</strong> of {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="rounded-lg border border-[#DCE3DC] bg-white px-2.5 py-1 text-[11px] font-medium text-[#2A3B31] transition-colors hover:bg-[#F4F6F3] disabled:opacity-40 disabled:pointer-events-none"
        >
          Next →
        </button>
      </div>
    );
  }

  const pages: (number | "ellipsis")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (safePage > 3) pages.push("ellipsis");
    const winStart = Math.max(2, safePage - 1);
    const winEnd = Math.min(totalPages - 1, safePage + 1);
    for (let i = winStart; i <= winEnd; i++) pages.push(i);
    if (safePage < totalPages - 2) pages.push("ellipsis");
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#F8FAF8] px-5 py-3 text-xs">
      <span className="text-muted">
        Showing <span className="font-mono font-medium tabular-nums text-ink">{start}–{end}</span> of{" "}
        <span className="font-mono font-medium tabular-nums text-ink">{totalItems}</span>
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="rounded-lg border border-[#DCE3DC] bg-white px-2.5 py-1 text-xs font-medium text-[#2A3B31] transition-colors hover:bg-[#F4F6F3] disabled:opacity-40 disabled:pointer-events-none"
        >
          ← Previous
        </button>

        {pages.map((p, idx) =>
          p === "ellipsis" ? (
            <span key={`e-${idx}`} className="px-1.5 font-mono text-xs text-muted select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === safePage ? "page" : undefined}
              className={`h-7 min-w-[28px] rounded-lg px-2 font-mono text-xs font-medium tabular-nums transition-colors ${
                p === safePage
                  ? "bg-[#1A472A] text-white shadow-sm"
                  : "border border-transparent text-muted hover:border-[#DCE3DC] hover:bg-white hover:text-ink"
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="rounded-lg border border-[#DCE3DC] bg-white px-2.5 py-1 text-xs font-medium text-[#2A3B31] transition-colors hover:bg-[#F4F6F3] disabled:opacity-40 disabled:pointer-events-none"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
