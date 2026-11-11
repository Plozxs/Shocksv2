"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Rachas" },
  { href: "/shocks", label: "Shocks" },
];

export function Navegacion() {
  const path = usePathname();
  return (
    <nav className="border-b border-border bg-panel">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-6 px-4">
        <span className="py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">JRM · Shock Lab</span>
        <div className="flex gap-1">
          {LINKS.map((l) => {
            const activo = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  activo ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
