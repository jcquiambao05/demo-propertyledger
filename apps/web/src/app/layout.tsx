import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Eagle Property Ledger",
  description: "Corporate land & title management system",
};

// Account-scoped zero-flash theme initialization: reads the active user's scoped key
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var uid = localStorage.getItem('epl.activeUserId');
    var t = (uid && localStorage.getItem('epl.theme:' + uid)) || 'default';
    if (t === 'espresso-sky') t = 'midnight-lime';
    var f = (uid && localStorage.getItem('epl.fontSize:' + uid)) || 'md';
    var root = document.documentElement;
    root.setAttribute('data-theme', t);
    root.setAttribute('data-font-size', f);
    if (t === 'dark' || t === 'charcoal-gold' || t === 'midnight-lime') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
