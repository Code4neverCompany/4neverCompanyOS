// @c4n/ui-tokens — React primitives for the 4never HUD aesthetic.
// TypeScript ports of project/ui_kits/console/HUDFrame.jsx + AppShell.jsx
// from the Claude Design handoff (2026-05-26). Visual output matches the
// source 1:1; the only changes are TS types + ES module exports (the JSX
// originals used Object.assign(window, {...}) for global registration).
//
// All primitives consume the CSS tokens loaded by `import "@c4n/ui-tokens/styles"`.

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FocusEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

// ─────────────────────────────────────────────────────────────────────
// HUDFrame
// ─────────────────────────────────────────────────────────────────────

export interface HUDFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Use the lighter, subdued gold-bracket variant. */
  soft?: boolean;
  /** Apply the kit's default 18px padding via the `.hud-flush` class. */
  flush?: boolean;
  children?: ReactNode;
}

export function HUDFrame({ children, soft, flush, className = "", ...rest }: HUDFrameProps) {
  const cls = ["hud", soft && "hud-soft", flush && "hud-flush", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...rest}>
      <span className="c-bl" />
      <span className="c-br" />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Eyebrow — uppercase HUD label, tracked, gold by default.
// ─────────────────────────────────────────────────────────────────────

export type EyebrowColor = "gold" | "cyan" | "purple" | "muted";

export interface EyebrowProps {
  color?: EyebrowColor;
  style?: CSSProperties;
  children?: ReactNode;
}

const EYEBROW_COLORS: Record<EyebrowColor, string> = {
  gold: "var(--fn-gold)",
  cyan: "var(--fn-cyan)",
  purple: "var(--fn-purple)",
  muted: "var(--fg-3)",
};

export function Eyebrow({ children, color = "gold", style }: EyebrowProps) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: EYEBROW_COLORS[color],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Btn — branded button. Variants: primary (gold bevel), secondary (cyan
// border), purple (brand-moment), ghost, danger.
// ─────────────────────────────────────────────────────────────────────

export type BtnVariant = "primary" | "secondary" | "purple" | "ghost" | "danger";

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  children?: ReactNode;
}

const BTN_BASE: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  padding: "11px 20px",
  borderRadius: 2,
  cursor: "pointer",
  border: "1px solid transparent",
  transition: "all 200ms cubic-bezier(0.16,1,0.3,1)",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const BTN_VARIANTS: Record<BtnVariant, CSSProperties> = {
  primary: {
    background: "var(--grad-gold-bevel)",
    color: "#1a1300",
    borderColor: "var(--fn-gold)",
    boxShadow: "var(--glow-gold-soft)",
  },
  secondary: {
    background: "transparent",
    color: "var(--fn-cyan)",
    borderColor: "var(--fn-cyan)",
  },
  purple: {
    background: "var(--grad-purple)",
    color: "var(--fn-white)",
    borderColor: "var(--fn-purple)",
    boxShadow: "0 0 14px rgba(176,0,255,0.25)",
  },
  ghost: {
    background: "transparent",
    color: "var(--fn-white)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  danger: {
    background: "transparent",
    color: "#FF5577",
    borderColor: "rgba(255,85,119,0.5)",
  },
};

export function Btn({
  children,
  variant = "primary",
  type = "button",
  style,
  disabled,
  ...rest
}: BtnProps) {
  const variantStyle = BTN_VARIANTS[variant];
  // type is forwarded from props with default "button" via destructure above.
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        ...BTN_BASE,
        ...variantStyle,
        ...(disabled ? { opacity: 0.55, cursor: "not-allowed" } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Badge — small tracked pill with optional pulsing dot.
// ─────────────────────────────────────────────────────────────────────

export type BadgeColor = "gold" | "cyan" | "purple" | "online" | "warn" | "err" | "muted";

export interface BadgeProps {
  color?: BadgeColor;
  dot?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}

const BADGE_TINTS: Record<BadgeColor, readonly [string, string, string]> = {
  gold: ["var(--fn-gold)", "rgba(255,196,0,0.45)", "rgba(255,196,0,0.08)"],
  cyan: ["var(--fn-cyan)", "rgba(0,194,255,0.45)", "rgba(0,194,255,0.06)"],
  purple: ["var(--fn-purple)", "rgba(176,0,255,0.45)", "rgba(176,0,255,0.06)"],
  online: ["#6BFF8C", "rgba(107,255,140,0.4)", "rgba(107,255,140,0.06)"],
  warn: ["#FFC400", "rgba(255,196,0,0.45)", "rgba(255,196,0,0.06)"],
  err: ["#FF5577", "rgba(255,85,119,0.45)", "rgba(255,85,119,0.06)"],
  muted: ["var(--fg-3)", "var(--border-neutral)", "transparent"],
};

export function Badge({ children, color = "gold", dot, style }: BadgeProps) {
  const [fg, bd, bg] = BADGE_TINTS[color];
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: 2,
        border: `1px solid ${bd}`,
        background: bg,
        color: fg,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
    >
      {dot && (
        <span
          className="pulse-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: fg,
            boxShadow: `0 0 8px ${fg}`,
          }}
        />
      )}
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Input — labeled input with gold idle border + cyan focus ring.
// ─────────────────────────────────────────────────────────────────────

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "style"> {
  /** Eyebrow label above the input. */
  label?: ReactNode;
  /** Helper line below the input (gray). Overridden by `error`. */
  hint?: ReactNode;
  /** Error message below the input (red). When set, border shows red too. */
  error?: ReactNode;
  /** Extra style applied to the <input> element. */
  style?: CSSProperties;
}

export function Input({ label, hint, error, style, ...rest }: InputProps) {
  const borderIdle = error ? "#FF5577" : "rgba(255,196,0,0.22)";
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
      {label != null && <Eyebrow>{label}</Eyebrow>}
      <input
        {...rest}
        style={{
          background: "rgba(10,11,20,0.85)",
          border: `1px solid ${borderIdle}`,
          color: "var(--fn-white)",
          fontSize: 14,
          padding: "10px 12px",
          borderRadius: 2,
          outline: "none",
          transition: "all 200ms",
          ...style,
        }}
        onFocus={(e: FocusEvent<HTMLInputElement>) => {
          e.currentTarget.style.borderColor = "var(--fn-cyan)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,194,255,0.15)";
          rest.onFocus?.(e);
        }}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          e.currentTarget.style.borderColor = borderIdle;
          e.currentTarget.style.boxShadow = "none";
          rest.onBlur?.(e);
        }}
      />
      {(hint != null || error != null) && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: error != null ? "#FF5577" : "var(--fg-3)",
          }}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Divider — gold-fading hairline.
// ─────────────────────────────────────────────────────────────────────

export function Divider({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        height: 1,
        background: "var(--grad-divider)",
        ...style,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// StatusDot — small pulsing dot.
// ─────────────────────────────────────────────────────────────────────

export interface StatusDotProps {
  color?: string;
  size?: number;
}

export function StatusDot({ color = "#6BFF8C", size = 8 }: StatusDotProps) {
  return (
    <span
      className="pulse-dot"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        boxShadow: `0 0 10px ${color}`,
      }}
    />
  );
}
