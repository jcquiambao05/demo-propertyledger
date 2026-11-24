"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { useTheme } from "@/components/ThemeContext";
import {
  THEMES,
  FONT_SIZES,
  PRESET_SECURITY_QUESTIONS,
  type ThemeId,
  type FontSizeId,
} from "@/lib/theme";
import { Toast } from "@/components/Toast";
import { Spinner } from "@/components/ConfirmModal";
import type { Role } from "@/lib/auth";

type SectionId = "profile" | "personalization" | "security";

const ROLE_LABELS: Record<Role, string> = {
  LEGAL: "Legal Department",
  MANAGEMENT: "Management",
  TENANT: "Tenant",
  IT_ADMIN: "IT Administrator",
};

const DEFAULT_POSITION_LABELS: Record<Role, string> = {
  LEGAL: "Legal Counsel",
  MANAGEMENT: "Executive Management",
  TENANT: "Authorized Lessee Representative",
  IT_ADMIN: "Systems & Security Administrator",
};

function initialsFrom(name: string): string {
  const parts = name
    .replace(/^Atty\.\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function AccordionChevron({ open }: { open: boolean }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-muted text-ink"
      aria-hidden="true"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "rotate-180" : "rotate-0"
        }`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const {
    theme,
    fontSize,
    profile,
    resolvedAvatarSrc,
    hasCustomAvatar,
    setTheme,
    setFontSize,
    refreshProfile,
    uploadAvatarFile,
    removeAvatarFile,
  } = useTheme();

  // Independent Multi-Open Collapsible Sections
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    profile: true,
    personalization: true,
    security: false,
  });
  const [toastMsg, setToastMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Avatar Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [imgFailed, setImgFailed] = useState(false);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Security Question State
  const [selectedQuestionChoice, setSelectedQuestionChoice] = useState<string>(
    PRESET_SECURITY_QUESTIONS[0],
  );
  const [customQuestion, setCustomQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [securityPassword, setSecurityPassword] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityError, setSecurityError] = useState("");

  // One-Time Backup Codes State (6 single-use codes)
  const [backupPassword, setBackupPassword] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState("");

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedAvatarSrc]);

  useEffect(() => {
    if (profile?.securityQuestion) {
      const matchesPreset = (PRESET_SECURITY_QUESTIONS as readonly string[]).includes(
        profile.securityQuestion,
      );
      if (matchesPreset) {
        setSelectedQuestionChoice(profile.securityQuestion);
      } else {
        setSelectedQuestionChoice("__custom__");
        setCustomQuestion(profile.securityQuestion);
      }
    }
  }, [profile?.securityQuestion]);

  // Esc key collapses open accordion sections if not typing in an input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"]')) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      setOpenSections({ profile: false, personalization: false, security: false });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const displayName = profile?.name || session?.user?.name || "Authorized User";
  const displayRole = profile?.role || session?.user?.role || "LEGAL";
  const displayPosition = profile?.position || DEFAULT_POSITION_LABELS[displayRole];
  const displayEmail = profile?.email || "";
  const showAvatar = Boolean(resolvedAvatarSrc && !imgFailed);

  // Password validation rules checklist
  const pwRules = useMemo(() => {
    return [
      { id: "len", label: "At least 8 characters", met: newPassword.length >= 8 },
      { id: "upper", label: "At least 1 uppercase letter (A–Z)", met: /[A-Z]/.test(newPassword) },
      { id: "lower", label: "At least 1 lowercase letter (a–z)", met: /[a-z]/.test(newPassword) },
      { id: "num", label: "At least 1 number (0–9)", met: /[0-9]/.test(newPassword) },
      {
        id: "spec",
        label: "At least 1 special character (!@#$…)",
        met: /[^A-Za-z0-9]/.test(newPassword),
      },
    ];
  }, [newPassword]);

  const allPwRulesMet = pwRules.every((r) => r.met);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError("");
    setErrorMsg("");
    setAvatarBusy(true);

    try {
      await uploadAvatarFile(file);
      setToastMsg("Profile picture updated.");
    } catch (err) {
      setAvatarError((err as Error).message);
    } finally {
      setAvatarBusy(false);
      e.target.value = "";
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError("");
    setAvatarBusy(true);
    try {
      await removeAvatarFile();
      setToastMsg("Profile picture removed.");
    } catch (err) {
      setAvatarError((err as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (!allPwRulesMet) {
      setPasswordError("New password must satisfy all complexity requirements.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordBusy(true);
    try {
      await api("/profile/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setToastMsg("Your password has been updated.");
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleSecurityQuestionSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSecurityError("");
    const finalQuestion =
      selectedQuestionChoice === "__custom__" ? customQuestion.trim() : selectedQuestionChoice;

    if (finalQuestion.length < 5) {
      setSecurityError("Enter a security question of at least 5 characters.");
      return;
    }
    if (securityAnswer.trim().length < 2) {
      setSecurityError("Enter an answer of at least 2 characters.");
      return;
    }
    if (!securityPassword) {
      setSecurityError("Re-enter your current password to save your security question.");
      return;
    }

    setSecurityBusy(true);
    try {
      await api("/profile/security-question", {
        method: "PUT",
        body: JSON.stringify({
          question: finalQuestion,
          answer: securityAnswer.trim(),
          currentPassword: securityPassword,
        }),
      });
      setSecurityAnswer("");
      setSecurityPassword("");
      await refreshProfile();
      setToastMsg("Security question and recovery answer saved.");
    } catch (err) {
      setSecurityError((err as Error).message);
    } finally {
      setSecurityBusy(false);
    }
  }

  async function handleGenerateBackupCodes(e: React.FormEvent) {
    e.preventDefault();
    setBackupError("");
    if (!backupPassword) {
      setBackupError("Enter your current password to generate backup codes.");
      return;
    }
    setBackupBusy(true);
    try {
      const res = await api<{ codes: string[]; backupCodesRemaining: number }>(
        "/profile/backup-codes",
        {
          method: "POST",
          body: JSON.stringify({ currentPassword: backupPassword }),
        },
      );
      setGeneratedCodes(res.codes);
      setBackupPassword("");
      await refreshProfile();
      setToastMsg("Generated 6 new one-time backup recovery codes.");
    } catch (err) {
      setBackupError((err as Error).message);
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleCopyBackupCodes() {
    if (!generatedCodes) return;
    try {
      await navigator.clipboard.writeText(generatedCodes.join("\n"));
      setToastMsg("Copied all 6 backup codes to clipboard.");
    } catch {
      setToastMsg("Could not copy automatically — please select and copy the codes.");
    }
  }

  function toggleSection(id: SectionId) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const activeThemeMeta = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const activeFontMeta = FONT_SIZES.find((f) => f.id === fontSize) ?? FONT_SIZES[1];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Toast message={toastMsg} onClose={() => setToastMsg("")} />

      {/* Top Header Bar (Clean — No BackButton or redundant theme button) */}
      <div className="border-b border-line pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
          Workspace Preferences
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink">
          Settings &amp; Personalization
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Manage your profile picture, workspace theme, typography scale, and local account
          security.
        </p>
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger"
        >
          {errorMsg}
        </p>
      )}

      {/* Profile Summary Hero Banner */}
      <div className="bento-shell">
        <div className="bento-core flex flex-wrap items-center justify-between gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-brand-border bg-brand-soft text-brand-soft-fg shadow-sm">
              {showAvatar && resolvedAvatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolvedAvatarSrc}
                  alt={displayName}
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-mono text-2xl font-bold">
                  {initialsFrom(displayName)}
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-semibold text-ink">{displayName}</h2>
                <span className="pill-ok">{ROLE_LABELS[displayRole]}</span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-muted">{displayPosition}</p>
              {displayEmail && (
                <p className="mt-1 font-mono text-xs text-muted">{displayEmail}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary"
            >
              {avatarBusy && <Spinner />}
              <span>{hasCustomAvatar ? "Change photo" : "Upload photo"}</span>
            </button>
            {hasCustomAvatar && (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={handleRemoveAvatar}
                className="btn-secondary text-danger hover:!text-danger"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {avatarError && (
        <p
          role="alert"
          className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger"
        >
          {avatarError}
        </p>
      )}

      {/* =====================================================================
          ACCORDION 1: USER PROFILE & READ-ONLY IDENTITY
          ===================================================================== */}
      <div className="bento-shell">
        <div className="bento-core overflow-hidden p-0">
          <button
            type="button"
            onClick={() => toggleSection("profile")}
            aria-expanded={openSections.profile}
            className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-muted"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  1. User Profile &amp; Corporate Identity
                </span>
                <span className="pill text-[10px]">Read-Only Identity</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Update your profile avatar and review your assigned corporate position and role.
              </p>
            </div>

            <AccordionChevron open={openSections.profile} />
          </button>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              openSections.profile
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden">
              <div className="space-y-6 border-t border-line px-6 py-5">
                {/* Avatar Upload Sub-panel */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface-muted p-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-ink">Profile Picture</p>
                    <p className="text-xs text-muted">
                      Displayed in the Settings header and top of the side navigation bar. Supports
                      PNG, JPG, or WebP up to 5 MB.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary"
                    >
                      {avatarBusy ? "Uploading…" : "Choose image file…"}
                    </button>
                  </div>
                </div>

                {/* Read-Only Locked Identity Fields */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Verified Corporate Identity (Locked)
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Managed by IT Administrator
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="ro-name" className="label flex items-center justify-between">
                        <span>Full Name</span>
                        <span className="font-mono text-[10px] text-muted">LOCKED</span>
                      </label>
                      <input
                        id="ro-name"
                        type="text"
                        value={displayName}
                        readOnly
                        disabled
                        className="field cursor-not-allowed bg-surface-muted opacity-85"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="ro-position"
                        className="label flex items-center justify-between"
                      >
                        <span>Position</span>
                        <span className="font-mono text-[10px] text-muted">LOCKED</span>
                      </label>
                      <input
                        id="ro-position"
                        type="text"
                        value={displayPosition}
                        readOnly
                        disabled
                        className="field cursor-not-allowed bg-surface-muted opacity-85"
                      />
                    </div>

                    <div>
                      <label htmlFor="ro-role" className="label flex items-center justify-between">
                        <span>Assigned Role</span>
                        <span className="font-mono text-[10px] text-muted">LOCKED</span>
                      </label>
                      <input
                        id="ro-role"
                        type="text"
                        value={`${ROLE_LABELS[displayRole]} (${displayRole})`}
                        readOnly
                        disabled
                        className="field cursor-not-allowed bg-surface-muted font-mono text-xs opacity-85"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ACCORDION 2: PERSONALIZATION — 6-THEME ENGINE & FONT SCALING
          ===================================================================== */}
      <div className="bento-shell">
        <div className="bento-core overflow-hidden p-0">
          <button
            type="button"
            onClick={() => toggleSection("personalization")}
            aria-expanded={openSections.personalization}
            className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-muted"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  2. Personalization: Theme Engine &amp; Font Size
                </span>
                <span className="pill-ok text-[10px]">{activeThemeMeta.name}</span>
                <span className="pill text-[10px]">Font: {activeFontMeta.label}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Choose from 6 calibrated color themes and adjust global font scaling across the
                application.
              </p>
            </div>

            <AccordionChevron open={openSections.personalization} />
          </button>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              openSections.personalization
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden">
              <div className="space-y-6 border-t border-line px-6 py-5">
                {/* 6-Theme Selector Grid */}
                <div>
                  <div className="mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">
                      System Color Theme (6 Options)
                    </h3>
                    <p className="text-xs text-muted">
                      Every background, card, table, modal, badge, and sidebar dynamically
                      transitions with accessible contrast.
                    </p>
                  </div>

                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {THEMES.map((t) => {
                      const active = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTheme(t.id as ThemeId);
                            setToastMsg(`Theme switched to "${t.name}".`);
                          }}
                          aria-pressed={active}
                          className={`group flex flex-col justify-between rounded-2xl border p-4 text-left transition-all duration-200 ${
                            active
                              ? "border-brand-border bg-brand-soft ring-2 ring-[var(--epl-brand)]"
                              : "border-line bg-surface hover:bg-surface-muted"
                          }`}
                        >
                          <div>
                            {/* Live 4-Swatch Preview Bar */}
                            <div className="flex items-center justify-between gap-2">
                              <div
                                className="flex h-8 w-28 overflow-hidden rounded-lg border shadow-sm"
                                style={{ borderColor: "rgba(128,128,128,0.28)" }}
                              >
                                <span
                                  className="h-full flex-1"
                                  style={{ backgroundColor: t.swatches.bg }}
                                  title={`Background: ${t.swatches.bg}`}
                                />
                                <span
                                  className="h-full flex-1"
                                  style={{ backgroundColor: t.swatches.surface }}
                                  title={`Surface: ${t.swatches.surface}`}
                                />
                                <span
                                  className="h-full flex-1"
                                  style={{ backgroundColor: t.swatches.accent }}
                                  title={`Accent: ${t.swatches.accent}`}
                                />
                                <span
                                  className="h-full flex-1"
                                  style={{ backgroundColor: t.swatches.text }}
                                  title={`Text: ${t.swatches.text}`}
                                />
                              </div>

                              <span className="pill font-mono text-[10px] uppercase">
                                {t.family}
                              </span>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-ink">{t.name}</p>
                              {active && (
                                <span className="pill-ok text-[10px] font-semibold">Active</span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] font-medium text-brand">
                              {t.subtitle}
                            </p>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted">
                              {t.description}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 font-mono text-[10px] text-muted">
                            <span>BG {t.swatches.bg}</span>
                            <span>·</span>
                            <span>CTA {t.swatches.accent}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Global Font Size Scaling Controls */}
                <div className="border-t border-line pt-5">
                  <div className="mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">
                      Global Font Size Scaling
                    </h3>
                    <p className="text-xs text-muted">
                      Scales typography and spacing proportionally across all modules and dialogs.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {FONT_SIZES.map((f) => {
                      const active = fontSize === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setFontSize(f.id as FontSizeId);
                            setToastMsg(`Font size set to ${f.label} (${f.scale}).`);
                          }}
                          aria-pressed={active}
                          className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                            active
                              ? "border-brand-border bg-brand-soft ring-2 ring-[var(--epl-brand)]"
                              : "border-line bg-surface hover:bg-surface-muted"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-muted font-mono text-sm font-bold text-ink">
                              {f.badge}
                            </span>
                            <span className="font-mono text-xs font-semibold text-muted">
                              {f.scale}
                            </span>
                          </div>
                          <div className="mt-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-ink">{f.label}</p>
                              {active && <span className="pill-ok text-[10px]">Selected</span>}
                            </div>
                            <p className="mt-1 text-xs text-muted">{f.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ACCORDION 3: LOCAL SECURITY — CHANGE PASSWORD & SECURITY QUESTION
          ===================================================================== */}
      <div className="bento-shell">
        <div className="bento-core overflow-hidden p-0">
          <button
            type="button"
            onClick={() => toggleSection("security")}
            aria-expanded={openSections.security}
            className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-muted"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  3. Local Security: Password &amp; Recovery Question
                </span>
                {profile?.hasSecurityQuestion ? (
                  <span className="pill-ok text-[10px]">Recovery Configured</span>
                ) : (
                  <span className="pill-warning text-[10px]">Recovery Not Set</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Change your local account password and configure your security question for offline
                password recovery.
              </p>
            </div>

            <AccordionChevron open={openSections.security} />
          </button>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              openSections.security
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden">
              <div className="grid gap-6 border-t border-line px-6 py-5 lg:grid-cols-2">
                {/* A. Change Password Form */}
                <form
                  onSubmit={handlePasswordSubmit}
                  className="flex flex-col justify-between rounded-2xl border border-line bg-surface-muted p-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">Change Password</h3>
                        <p className="text-xs text-muted">
                          Requires your current password and strict alphanumeric + symbol
                          complexity.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPasswords((v) => !v)}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        {showPasswords ? "Hide" : "Show"}
                      </button>
                    </div>

                    {passwordError && (
                      <p
                        role="alert"
                        className="rounded-xl border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger"
                      >
                        {passwordError}
                      </p>
                    )}

                    <div>
                      <label htmlFor="cur-pw" className="label">
                        Current Password
                      </label>
                      <input
                        id="cur-pw"
                        type={showPasswords ? "text" : "password"}
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        className="field"
                      />
                    </div>

                    <div>
                      <label htmlFor="new-pw" className="label">
                        New Password
                      </label>
                      <input
                        id="new-pw"
                        type={showPasswords ? "text" : "password"}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="field"
                      />
                    </div>

                    <div>
                      <label htmlFor="conf-pw" className="label">
                        Confirm New Password
                      </label>
                      <input
                        id="conf-pw"
                        type={showPasswords ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="field"
                      />
                    </div>

                    {/* Live 5-Rule Complexity Checklist */}
                    <div className="rounded-xl border border-line bg-surface p-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Password Requirements
                      </p>
                      <ul className="mt-2 space-y-1.5 text-xs">
                        {pwRules.map((rule) => (
                          <li
                            key={rule.id}
                            className={`flex items-center gap-2 ${
                              rule.met ? "font-medium text-brand" : "text-muted"
                            }`}
                          >
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                                rule.met
                                  ? "bg-brand-soft text-brand-soft-fg"
                                  : "border border-line bg-surface-muted text-muted"
                              }`}
                            >
                              {rule.met ? "✓" : "·"}
                            </span>
                            <span>{rule.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-5 pt-2">
                    <button type="submit" disabled={passwordBusy} className="btn-primary w-full">
                      {passwordBusy && <Spinner />}
                      <span>{passwordBusy ? "Updating password…" : "Update Password"}</span>
                    </button>
                  </div>
                </form>

                {/* B. Security Question Setup (Local Password Recovery) */}
                <form
                  onSubmit={handleSecurityQuestionSubmit}
                  className="flex flex-col justify-between rounded-2xl border border-line bg-surface-muted p-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">
                          Security Question (Local Recovery)
                        </h3>
                        <p className="text-xs text-muted">
                          Used to recover your password locally from the login screen if you forget
                          it.
                        </p>
                      </div>
                      {profile?.hasSecurityQuestion ? (
                        <span className="pill-ok shrink-0 text-[10px]">Active</span>
                      ) : (
                        <span className="pill-warning shrink-0 text-[10px]">Not Set</span>
                      )}
                    </div>

                    {profile?.securityQuestion && (
                      <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Currently Active Question
                        </p>
                        <p className="mt-0.5 font-medium text-ink">{profile.securityQuestion}</p>
                      </div>
                    )}

                    {securityError && (
                      <p
                        role="alert"
                        className="rounded-xl border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger"
                      >
                        {securityError}
                      </p>
                    )}

                    <div>
                      <label htmlFor="sec-q-select" className="label">
                        Select a Security Question
                      </label>
                      <select
                        id="sec-q-select"
                        value={selectedQuestionChoice}
                        onChange={(e) => setSelectedQuestionChoice(e.target.value)}
                        className="field"
                      >
                        {PRESET_SECURITY_QUESTIONS.map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                        <option value="__custom__">Write a custom security question…</option>
                      </select>
                    </div>

                    {selectedQuestionChoice === "__custom__" && (
                      <div>
                        <label htmlFor="sec-q-custom" className="label">
                          Custom Security Question
                        </label>
                        <input
                          id="sec-q-custom"
                          type="text"
                          maxLength={255}
                          value={customQuestion}
                          onChange={(e) => setCustomQuestion(e.target.value)}
                          placeholder="e.g., What was the name of your first thesis advisor?"
                          required
                          className="field"
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor="sec-answer" className="label">
                        Security Answer (Case-insensitive)
                      </label>
                      <input
                        id="sec-answer"
                        type="text"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        placeholder="Enter your recovery answer"
                        required
                        className="field"
                      />
                    </div>

                    <div>
                      <label htmlFor="sec-cur-pw" className="label">
                        Confirm Current Password (Required to save)
                      </label>
                      <input
                        id="sec-cur-pw"
                        type="password"
                        autoComplete="current-password"
                        value={securityPassword}
                        onChange={(e) => setSecurityPassword(e.target.value)}
                        placeholder="Re-enter your current password"
                        required
                        className="field"
                      />
                    </div>
                  </div>

                  <div className="mt-5 pt-2">
                    <button type="submit" disabled={securityBusy} className="btn-primary w-full">
                      {securityBusy && <Spinner />}
                      <span>
                        {securityBusy
                          ? "Saving security question…"
                          : profile?.hasSecurityQuestion
                            ? "Update Security Question"
                            : "Save Security Question"}
                      </span>
                    </button>
                  </div>
                </form>

                {/* C. One-Time Backup Codes (6 Single-Use Recovery Codes) */}
                <div className="rounded-2xl border border-line bg-surface-muted p-5 lg:col-span-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink">
                          One-Time Backup Codes (6 Single-Use Codes)
                        </h3>
                        <span
                          className={
                            (profile?.backupCodesRemaining ?? 0) > 0
                              ? "pill-ok text-[10px]"
                              : "pill text-[10px]"
                          }
                        >
                          {profile?.backupCodesRemaining ?? 0} of 6 Unused Codes Remaining
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Generate a set of 6 one-time-use backup codes for account recovery. Each
                        code can only be used once on the Forgot Password screen and is immediately
                        invalidated upon use. Generating a new set replaces any previous codes.
                      </p>
                    </div>
                  </div>

                  {backupError && (
                    <p
                      role="alert"
                      className="mt-4 rounded-xl border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger"
                    >
                      {backupError}
                    </p>
                  )}

                  <form
                    onSubmit={handleGenerateBackupCodes}
                    className="mt-4 flex flex-wrap items-end gap-3"
                  >
                    <div className="min-w-[240px] flex-1">
                      <label htmlFor="backup-cur-pw" className="label">
                        Verify Current Password to Generate 6 Backup Codes
                      </label>
                      <input
                        id="backup-cur-pw"
                        type="password"
                        autoComplete="current-password"
                        value={backupPassword}
                        onChange={(e) => setBackupPassword(e.target.value)}
                        placeholder="Enter your current password"
                        required
                        className="field"
                      />
                    </div>
                    <button type="submit" disabled={backupBusy} className="btn-primary">
                      {backupBusy && <Spinner />}
                      <span>
                        {backupBusy
                          ? "Generating codes…"
                          : (profile?.backupCodesRemaining ?? 0) > 0
                            ? "Regenerate 6 Backup Codes"
                            : "Generate 6 Backup Codes"}
                      </span>
                    </button>
                  </form>

                  {generatedCodes && (
                    <div className="animate-fade-up mt-5 rounded-xl border border-brand-border bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            Save Your 6 One-Time Backup Codes Now
                          </p>
                          <p className="text-[11px] text-muted">
                            Store these codes in a safe place. Each code works once and will not be
                            shown again after you leave this page.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyBackupCodes()}
                          className="btn-secondary text-xs"
                        >
                          Copy all 6 codes
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {generatedCodes.map((code, idx) => (
                          <div
                            key={code}
                            className="flex items-center justify-between rounded-lg border border-line bg-surface-muted px-3 py-2 font-mono text-xs font-semibold text-ink"
                          >
                            <span className="text-[10px] text-muted">#{idx + 1}</span>
                            <span className="tracking-wider">{code}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
