"use client";
// FR-07 fields: title or tax declaration details, classification, area, location, coordinates.
import type { Parcel } from "@/lib/types";

export interface ParcelFormValues {
  name: string;
  region: string;
  province: string;
  municipality: string;
  titleNo: string;
  taxDecNo: string;
  classification: string;
  areaHa: string;
  lat: string;
  lng: string;
}

export function valuesFrom(p?: Parcel): ParcelFormValues {
  return {
    name: p?.name ?? "",
    region: p?.region ?? "",
    province: p?.province ?? "",
    municipality: p?.municipality ?? "",
    titleNo: p?.titleNo ?? "",
    taxDecNo: p?.taxDecNo ?? "",
    classification: p?.classification ?? "",
    areaHa: p ? String(p.areaHa) : "",
    lat: p?.location ? String(p.location.lat) : "",
    lng: p?.location ? String(p.location.lng) : "",
  };
}

const FIELDS: { key: keyof ParcelFormValues; label: string; hint?: string; required?: boolean }[] =
  [
    { key: "name", label: "Parcel name", required: true },
    { key: "region", label: "Region", hint: "e.g. Region III (Central Luzon)" },
    { key: "province", label: "Province", required: true },
    { key: "municipality", label: "Municipality or city" },
    {
      key: "titleNo",
      label: "Title number (OCT or TCT)",
      hint: "Enter a title number or a tax declaration number.",
    },
    { key: "taxDecNo", label: "Tax declaration number" },
    { key: "classification", label: "Classification" },
    { key: "areaHa", label: "Area (hectares)", required: true },
    { key: "lat", label: "Latitude", required: true },
    { key: "lng", label: "Longitude", required: true },
  ];

export function ParcelForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
}: {
  initial: ParcelFormValues;
  submitLabel: string;
  busy: boolean;
  error: string;
  onSubmit: (v: ParcelFormValues) => void;
}) {
  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit(
          Object.fromEntries(
            FIELDS.map((x) => [x.key, String(f.get(x.key) ?? "")]),
          ) as unknown as ParcelFormValues,
        );
      }}
    >
      {FIELDS.map((x) => (
        <div key={x.key}>
          <label htmlFor={x.key} className="label">
            {x.label}
          </label>
          <input
            id={x.key}
            name={x.key}
            defaultValue={initial[x.key]}
            required={x.required}
            className="field"
          />
          {x.hint && <p className="mt-1 text-xs text-muted">{x.hint}</p>}
        </div>
      ))}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger md:col-span-2"
        >
          {error}
        </p>
      )}
      <div className="md:col-span-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function toBody(v: ParcelFormValues) {
  return JSON.stringify({ ...v, areaHa: Number(v.areaHa), lat: Number(v.lat), lng: Number(v.lng) });
}
