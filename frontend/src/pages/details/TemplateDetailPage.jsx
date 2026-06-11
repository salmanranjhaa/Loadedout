import { useState } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Card, DetailHeader, PageScroll, MiniStat, SectionHead } from "../../design/components";

const EXERCISES = [
  { name: "Bench press",         muscle: "Chest",    color: T.teal,   sets: 4, reps: "8–10", rest: "90s", pr: "92.5kg" },
  { name: "Incline DB press",    muscle: "Chest",    color: T.teal,   sets: 4, reps: "10–12", rest: "75s", pr: null },
  { name: "Weighted dips",       muscle: "Chest",    color: T.teal,   sets: 3, reps: "8–10", rest: "90s", pr: null },
  { name: "Cable fly",           muscle: "Chest",    color: T.teal,   sets: 3, reps: "12–15", rest: "60s", pr: null },
  { name: "Overhead DB press",   muscle: "Shoulder", color: T.amber,  sets: 4, reps: "10–12", rest: "75s", pr: null },
  { name: "Lateral raise",       muscle: "Shoulder", color: T.amber,  sets: 4, reps: "15–20", rest: "45s", pr: null },
  { name: "Tricep pushdown",     muscle: "Tri",      color: T.violet, sets: 3, reps: "12–15", rest: "60s", pr: null },
];

const SPARKLINE = [0.55, 0.62, 0.58, 0.70, 0.65, 0.72, 0.80, 0.75, 1.0];

export default function TemplateDetailPage({ template = {}, onBack, onStart }) {
  const { name = "Push Day" } = template;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: T.bg,
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
        animationName: "lo-slide-in",
        animationDuration: "0.25s",
        animationFillMode: "forwards",
      }}
    >
      {/* Header */}
      <DetailHeader
        onBack={onBack}
        title={name}
        trailing={
          <button
            style={{
              width: 34, height: 34, borderRadius: 9999,
              background: T.elevated, border: `1px solid ${T.border}`,
              color: T.text, padding: 0, display: "flex",
              alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <Icon name="edit" size={16} />
          </button>
        }
      />

      <PageScroll padBottom={96}>
        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Hero gradient card */}
          <div
            style={{
              borderRadius: T.rCard,
              background: `linear-gradient(135deg, ${T.tealDim}99, ${T.violetDim}cc)`,
              border: `1px solid ${T.teal}30`,
              padding: 20,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Decorative radial blur */}
            <div style={{
              position: "absolute", top: -30, right: -30,
              width: 130, height: 130, borderRadius: "50%",
              background: `${T.violet}25`, filter: "blur(32px)", pointerEvents: "none",
            }} />
            <div style={{ fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: -1, lineHeight: 1 }}>{name}</div>
            <div style={{ fontSize: 12, color: `${T.text}99`, marginTop: 6, fontFamily: T.fontMono }}>
              Chest · Shoulder · Tri · Built Jan 14
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {[
                { label: "Exercises", value: "7" },
                { label: "Sets", value: "25" },
                { label: "Est. time", value: "68m" },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    flex: 1, background: `rgba(7,10,16,0.45)`,
                    backdropFilter: "blur(8px)", borderRadius: 10,
                    padding: "8px 6px", textAlign: "center",
                    border: `1px solid rgba(255,255,255,0.08)`,
                  }}
                >
                  <div style={{ fontSize: 17, fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>{value}</div>
                  <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Last session card */}
          <div>
            <SectionHead title="Last session · 4 days ago" />
            <Card style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>Total volume</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.fontMono, color: T.text }}>4,820<span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}> kg</span></div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{
                  background: `${T.teal}22`, color: T.teal,
                  fontSize: 12, fontWeight: 700, fontFamily: T.fontMono,
                  padding: "4px 9px", borderRadius: 8,
                  border: `1px solid ${T.teal}44`,
                }}>+6.2%</div>
              </div>
              {/* Mini bar sparkline */}
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 28 }}>
                {SPARKLINE.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1, height: `${h * 100}%`, borderRadius: 3,
                      background: i === SPARKLINE.length - 1 ? T.teal : T.elevated2,
                    }}
                  />
                ))}
              </div>
            </Card>
          </div>

          {/* Exercises list */}
          <div>
            <SectionHead title="Exercises" />
            <Card style={{ overflow: "hidden" }}>
              {EXERCISES.map((ex, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 14px",
                    borderBottom: i < EXERCISES.length - 1 ? `1px solid ${T.border}` : "none",
                    position: "relative",
                  }}
                >
                  {/* Right accent bar */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: 3, background: ex.color, borderRadius: "0 2px 2px 0",
                  }} />

                  {/* Number badge */}
                  <div style={{
                    width: 24, height: 24, borderRadius: 7,
                    background: `${ex.color}20`,
                    border: `1px solid ${ex.color}50`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: ex.color, fontFamily: T.fontMono,
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  {/* Name + PR */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{ex.name}</span>
                      {ex.pr && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: T.amber,
                          background: `${T.amber}20`, border: `1px solid ${T.amber}50`,
                          padding: "1px 5px", borderRadius: 5, fontFamily: T.fontMono,
                        }}>PR {ex.pr}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontFamily: T.fontMono }}>
                      {ex.sets} × {ex.reps} · rest {ex.rest}
                    </div>
                  </div>

                  <Icon name="chev-right" size={14} color={T.textDim} />
                </div>
              ))}
            </Card>

            {/* Add exercise dashed button */}
            <button
              style={{
                width: "100%", marginTop: 10, padding: "12px",
                background: "transparent",
                border: `1.5px dashed ${T.border}`,
                borderRadius: T.rCard,
                color: T.textMuted, fontSize: 13, fontWeight: 500,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6, fontFamily: "inherit",
              }}
            >
              <Icon name="plus" size={16} color={T.textMuted} />
              Add exercise
            </button>
          </div>
        </div>
      </PageScroll>

      {/* Sticky bottom bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "12px 16px 28px",
        background: `linear-gradient(to top, ${T.bg} 70%, transparent)`,
        display: "flex", gap: 10, alignItems: "center",
      }}>
        <button
          style={{
            width: 46, height: 46, borderRadius: 13,
            background: T.elevated, border: `1px solid ${T.border}`,
            color: T.textMuted, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", flexShrink: 0,
          }}
        >
          <Icon name="history" size={20} />
        </button>
        <button
          onClick={onStart}
          style={{
            flex: 1, height: 46, borderRadius: 13,
            background: T.teal, border: "none",
            color: "#0A0A0F", fontSize: 15, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, fontFamily: "inherit",
          }}
        >
          <Icon name="bolt" size={18} color="#0A0A0F" strokeWidth={2.2} />
          Start Session
        </button>
      </div>
    </div>
  );
}
