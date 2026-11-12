import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { APP_NAME } from "@/demo/config";
import { RoleProvider } from "@/demo/role";
import { DemoChrome } from "@/demo/DemoChrome";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Corporate land portfolio system (demo, synthetic data)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <RoleProvider>
          <DemoChrome>{children}</DemoChrome>
        </RoleProvider>
      </body>
    </html>
  );
}
