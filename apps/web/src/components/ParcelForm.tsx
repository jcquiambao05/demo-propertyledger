"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Parcel } from "@/lib/types";
import { ConfirmModal, Spinner } from "@/components/ConfirmModal";
import { haToSqm, sqmToHa } from "@/lib/area";

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
  /** Stored in Square Meters (m²) in form state; converted to areaHa in toBody() */
  areaSqm: string;
  lat: string;
  lng: string;
}

export interface PendingAttachment {
  id: string;
  file: File;
  docType: string;
  expiresOn: string;
  previewUrl: string | null;
  uploaded?: boolean;
}

export function isImageFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp");
}

export async function uploadAttachments(
  parcelId: string,
  attachments: PendingAttachment[],
  onUploaded?: (attachmentId: string) => void,
): Promise<void> {
  for (const att of attachments) {
    if (att.uploaded) continue;
    const formData = new FormData();
    formData.append("file", att.file);
    formData.append("docType", att.docType);
    if (att.expiresOn) {
      formData.append("expiresOn", att.expiresOn);
    }
    await api(`/parcels/${parcelId}/documents`, {
      method: "POST",
      body: formData,
    });
    att.uploaded = true;
    onUploaded?.(att.id);
  }
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
    areaSqm: p ? String(haToSqm(p.areaHa)) : "",
    lat: p?.location ? String(p.location.lat) : "",
    lng: p?.location ? String(p.location.lng) : "",
  };
}

export function validateParcelForm(
  v: ParcelFormValues,
): Partial<Record<keyof ParcelFormValues | "identity", string>> {
  const errs: Partial<Record<keyof ParcelFormValues | "identity", string>> = {};
  if (!v.name.trim()) errs.name = "Please enter a name for this parcel.";
  if (!v.province.trim()) errs.province = "Please enter the province.";
  if (!v.titleNo.trim() && !v.taxDecNo.trim()) {
    errs.identity = "Add either a Title Number (OCT/TCT) or a Tax Declaration Number.";
  }

  const sqm = Number(v.areaSqm);
  if (!v.areaSqm.trim() || !Number.isFinite(sqm) || sqm < 1 || sqm > 1_000_000_000) {
    errs.areaSqm = "Enter a land area between 1 m² and 1,000,000,000 m².";
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
  underReview = false,
  onSubmit,
}: {
  initial: ParcelFormValues;
  submitLabel: string;
  busy: boolean;
  error: string;
  underReview?: boolean;
  onSubmit: (v: ParcelFormValues, attachments: PendingAttachment[]) => void;
}) {
  const [values, setValues] = useState<ParcelFormValues>(initial);
  const [areaUnit, setAreaUnit] = useState<"sqm" | "ha">("sqm");
  const [areaInputText, setAreaInputText] = useState<string>(initial.areaSqm);
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Optional file & image attachments (legaldept registration + resubmission)
  const [docTypes, setDocTypes] = useState<{ name: string; timeBound: boolean }[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  useEffect(() => {
    api<{ name: string; timeBound: boolean }[]>("/document-types").then(setDocTypes, () => undefined);
  }, []);

  useEffect(() => {
    return () => {
      for (const att of attachments) {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validationErrors = useMemo(() => validateParcelForm(values), [values]);
  const attachmentErrors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const att of attachments) {
      const isTimeBound = docTypes.find((t) => t.name === att.docType)?.timeBound ?? false;
      if (isTimeBound && !att.expiresOn) {
        map[att.id] = `Enter an expiry date for ${att.docType}.`;
      } else if (att.file.size > 20 * 1024 * 1024) {
        map[att.id] = "File exceeds the 20 MB limit.";
      }
    }
    return map;
  }, [attachments, docTypes]);
  const isValid =
    Object.keys(validationErrors).length === 0 && Object.keys(attachmentErrors).length === 0;

  function setField(key: keyof ParcelFormValues, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleToggleAreaUnit() {
    const nextUnit = areaUnit === "sqm" ? "ha" : "sqm";
    const sqm = Number(values.areaSqm);
    if (!values.areaSqm.trim() || !Number.isFinite(sqm)) {
      setAreaInputText("");
    } else {
      setAreaInputText(nextUnit === "sqm" ? String(Math.round(sqm)) : String(sqmToHa(sqm)));
    }
    setAreaUnit(nextUnit);
  }

  function handleAreaInputChange(raw: string) {
    setAreaInputText(raw);
    if (!raw.trim()) {
      setField("areaSqm", "");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setField("areaSqm", raw);
      return;
    }
    if (areaUnit === "sqm") {
      setField("areaSqm", raw);
    } else {
      setField("areaSqm", String(Math.round(n * 10000)));
    }
  }

  function handleSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const next: PendingAttachment[] = files.map((file) => {
      const isImg = isImageFileName(file.name) || file.type.startsWith("image/");
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        docType: isImg ? "Site Photo / Media" : "Supporting Attachment",
        expiresOn: "",
        previewUrl: isImg ? URL.createObjectURL(file) : null,
      };
    });
    setAttachments((prev) => [...prev, ...next]);
    e.target.value = "";
  }

  function updateAttachment(id: string, patch: Partial<PendingAttachment>) {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    setConfirmOpen(true);
  }

  const numericSqm = Number(values.areaSqm);
  const conversionHint =
    values.areaSqm.trim() && Number.isFinite(numericSqm) && numericSqm > 0
      ? areaUnit === "sqm"
        ? `${numericSqm.toLocaleString("en-PH")} m² = ${sqmToHa(numericSqm).toFixed(4)} ha`
        : `${sqmToHa(numericSqm)} ha = ${Math.round(numericSqm).toLocaleString("en-PH")} m²`
      : "Default unit: square meters (10,000 m² = 1 ha)";

  return (
    <>
      <form
        noValidate
        onSubmit={handleFormSubmit}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[1.08fr_1fr] lg:items-stretch"
      >
        {/* LEFT COLUMN: Structured Fill-Up Form with Inline Validations */}
        <div className="flex flex-col justify-between space-y-5 rounded-2xl border border-line bg-surface p-5">
          <div className="space-y-5">
            {/* Section 1: Parcel Identity & Classification */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-brand">
                1. Property Details
              </h2>
              <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="name" className="label">
                    Property Name <span className="text-danger">*</span>
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
                    Title Status
                  </label>
                  <select
                    id="classification"
                    name="classification"
                    value={values.classification}
                    onChange={(e) => setField("classification", e.target.value)}
                    className="field"
                  >
                    <option value="TITLED">Titled (OCT / TCT)</option>
                    <option value="UNTITLED">Untitled (Tax Declaration)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="areaInput" className="label">
                      Land Area ({areaUnit === "sqm" ? "m²" : "ha"}){" "}
                      <span className="text-danger">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleToggleAreaUnit}
                      className="rounded-md border border-line bg-brand-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-soft-fg transition-colors hover:opacity-90"
                    >
                      Switch to {areaUnit === "sqm" ? "ha" : "m²"}
                    </button>
                  </div>
                  <input
                    id="areaInput"
                    name="areaInput"
                    type="number"
                    step={areaUnit === "sqm" ? "1" : "0.0001"}
                    min={areaUnit === "sqm" ? "1" : "0.0001"}
                    value={areaInputText}
                    onChange={(e) => handleAreaInputChange(e.target.value)}
                    placeholder={areaUnit === "sqm" ? "e.g. 7500" : "e.g. 0.75"}
                    required
                    className={`field font-mono tabular-nums ${
                      touched && validationErrors.areaSqm ? "border-danger-dot" : ""
                    }`}
                  />
                  <p className="mt-1 font-mono text-[10px] text-muted">{conversionHint}</p>
                  {touched && validationErrors.areaSqm && (
                    <p className="mt-0.5 text-[11px] text-danger">{validationErrors.areaSqm}</p>
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
            <div className="border-t border-line pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-brand">
                2. Location
              </h2>
              <p className="text-[11px] text-muted">
                Filled in automatically when you place a pin on the map.
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
            <div className="border-t border-line pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-brand">
                3. Map Coordinates
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

            {/* Section 4: Optional File & Image Attachments */}
            <div className="border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-brand">
                    4. Attachments &amp; Media (Optional)
                  </h2>
                  <p className="text-[11px] text-muted">
                    Attach supporting documents (PDF, DOCX) or site photos (PNG, JPG, WebP) for
                    management review.
                  </p>
                </div>

                <label className="btn-secondary cursor-pointer text-xs">
                  + Add files or photos
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleSelectFiles}
                    className="sr-only"
                  />
                </label>
              </div>

              {attachments.length > 0 && (
                <ul className="mt-3 divide-y divide-[#DCE3DC] rounded-xl border border-[#DCE3DC] bg-[#F8FAF8]">
                  {attachments.map((att) => {
                    const isTimeBound =
                      docTypes.find((t) => t.name === att.docType)?.timeBound ?? false;
                    return (
                      <li key={att.id} className="flex flex-wrap items-center gap-3 p-3 text-xs">
                        {att.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={att.previewUrl}
                            alt={att.file.name}
                            className="h-11 w-11 shrink-0 rounded-lg border border-[#DCE3DC] object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#DCE3DC] bg-white font-mono text-[10px] font-bold uppercase text-[#1A472A]">
                            {att.file.name.split(".").pop() || "DOC"}
                          </div>
                        )}

                        <div className="min-w-[140px] flex-1">
                          <p className="truncate font-semibold text-ink">{att.file.name}</p>
                          <p className="font-mono text-[10px] text-muted">
                            {(att.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>

                        <select
                          aria-label={`Category for ${att.file.name}`}
                          value={att.docType}
                          onChange={(e) => updateAttachment(att.id, { docType: e.target.value })}
                          className="rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                        >
                          {docTypes.length > 0 ? (
                            docTypes.map((t) => (
                              <option key={t.name} value={t.name}>
                                {t.name}
                              </option>
                            ))
                          ) : (
                            <>
                              <option value="Site Photo / Media">Site Photo / Media</option>
                              <option value="Supporting Attachment">Supporting Attachment</option>
                            </>
                          )}
                        </select>

                        {isTimeBound && (
                          <input
                            type="date"
                            value={att.expiresOn}
                            onChange={(e) => updateAttachment(att.id, { expiresOn: e.target.value })}
                            required
                            aria-label={`Expiry date for ${att.file.name}`}
                            className="rounded-lg border border-[#C8D3C8] bg-white px-2 py-1.5 font-mono text-xs text-ink focus:border-brand focus:outline-none"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-danger hover:bg-danger-bg"
                        >
                          Remove
                        </button>
                        {touched && attachmentErrors[att.id] && (
                          <p className="w-full text-[11px] text-danger">
                            {attachmentErrors[att.id]}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
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
              {isValid
                ? attachments.length > 0
                  ? `Ready to send with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`
                  : "Ready to send for review"
                : "Fill in the required (*) fields"}
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
            underReview={underReview}
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
        description="Management will check these details and any attached files before the parcel goes live on the map."
        confirmLabel="Send for review"
        cancelLabel="Keep editing"
        variant="brand"
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onSubmit(values, attachments);
        }}
      />
    </>
  );
}

export function toBody(v: ParcelFormValues) {
  const { areaSqm, ...rest } = v;
  return JSON.stringify({
    ...rest,
    areaHa: sqmToHa(Number(areaSqm)),
    lat: Number(v.lat),
    lng: Number(v.lng),
  });
}
