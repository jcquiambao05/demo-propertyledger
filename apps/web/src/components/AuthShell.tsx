"use client";

import type { ReactNode } from "react";
import Image from "next/image";

interface AuthShellProps {
  children: ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#0c1412] px-4 py-8 sm:px-8 sm:py-12">
      {/* Full-bleed outer background image — visible, rich, and softly diffused */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <Image
          src="/brand/plant-bg.jpg"
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          className="scale-105 object-cover object-center blur-[5px] brightness-[0.78] contrast-[1.06] saturate-[1.05]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,18,15,0.12)_0%,rgba(6,12,10,0.52)_100%)]" />
      </div>

      {/* Centered Floating Split Card */}
      <section
        aria-label="Authentication"
        className="relative z-10 w-full max-w-[1080px] overflow-hidden rounded-[22px] ring-1 ring-white/25 shadow-[0_36px_100px_-12px_rgba(0,0,0,0.82)]"
      >
        {/* Continuous focal visual spanning behind both halves of the card */}
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          <Image
            src="/brand/plant-bg.jpg"
            alt="Eagle Cement Corporation plant facility"
            fill
            priority
            unoptimized
            sizes="(max-width: 1080px) 100vw, 1080px"
            className="object-cover object-center brightness-[0.94] contrast-[1.05]"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#07100d]/40 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07100d]/82 via-[#07100d]/15 to-transparent" />
        </div>

        {/* Balanced split grid inside the floating card */}
        <div className="relative z-10 grid min-h-[600px] grid-cols-1 md:min-h-[640px] md:grid-cols-[1.15fr_1fr]">
          {/* Left Panel: Framed Brand Logo Pill + Open Focal Visual + Minimal Editorial Title */}
          <div className="flex min-h-[240px] flex-col justify-between p-8 sm:p-10 md:min-h-full lg:p-12">
            <header className="flex items-center">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-[#0d1714]/55 px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
                <div className="relative h-8 w-[76px] shrink-0">
                  <Image
                    src="/brand/eagle-logo.png"
                    alt="Eagle Cement Corporation"
                    fill
                    priority
                    unoptimized
                    sizes="76px"
                    className="object-contain object-left drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                  />
                </div>
                <span className="h-4 w-px bg-white/20" aria-hidden="true" />
                <div className="leading-tight">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/95">
                    Eagle Cement
                  </p>
                  <p className="text-[10px] font-normal tracking-[0.02em] text-white/65">
                    Land Registry
                  </p>
                </div>
              </div>
            </header>

            <div className="mt-auto pt-12 md:pt-0">
              <h2 className="text-[28px] font-normal leading-[1.14] tracking-[-0.025em] text-white sm:text-[34px]">
                Eagle Property
                <br />
                Ledger
              </h2>
              <p className="mt-2.5 max-w-[30ch] text-[13.5px] font-light leading-relaxed text-white/75">
                Corporate land &amp; title management.
              </p>
            </div>
          </div>

          {/* Right Panel: Frosted Glass Form Surface */}
          <div className="auth-glass-panel flex flex-col items-center justify-center border-t border-white/[0.12] bg-[#111a17]/62 px-8 py-10 backdrop-blur-2xl sm:px-12 sm:py-12 md:border-l md:border-t-0 lg:px-14 lg:py-14">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
