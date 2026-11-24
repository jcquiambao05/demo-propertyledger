export type ThemeId =
  | "default"
  | "white"
  | "dark"
  | "charcoal-gold"
  | "sage-terracotta"
  | "midnight-lime";

export type FontSizeId = "sm" | "md" | "lg";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  subtitle: string;
  family: "light" | "dark";
  description: string;
  swatches: {
    bg: string;
    surface: string;
    accent: string;
    text: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "default",
    name: "Default Theme",
    subtitle: "Natural Limestone & Forest",
    family: "light",
    description:
      "The signature Eagle Property Ledger palette pairing warm limestone surfaces with deep forest greens.",
    swatches: {
      bg: "#F4F6F3",
      surface: "#FFFFFF",
      accent: "#1A472A",
      text: "#121D17",
    },
  },
  {
    id: "white",
    name: "All-White Light",
    subtitle: "High-Clarity Pure White",
    family: "light",
    description:
      "Crisp pure-white daylight surfaces with slate borders for maximum document and table legibility.",
    swatches: {
      bg: "#FFFFFF",
      surface: "#F8FAFC",
      accent: "#14532D",
      text: "#0F172A",
    },
  },
  {
    id: "dark",
    name: "Dark Theme",
    subtitle: "Obsidian & Emerald",
    family: "dark",
    description:
      "Low-glare dark workspace designed for extended geospatial analysis and evening review sessions.",
    swatches: {
      bg: "#0D1310",
      surface: "#151D19",
      accent: "#34D399",
      text: "#ECF3EE",
    },
  },
  {
    id: "charcoal-gold",
    name: "Charcoal & Gold",
    subtitle: "Executive Slate & Amber Gold",
    family: "dark",
    description:
      "Charcoal gray (#2B2D31) surfaces with crisp silver (#D9DADC) typography and warm gold (#FFC93C) CTAs.",
    swatches: {
      bg: "#2B2D31",
      surface: "#313338",
      accent: "#FFC93C",
      text: "#D9DADC",
    },
  },
  {
    id: "sage-terracotta",
    name: "Sage & Terracotta",
    subtitle: "Botanical Sage & Tomato Red",
    family: "light",
    description:
      "Warm off-white (#F7F5EF) canvas with calming sage (#9CAF88) containers and decisive tomato red (#E8412C) actions.",
    swatches: {
      bg: "#F7F5EF",
      surface: "#9CAF88",
      accent: "#E8412C",
      text: "#22291F",
    },
  },
  {
    id: "midnight-lime",
    name: "Midnight & Cyber Lime",
    subtitle: "Deep Navy Slate & Cyber Lime",
    family: "dark",
    description:
      "Deep midnight navy-slate (#121A24) dashboard surfaces with elevated slate cards (#1B2533) and electric cyber-lime (#C6F135) accents.",
    swatches: {
      bg: "#121A24",
      surface: "#1B2533",
      accent: "#C6F135",
      text: "#F8FAFC",
    },
  },
];

export const FONT_SIZES: {
  id: FontSizeId;
  label: string;
  badge: string;
  scale: string;
  description: string;
}[] = [
  {
    id: "sm",
    label: "Small",
    badge: "A-",
    scale: "90%",
    description: "Compact typography for dense tables and wide monitors.",
  },
  {
    id: "md",
    label: "Default",
    badge: "A",
    scale: "100%",
    description: "Standard balanced scale across cards, forms, and maps.",
  },
  {
    id: "lg",
    label: "Large",
    badge: "A+",
    scale: "112%",
    description: "Larger text and controls for enhanced reading comfort.",
  },
];

export const PRESET_SECURITY_QUESTIONS = [
  "What was the name of your first elementary or primary school?",
  "In what city or municipality did your parents first meet?",
  "What was the name of the street you grew up on?",
  "What was the title of your first professional job role?",
  "What was the make and model of your first vehicle?",
] as const;

export function isDarkTheme(id: ThemeId): boolean {
  return id === "dark" || id === "charcoal-gold" || id === "midnight-lime";
}
