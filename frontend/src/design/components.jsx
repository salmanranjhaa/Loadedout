import { useState } from "react";
import { T } from "./tokens";
import { Icon } from "./icons";

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, elevated = false, onClick, className = "" }) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: elevated ? T.elevated : T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.rCard,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Chip ────────────────────────────────────────────────────────────────────
export function Chip({ children, active, color, style = {}, onClick, size = "md" }) {
  const sizes = {
    sm: { fontSize: 11, padding: "4px 8px", height: 24 },
    md: { fontSize: 12, padding: "6px 10px", height: 28 },
    lg: { fontSize: 13, padding: "8px 14px", height: 34 },
  };
  const s = sizes[size];
  const c = color || T.teal;
  return (
    <button
      onClick={onClick}
      style={{
        height: s.height,
        padding: s.padding,
        background: active ? c : T.elevated,
        color: active ? "#0A0A0F" : T.text,
        border: active ? "none" : `1px solid ${T.border}`,
        borderRadius: T.rChip,
        fontSize: s.fontSize,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.1,
        cursor: onClick ? "pointer" : "default",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
export function Badge({ children, color, size = "sm" }) {
  const c = color || T.teal;
  const sizes = {
    sm: { fontSize: 10, padding: "2px 8px" },
    md: { fontSize: 11, padding: "3px 10px" },
  };
  const s = sizes[size];
  return (
    <span
      style={{
        fontSize: s.fontSize,
        fontWeight: 700,
        letterSpacing: 0.8,
        color: c,
        background: c + "22",
        padding: s.padding,
        borderRadius: 6,
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {children}
    </span>
  );
}

// ── FAB ─────────────────────────────────────────────────────────────────────
export function Fab({ onClick, icon = "plus", color, right = 20, bottom = 92 }) {
  const c = color || T.teal;
  return (
    <button
      onClick={onClick}
      style={{
        position: "absolute",
        right,
        bottom,
        zIndex: 20,
        width: 56,
        height: 56,
        borderRadius: 9999,
        background: c,
        border: "none",
        cursor: "pointer",
        boxShadow: `0 8px 24px ${c}55, 0 0 0 1px ${c}22`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0A0A0F",
      }}
    >
      <Icon name={icon} size={24} strokeWidth={2.4} />
    </button>
  );
}

// ── Page header ─────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, onProfile, trailing, profile }) {
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "LO";
  return (
    <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: T.text, lineHeight: 1.1 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4, letterSpacing: 0.1 }}>
            {subtitle}
          </div>
        )}
      </div>
      {trailing}
      <button
        onClick={onProfile}
        style={{
          width: 36,
          height: 36,
          borderRadius: 9999,
          background: `linear-gradient(135deg, ${T.violet}, ${T.teal})`,
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0A0A0F",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.3,
          flexShrink: 0,
          fontFamily: "inherit",
        }}
      >
        {initials}
      </button>
    </div>
  );
}

// ── Back header (detail pages) ──────────────────────────────────────────────
export function DetailHeader({ onBack, title, subtitle, trailing }) {
  return (
    <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <button
        onClick={onBack}
        style={{
          width: 34,
          height: 34,
          borderRadius: 9999,
          background: T.elevated,
          border: `1px solid ${T.border}`,
          color: T.text,
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Icon name="chev-left" size={16} />
      </button>
      <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text, letterSpacing: -0.1 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 1 }}>{subtitle}</div>
        )}
      </div>
      {trailing || <div style={{ width: 34 }} />}
    </div>
  );
}

// ── Scrollable page body ─────────────────────────────────────────────────────
export function PageScroll({ children, padBottom = 110, style = {} }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        paddingBottom: padBottom,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Section header (within a page) ─────────────────────────────────────────
export function SectionHead({ title, trailing }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: T.textMuted,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div style={{ flex: 1 }} />
      {trailing}
    </div>
  );
}

// ── Toggle ──────────────────────────────────────────────────────────────────
export function Toggle({ on, onChange }) {
  return (
    <div
      onClick={() => onChange && onChange(!on)}
      style={{
        width: 34,
        height: 20,
        borderRadius: 9999,
        background: on ? T.teal : T.elevated2,
        position: "relative",
        transition: "background 0.2s",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: on ? "#0A0A0F" : T.textMuted,
          transition: "left 0.2s cubic-bezier(.34,1.56,.64,1)",
        }}
      />
    </div>
  );
}

// ── Settings row ─────────────────────────────────────────────────────────────
export function SettingsRow({ label, value, toggle, on: initialOn = false, last, onClick, danger }) {
  const [localOn, setLocalOn] = useState(!!initialOn);
  const dangerous = danger || value === "Danger";

  return (
    <div
      style={{
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: last ? "none" : `0.5px solid ${T.border}`,
        cursor: "pointer",
      }}
      onClick={() => {
        if (toggle) setLocalOn((v) => !v);
        onClick?.();
      }}
    >
      <span style={{ fontSize: 13, color: dangerous ? T.negative : T.text, fontWeight: 500, flex: 1 }}>
        {label}
      </span>
      {toggle ? (
        <Toggle on={localOn} />
      ) : value ? (
        <>
          <span
            style={{
              fontSize: 12,
              color: T.textMuted,
              fontFamily: /\d/.test(String(value)) ? T.fontMono : T.fontFamily,
            }}
          >
            {value}
          </span>
          <Icon name="chev-right" size={13} color={T.textDim} />
        </>
      ) : (
        <Icon name="chev-right" size={13} color={T.textDim} />
      )}
    </div>
  );
}

// ── Settings group ────────────────────────────────────────────────────────────
export function SettingsGroup({ title, children }) {
  return (
    <div style={{ padding: "0 20px 14px" }}>
      <div
        style={{
          fontSize: 11,
          color: T.textMuted,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 8,
          paddingLeft: 4,
        }}
      >
        {title}
      </div>
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Mini stat ─────────────────────────────────────────────────────────────────
export function MiniStat({ label, value }) {
  return (
    <div style={{ background: T.elevated, padding: "8px 10px", borderRadius: 10 }}>
      <div
        style={{
          fontSize: 9,
          color: T.textMuted,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: T.text,
          fontFamily: T.fontMono,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Macro bar ────────────────────────────────────────────────────────────────
export function MacroBar({ label, value, target, color, unit = "g" }) {
  const pct = Math.min(value / target, 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, letterSpacing: 0.3 }}>{label}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.text, fontWeight: 500 }}>
          {value}
          <span style={{ color: T.textDim }}>
            /{target}
            {unit}
          </span>
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 9999, background: T.elevated2, overflow: "hidden" }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: color, borderRadius: 9999 }} />
      </div>
    </div>
  );
}

// ── Macro ring ───────────────────────────────────────────────────────────────
export function MacroRing({ pct, value, target }) {
  const r = 44;
  const C = 2 * Math.PI * r;
  const dash = Math.min(pct, 1) * C;
  return (
    <div style={{ position: "relative", width: 108, height: 108, flexShrink: 0 }}>
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={r} fill="none" stroke={T.elevated2} strokeWidth="7" />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke={T.amber}
          strokeWidth="7"
          strokeDasharray={`${dash} ${C - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 54 54)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{ fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: -1, lineHeight: 1, fontFamily: T.fontMono }}
        >
          {value}
        </div>
        <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textDim, marginTop: 2 }}>of {target} kcal</div>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
        gap: 12,
      }}
    >
      {icon && (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: T.elevated,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: T.textDim,
          }}
        >
          <Icon name={icon} size={24} />
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>{subtitle}</div>}
      {action}
    </div>
  );
}

// ── Illustrated Empty States ─────────────────────────────────────────────────
export function IllustratedEmptyState({ variant, action }) {
  const configs = {
    workout: {
      icon: "dumbbell",
      title: "No workouts yet",
      subtitle: "Start your first session to track progress and earn PRs.",
      color: T.teal,
    },
    meals: {
      icon: "meal",
      title: "No meals logged",
      subtitle: "Log your first meal to see macros and nutrition insights.",
      color: T.amber,
    },
    schedule: {
      icon: "calendar",
      title: "Nothing scheduled",
      subtitle: "Add events to build your weekly routine.",
      color: T.violet,
    },
  };
  const cfg = configs[variant] || configs.workout;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "56px 28px",
        textAlign: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 28,
          background: `radial-gradient(circle at 30% 30%, ${cfg.color}33, ${cfg.color}11)`,
          border: `1px solid ${cfg.color}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: cfg.color,
        }}
      >
        <Icon name={cfg.icon} size={32} color={cfg.color} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{cfg.title}</div>
      <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5, maxWidth: 260 }}>{cfg.subtitle}</div>
      {action}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ width = "100%", height = 16, circle = false, style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: circle ? "50%" : Math.min(height / 2, 8),
        background: `linear-gradient(90deg, ${T.elevated} 25%, ${T.elevated2} 50%, ${T.elevated} 75%)`,
        backgroundSize: "200% 100%",
        animation: "lo-skeleton 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <Skeleton width="60%" height={18} />
      <Skeleton width="100%" height={12} />
      <Skeleton width="40%" height={12} />
    </div>
  );
}

export function SkeletonRing() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 20px" }}>
      <Skeleton width={108} height={108} circle />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton width="80%" height={14} />
        <Skeleton width="60%" height={14} />
        <Skeleton width="90%" height={14} />
      </div>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, actions }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: T.z.modal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(10,10,15,0.85)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: T.rCard,
          padding: 20,
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          animation: "lo-fade-up 0.2s ease forwards",
        }}
      >
        {title && <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{title}</div>}
        <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>{children}</div>
        {actions && (
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bottom Sheet ─────────────────────────────────────────────────────────────
export function BottomSheet({ open, onClose, title, children, height = "auto" }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: T.z.modal,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(10,10,15,0.88)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        style={{
          background: T.surface,
          borderRadius: "20px 20px 0 0",
          border: `1px solid ${T.border}`,
          borderBottom: "none",
          padding: "20px 20px 48px",
          width: "100%",
          maxWidth: 430,
          maxHeight: height === "auto" ? "85vh" : height,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
          animation: "lo-slide-up 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 9999,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: T.textMuted,
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
export function Toast({ message, type = "info", onClose }) {
  const colors = { info: T.teal, success: T.positive, error: T.negative, warning: T.warning };
  const c = colors[type] || T.teal;
  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: T.z.toast,
        background: T.surface,
        border: `1px solid ${c}55`,
        borderRadius: 12,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: T.shadow.md,
        animation: "lo-fade-up 0.2s ease forwards",
        maxWidth: "calc(100% - 40px)",
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
      <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{message}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.textDim, padding: 2 }}>
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

// ── Loading spinner ──────────────────────────────────────────────────────────
export function LoadingDots() {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: 32 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: T.teal,
            opacity: 0.5,
            animation: `lo-pulse 1.2s ${i * 0.2}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

// ── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner({ size = 16, color = T.teal }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        border: `2.5px solid ${color}30`,
        borderTopColor: color,
        animation: "lo-spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
export function Button({ children, variant = "primary", size = "md", loading = false, disabled = false, onClick, type = "button", style = {}, icon }) {
  const sizes = {
    sm: { padding: "10px 14px", fontSize: 13 },
    md: { padding: "14px 0", fontSize: 15 },
    lg: { padding: "16px 0", fontSize: 16 },
  };
  const s = sizes[size];

  const variants = {
    primary: {
      background: T.teal,
      color: "#0A0A0F",
      border: "none",
      boxShadow: `0 8px 24px ${T.teal}44`,
    },
    secondary: {
      background: T.elevated,
      color: T.text,
      border: `1px solid ${T.border}`,
      boxShadow: "none",
    },
    ghost: {
      background: "transparent",
      color: T.textMuted,
      border: "none",
      boxShadow: "none",
    },
  };
  const v = variants[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: "100%",
        padding: s.padding,
        background: v.background,
        color: v.color,
        border: v.border,
        borderRadius: T.rInput,
        fontSize: s.fontSize,
        fontWeight: 700,
        cursor: (disabled || loading) ? "not-allowed" : "pointer",
        fontFamily: T.fontFamily,
        letterSpacing: 0.1,
        opacity: (disabled || loading) ? 0.55 : 1,
        boxShadow: v.boxShadow,
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        position: "relative",
        ...style,
      }}
    >
      {loading && <Spinner size={14} color={v.color} />}
      {!loading && icon}
      <span style={{ opacity: loading ? 0.9 : 1 }}>{children}</span>
    </button>
  );
}

// ── Input ───────────────────────────────────────────────────────────────────
export function Input({ label, type = "text", value, onChange, placeholder, error, autoComplete, style = {}, icon, action }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ width: "100%", ...style }}>
      {label && (
        <label
          style={{
            fontSize: 12,
            color: error ? T.negative : T.textMuted,
            display: "block",
            marginBottom: 6,
            fontWeight: 500,
            transition: "color 0.2s",
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          width: "100%",
          background: T.elevated,
          borderRadius: T.rInput,
          border: `1px solid ${error ? T.negative : focused ? T.teal : T.border}`,
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          boxShadow: focused ? `0 0 0 3px ${T.teal}18` : "none",
        }}
      >
        {icon && (
          <div style={{ paddingLeft: 14, display: "flex", alignItems: "center", color: T.textMuted }}>
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            padding: "12px 14px",
            fontSize: 14,
            color: T.text,
            fontFamily: T.fontFamily,
            ...(icon ? { paddingLeft: 10 } : {}),
            ...(action ? { paddingRight: 10 } : {}),
          }}
        />
        {action && (
          <div style={{ paddingRight: 14, display: "flex", alignItems: "center" }}>
            {action}
          </div>
        )}
      </div>
      {error && typeof error === "string" && (
        <div style={{ fontSize: 11, color: T.negative, marginTop: 4, fontWeight: 500 }}>
          {error}
        </div>
      )}
    </div>
  );
}
