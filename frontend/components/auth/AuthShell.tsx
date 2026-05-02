"use client";

import Link from "next/link";
import React from "react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  bottomText: string;
  bottomLinkLabel: string;
  bottomLinkHref: string;
  children: React.ReactNode;
};

export default function AuthShell({
  title,
  subtitle,
  bottomText,
  bottomLinkLabel,
  bottomLinkHref,
  children,
}: AuthShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h2 className="auth-brand">eNeural Console</h2>
        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        {children}

        <div className="auth-footer">
          {bottomText}{" "}
          <Link href={bottomLinkHref} className="auth-footer-link">
            {bottomLinkLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
