"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { Parcel } from "@/lib/types";
import { ConfirmModal, Spinner } from "@/components/ConfirmModal";

const ParcelLocationPicker = dynamic(
  () => import("@/components/ParcelLocationPicker").then((m) => m.ParcelLocationPicker),
  { ssr: false },
);

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
    classification: p?.classification ?? "TITLED",
    areaHa: p ? String(p.areaHa) : "",
    lat: p?.location ? String(p.location.lat) : "",
    lng: p?.location ? String(p.location.lng) : "",
  };
}

export function validateParcelForm(v: ParcelFormValues): Partial<Record<keyof ParcelFormValues | "identity", string>> {
  const errs: Partial<Record<keyof ParcelFormValues | "identity", string>> = {};
  if (!v.name.trim()) errs.name = "Please enter a name for this parcel.";
  if (!v.province.trim()) errs.province = "Please enter the province.";
  if (!v.titleNo.trim() && !v.taxDecNo.trim()) {
    errs.identity = "Add either a Title Number (OCT/TCT) or a Tax Declaration Number.";
  }

  const area = Number(v.areaHa);
  if (!v.areaHa.trim() || !Number.isFinite(area) || area <= 0 || area > 100000) {
    errs.areaHa = "Enter an area between 0.01 and 100,000 hectares.";
  }

  const lat = Number(v.lat);
  if (!v.lat.trim() || !Number.isFinite(lat) || lat < 4.2 || lat > 21.8) {
    errs.lat = "Latitude should be inside the Philippines (4.2° to 21.8° N).";
  }

  const lng = Number(v.lng);
  if (!v.lng.trim() || !Number.isFinite(lng) || lng < 114.0 || lng > 128.5) {
    errs.lng = "Longitude should be inside the Philippines (114.0° to 128.5° E).";
  }

  return errs;
}

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
  const [values, setValues] = useState<ParcelFormValues>(initial);
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const validationErrors = useMemo(() => validateParcelForm(values), [values]);
  const isValid = Object.keys(validationErrors).length === 0;

  function setField(key: keyof ParcelFormValues, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    setConfirmOpen(true);
  }

  return (
    <>
      <form
        noValidate
        onSubmit={handleFormSubmit}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[1.08fr_1fr] lg:items-stretch"
      >
        {/* LEFT COLUMN: Structured Fill-Up Form with Inline Validations */}
        <div className="flex flex-col justify-between space-y-5 rounded-2xl border border-[#DCE3DC] bg-white p-5">
          <div className="space-y-5">
            {/* Section 1: Parcel Identity & Classification */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                1. Parcel Identity &amp; Legal Instrument
              </h2>
              <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="name" className="label">
                    Parcel Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="name"
                    name="name"
                    value={values.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="e.g. Bulacan Quarry Buffer Lot 8"
                    required
                    className={`field ${touched && validationErrors.name ? "border-danger-dot" : ""}`}
                  />
                  {touched && validationErrors.name && (
                    <p className="mt-1 text-[11px] text-danger">{validationErrors.name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="classification" className="label">
                    Legal Classification
                  </label>
                  <select
                    id="classification"
                    name="classification"
                    value={values.classification}
                    onChange={(e) => setField("classification", e.target.value)}
                    className="field"
                  >
                    <option value="TITLED">TITLED (OCT / TCT)</option>
                    <option value="UNTITLED">UNTITLED (Tax Declaration)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="areaHa" className="label">
                    Surveyed Area (Hectares) <span className="text-danger">*</span>
                  </label>
                  <input
                    id="areaHa"
                    name="areaHa"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={values.areaHa}
                    onChange={(e) => setField("areaHa", e.target.value)}
                    placeholder="e.g. 4.25"
                    required
                    className={`field font-mono tabular-nums ${
                      touched && validationErrors.areaHa ? "border-danger-dot" : ""
                    }`}
                  />
                  {touched && validationErrors.areaHa && (
                    <p className="mt-1 text-[11px] text-danger">{validationErrors.areaHa}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="titleNo" className="label">
                    Title Number (OCT or TCT)
                  </label>
                  <input
                    id="titleNo"
                    name="titleNo"
                    value={values.titleNo}
                    onChange={(e) => setField("titleNo", e.target.value)}
                    placeholder="e.g. TCT T-041-2026-0118"
                    className="field font-mono"
                  />
                </div>

                <div>
                  <label htmlFor="taxDecNo" className="label">
                    Tax Declaration Number
                  </label>
                  <input
                    id="taxDecNo"
                    name="taxDecNo"
                    value={values.taxDecNo}
                    onChange={(e) => setField("taxDecNo", e.target.value)}
                    placeholder="e.g. TD 03-0412-00921"
                    className="field font-mono"
                  />
                </div>

                {touched && validationErrors.identity && (
                  <p className="rounded-lg border border-[#FECDCA] bg-danger-bg px-3 py-2 text-xs text-danger sm:col-span-2">
                    {validationErrors.identity}
                  </p>
                )}
              </div>
            </div>

            {/* Section 2: Administrative Location */}
            <div className="border-t border-[#DCE3DC] pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                2. Philippine Administrative Jurisdiction
              </h2>
              <p className="text-[11px] text-muted">
                Auto-populated when you click or search on the right-hand Philippines map.
              </p>
              <div className="mt-3 grid gap-3.5 sm:grid-cols-3">
                <div>
                  <label htmlFor="region" className="label">
                    Region
                  </label>
                  <input
                    id="region"
                    name="region"
                    value={values.region}
                    onChange={(e) => setField("region", e.target.value)}
                    placeholder="e.g. Region III"
                    className="field"
                  />
                </div>

                <div>
                  <label htmlFor="province" className="label">
                    Province <span className="text-danger">*</span>
                  </label>
                  <input
                    id="province"
                    name="province"
                    value={values.province}
                    onChange={(e) => setField("province", e.target.value)}
                    placeholder="e.g. Bulacan"
                    required
                    className={`field ${touched && validationErrors.province ? "border-danger-dot" : ""}`}
                  />
                  {touched && validationErrors.province && (
                    <p className="mt-1 text-[11px] text-danger">{validationErrors.province}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="municipality" className="label">
                    City / Municipality
                  </label>
                  <input
                    id="municipality"
                    name="municipality"
                    value={values.municipality}
                    onChange={(e) => setField("municipality", e.target.value)}
                    placeholder="e.g. Norzagaray"
                    className="field"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Geodetic Coordinates */}
            <div className="border-t border-[#DCE3DC] pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                3. Geodetic Coordinates (WGS 84)
              </h2>
              <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor="lat" className="label">
                    Latitude (°N) <span className="text-danger">*</span>
                  </label>
                  <input
                    id="lat"
                    name="lat"
                    value={values.lat}
                    onChange={(e) => setField("lat", e.target.value)}
                    placeholder="14.9100"
                    required
                    className={`field font-mono tabular-nums ${
                      touched && validationErrors.lat ? "border-danger-dot" : ""
                    }`}
                  />
                  {touched && validationErrors.lat && (
                    <p className="mt-1 text-[11px] text-danger">{validationErrors.lat}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="lng" className="label">
                    Longitude (°E) <span className="text-danger">*</span>
                  </label>
                  <input
                    id="lng"
                    name="lng"
                    value={values.lng}
                    onChange={(e) => setField("lng", e.target.value)}
                    placeholder="121.0400"
                    required
                    className={`field font-mono tabular-nums ${
                      touched && validationErrors.lng ? "border-danger-dot" : ""
                    }`}
                  />
                  {touched && validationErrors.lng && (
                    <p className="mt-1 text-[11px] text-danger">{validationErrors.lng}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-[#DCE3DC] pt-4">
            <span className="text-[11px] text-muted">
              {isValid ? "Ready to send for review" : "Fill in the required (*) fields"}
            </span>
            <button type="submit" disabled={busy} className="btn-primary px-6 py-2.5">
              {busy && <Spinner className="h-3.5 w-3.5" />}
              {busy ? "Sending…" : submitLabel}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Full-Height Interactive Philippines Map Pin-Picker */}
        <div className="flex flex-col">
          <ParcelLocationPicker
            lat={values.lat}
            lng={values.lng}
            onPick={(picked) => {
              setValues((prev) => ({
                ...prev,
                lat: picked.lat,
                lng: picked.lng,
                region: picked.region || prev.region,
                province: picked.province || prev.province,
                municipality: picked.municipality || prev.municipality,
              }));
            }}
          />
        </div>
      </form>

      {/* Submission Confirmation Modal */}
      <ConfirmModal
        open={confirmOpen}
        title="Send parcel for review?"
        description="Management will check these details before the parcel goes live on the map."
        confirmLabel="Send for review"
        cancelLabel="Keep editing"
        variant="brand"
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onSubmit(values);
        }}
      />
    </>
  );
}

export function toBody(v: ParcelFormValues) {
  return JSON.stringify({ ...v, areaHa: Number(v.areaHa), lat: Number(v.lat), lng: Number(v.lng) });
}
