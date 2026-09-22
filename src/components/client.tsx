"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, variant = "primary", className = "", disabled = false, name, value }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string; disabled?: boolean; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-night text-white hover:bg-night-2 disabled:bg-night/40",
    secondary: "bg-surface text-ink ring-1 ring-line hover:bg-line-2 disabled:text-muted",
    danger: "bg-loss text-white hover:bg-red-800 disabled:bg-loss/40",
  };
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={disabled || pending}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-night px-4 text-sm font-semibold text-white hover:bg-night-2"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

export function ConfirmSubmit({ children, message, className = "" }: { children: React.ReactNode; message: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-loss px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:bg-loss/40 ${className}`}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
