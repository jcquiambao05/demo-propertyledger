"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import {
  THEMES,
  FONT_SIZES,
  isDarkTheme,
  type ThemeId,
  type FontSizeId,
} from "@/lib/theme";
import type { Role } from "@/lib/auth";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  position: string;
  role: Role;
  hasAvatar: boolean;
  securityQuestion: string | null;
  hasSecurityQuestion: boolean;
  backupCodesRemaining?: number;
  theme: ThemeId;
  fontSize: FontSizeId;
}

interface ThemeContextValue {
  theme: ThemeId;
  fontSize: FontSizeId;
  isDark: boolean;
  profile: UserProfile | null;
  avatarVersion: number;
  resolvedAvatarSrc: string | null;
  hasCustomAvatar: boolean;
  setTheme: (next: ThemeId) => void;
  setFontSize: (next: FontSizeId) => void;
  toggleLightDark: () => void;
  refreshProfile: () => Promise<void>;
  bumpAvatarVersion: () => void;
  uploadAvatarFile: (file: File) => Promise<void>;
  removeAvatarFile: () => Promise<void>;
  clearActiveUserSession: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  fontSize: "md",
  isDark: false,
  profile: null,
  avatarVersion: 1,
  resolvedAvatarSrc: null,
  hasCustomAvatar: false,
  setTheme: () => undefined,
  setFontSize: () => undefined,
  toggleLightDark: () => undefined,
  refreshProfile: async () => undefined,
  bumpAvatarVersion: () => undefined,
  uploadAvatarFile: async () => undefined,
  removeAvatarFile: async () => undefined,
  clearActiveUserSession: () => undefined,
});

const STORAGE_ACTIVE_USER = "epl.activeUserId";
const themeKeyFor = (uid: string) => `epl.theme:${uid}`;
const fontKeyFor = (uid: string) => `epl.fontSize:${uid}`;
const lastLightKeyFor = (uid: string) => `epl.lastLightTheme:${uid}`;
const lastDarkKeyFor = (uid: string) => `epl.lastDarkTheme:${uid}`;
const avatarKeyFor = (uid: string) => `epl.avatarDataUrl:${uid}`;

function normalizeStoredTheme(val: unknown): ThemeId {
  if (val === "espresso-sky") return "midnight-lime";
  if (typeof val === "string" && THEMES.some((t) => t.id === val)) {
    return val as ThemeId;
  }
  return "default";
}

function isValidTheme(val: unknown): val is ThemeId {
  return (
    val === "espresso-sky" || (typeof val === "string" && THEMES.some((t) => t.id === val))
  );
}

function isValidFontSize(val: unknown): val is FontSizeId {
  return typeof val === "string" && FONT_SIZES.some((f) => f.id === val);
}

function applyDomAttributes(theme: ThemeId, fontSize: FontSizeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-font-size", fontSize);
  if (isDarkTheme(theme)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

async function normalizeImageFileToDataUrl(file: File): Promise<string> {
  const validExt = /\.(png|jpe?g|webp)$/i.test(file.name);
  const validMime =
    file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp";
  if (!validExt && !validMime) {
    throw new Error("Only PNG, JPG, and WebP images are supported.");
  }
  if (file.size === 0) {
    throw new Error("The selected image file is empty.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Profile picture must be 5 MB or smaller.");
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image file."));
    };
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 256;
        const w = img.naturalWidth || maxDim;
        const h = img.naturalHeight || maxDim;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const compressed = canvas.toDataURL("image/webp", 0.88);
        resolve(compressed.startsWith("data:image/") ? compressed : rawDataUrl);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [theme, setThemeState] = useState<ThemeId>("default");
  const [fontSize, setFontSizeState] = useState<FontSizeId>("md");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(1);
  const [localAvatarDataUrl, setLocalAvatarDataUrl] = useState<string | null>(null);

  // Derive a deterministic account scope key from profile.id or session user name+role
  const accountKey = useMemo(() => {
    if (profile?.id) return profile.id;
    if (session?.user?.name || session?.user?.role) {
      return `${session.user.role ?? "USER"}:${session.user.name ?? "default"}`;
    }
    return null;
  }, [profile?.id, session?.user?.name, session?.user?.role]);

  // Load account-scoped localStorage preferences whenever accountKey changes
  useEffect(() => {
    if (!accountKey) return;
    try {
      localStorage.setItem(STORAGE_ACTIVE_USER, accountKey);
      const savedTheme = localStorage.getItem(themeKeyFor(accountKey));
      const savedFont = localStorage.getItem(fontKeyFor(accountKey));
      const savedAvatar = localStorage.getItem(avatarKeyFor(accountKey));

      const nextTheme: ThemeId = normalizeStoredTheme(savedTheme);
      const nextFont: FontSizeId = isValidFontSize(savedFont) ? savedFont : "md";

      setThemeState(nextTheme);
      setFontSizeState(nextFont);
      setLocalAvatarDataUrl(
        savedAvatar && savedAvatar.startsWith("data:image/") ? savedAvatar : null,
      );
      applyDomAttributes(nextTheme, nextFont);
    } catch {
      // Ignore storage access errors
    }
  }, [accountKey]);

  const persistPreferences = useCallback(
    (nextTheme: ThemeId, nextFont: FontSizeId, uidOverride?: string | null) => {
      const uid = uidOverride ?? accountKey;
      try {
        if (uid) {
          localStorage.setItem(STORAGE_ACTIVE_USER, uid);
          localStorage.setItem(themeKeyFor(uid), nextTheme);
          localStorage.setItem(fontKeyFor(uid), nextFont);
          if (isDarkTheme(nextTheme)) {
            localStorage.setItem(lastDarkKeyFor(uid), nextTheme);
          } else {
            localStorage.setItem(lastLightKeyFor(uid), nextTheme);
          }
        }
      } catch {
        // Ignore storage errors
      }
      applyDomAttributes(nextTheme, nextFont);
      void api("/profile/preferences", {
        method: "PATCH",
        body: JSON.stringify({ theme: nextTheme, fontSize: nextFont }),
      }).catch(() => undefined);
    },
    [accountKey],
  );

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api<UserProfile>("/profile");
      setProfile(data);

      // Account-scoped resolution: check if this specific user ID has a local preference,
      // otherwise use their DB preference (falling back to "default" / "md" for new users).
      let userLocalTheme: string | null = null;
      let userLocalFont: string | null = null;
      let userLocalAvatar: string | null = null;
      try {
        userLocalTheme = localStorage.getItem(themeKeyFor(data.id));
        userLocalFont = localStorage.getItem(fontKeyFor(data.id));
        userLocalAvatar = localStorage.getItem(avatarKeyFor(data.id));
        localStorage.setItem(STORAGE_ACTIVE_USER, data.id);
      } catch {
        // Ignore
      }

      const resolvedTheme: ThemeId = isValidTheme(data.theme)
        ? normalizeStoredTheme(data.theme)
        : isValidTheme(userLocalTheme)
          ? normalizeStoredTheme(userLocalTheme)
          : "default";
      const resolvedFont: FontSizeId = isValidFontSize(data.fontSize)
        ? data.fontSize
        : isValidFontSize(userLocalFont)
          ? userLocalFont
          : "md";

      setThemeState(resolvedTheme);
      setFontSizeState(resolvedFont);
      setLocalAvatarDataUrl(
        userLocalAvatar && userLocalAvatar.startsWith("data:image/") ? userLocalAvatar : null,
      );
      try {
        localStorage.setItem(themeKeyFor(data.id), resolvedTheme);
        localStorage.setItem(fontKeyFor(data.id), resolvedFont);
      } catch {
        // Ignore
      }
      applyDomAttributes(resolvedTheme, resolvedFont);
    } catch {
      // Ignore unauthenticated or transient errors
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void refreshProfile();
    } else if (status === "unauthenticated") {
      setProfile(null);
      setLocalAvatarDataUrl(null);
      setThemeState("default");
      setFontSizeState("md");
      applyDomAttributes("default", "md");
    }
  }, [status, session?.user?.name, session?.user?.role, refreshProfile]);

  const setTheme = useCallback(
    (next: ThemeId) => {
      setThemeState(next);
      setProfile((prev) => (prev ? { ...prev, theme: next } : prev));
      persistPreferences(next, fontSize, profile?.id ?? accountKey);
    },
    [fontSize, persistPreferences, profile?.id, accountKey],
  );

  const setFontSize = useCallback(
    (next: FontSizeId) => {
      setFontSizeState(next);
      setProfile((prev) => (prev ? { ...prev, fontSize: next } : prev));
      persistPreferences(theme, next, profile?.id ?? accountKey);
    },
    [theme, persistPreferences, profile?.id, accountKey],
  );

  const toggleLightDark = useCallback(() => {
    const uid = profile?.id ?? accountKey;
    let nextTheme: ThemeId;
    if (isDarkTheme(theme)) {
      let lastLight: string | null = null;
      try {
        if (uid) lastLight = localStorage.getItem(lastLightKeyFor(uid));
      } catch {
        // Ignore
      }
      nextTheme =
        isValidTheme(lastLight) && !isDarkTheme(lastLight) ? lastLight : "default";
    } else {
      let lastDark: string | null = null;
      try {
        if (uid) lastDark = localStorage.getItem(lastDarkKeyFor(uid));
      } catch {
        // Ignore
      }
      nextTheme = isValidTheme(lastDark) && isDarkTheme(lastDark) ? lastDark : "dark";
    }
    setTheme(nextTheme);
  }, [theme, setTheme, profile?.id, accountKey]);

  const bumpAvatarVersion = useCallback(() => {
    setAvatarVersion((v) => v + 1);
  }, []);

  const uploadAvatarFile = useCallback(
    async (file: File) => {
      const uid = profile?.id ?? accountKey;
      const dataUrl = await normalizeImageFileToDataUrl(file);
      setLocalAvatarDataUrl(dataUrl);
      try {
        if (uid) localStorage.setItem(avatarKeyFor(uid), dataUrl);
      } catch {
        // Ignore quota errors
      }
      setProfile((prev) => (prev ? { ...prev, hasAvatar: true } : prev));
      setAvatarVersion((v) => v + 1);

      try {
        const form = new FormData();
        form.append("avatar", file);
        await api("/profile/avatar", { method: "POST", body: form });
        setAvatarVersion((v) => v + 1);
      } catch {
        // Keep account-scoped local data URL active
      }
    },
    [profile?.id, accountKey],
  );

  const removeAvatarFile = useCallback(async () => {
    const uid = profile?.id ?? accountKey;
    setLocalAvatarDataUrl(null);
    try {
      if (uid) localStorage.removeItem(avatarKeyFor(uid));
    } catch {
      // Ignore
    }
    setProfile((prev) => (prev ? { ...prev, hasAvatar: false } : prev));
    setAvatarVersion((v) => v + 1);

    try {
      await api("/profile/avatar", { method: "DELETE" });
    } catch {
      // Ignore
    }
  }, [profile?.id, accountKey]);

  const clearActiveUserSession = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_ACTIVE_USER);
    } catch {
      // Ignore
    }
    setProfile(null);
    setLocalAvatarDataUrl(null);
    setThemeState("default");
    setFontSizeState("md");
    applyDomAttributes("default", "md");
  }, []);

  const resolvedAvatarSrc = useMemo(() => {
    if (localAvatarDataUrl) return localAvatarDataUrl;
    if (profile?.hasAvatar) return `/api/core/profile/avatar?v=${avatarVersion}`;
    return null;
  }, [localAvatarDataUrl, profile?.hasAvatar, avatarVersion]);

  const hasCustomAvatar = Boolean(localAvatarDataUrl || profile?.hasAvatar);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      fontSize,
      isDark: isDarkTheme(theme),
      profile,
      avatarVersion,
      resolvedAvatarSrc,
      hasCustomAvatar,
      setTheme,
      setFontSize,
      toggleLightDark,
      refreshProfile,
      bumpAvatarVersion,
      uploadAvatarFile,
      removeAvatarFile,
      clearActiveUserSession,
    }),
    [
      theme,
      fontSize,
      profile,
      avatarVersion,
      resolvedAvatarSrc,
      hasCustomAvatar,
      setTheme,
      setFontSize,
      toggleLightDark,
      refreshProfile,
      bumpAvatarVersion,
      uploadAvatarFile,
      removeAvatarFile,
      clearActiveUserSession,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
