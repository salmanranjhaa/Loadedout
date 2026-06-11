import { useEffect } from "react";
import { T } from "../../design/tokens";

export default function PRCelebration({ exercise, weight, reps, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);

  const pieces = Array.from({ length: 32 });
  const colors = [T.teal, T.amber, T.violet, "#FF5C9E", "#5C8FFC", T.positive];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: T.z.confetti,
        pointerEvents: "none",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Dark overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10,11,16,0.55)",
          animation: "lo-fade-up 0.3s ease forwards",
        }}
      />

      {/* Center text */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          animation: "lo-fade-up 0.4s ease 0.1s both",
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: T.amber,
            fontFamily: T.fontMono,
            letterSpacing: -2,
            lineHeight: 1,
            textShadow: `0 0 40px ${T.amber}66`,
          }}
        >
          NEW PR
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: T.text,
            marginTop: 12,
          }}
        >
          {exercise}
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: T.gold,
            fontFamily: T.fontMono,
            marginTop: 4,
          }}
        >
          {weight} kg × {reps}
        </div>
      </div>

      {/* Confetti pieces */}
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.4;
        const dur = 1.6 + Math.random() * 1.2;
        const rot = Math.random() * 720 - 360;
        const color = colors[i % colors.length];
        const size = 5 + Math.random() * 7;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: -20,
              width: size,
              height: size * 0.45,
              background: color,
              borderRadius: 2,
              animation: `lo-confetti ${dur}s cubic-bezier(.2,.6,.3,1) ${delay}s forwards`,
              "--rot": `${rot}deg`,
            }}
          />
        );
      })}
    </div>
  );
}
