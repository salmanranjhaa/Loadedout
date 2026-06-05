import { T } from "../../design/tokens";

export default function MarkdownRenderer({ text }) {
  if (!text) return null;

  // Split by code blocks first
  const segments = text.split(/(```[\s\S]*?```)/g);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {segments.map((seg, i) => {
        if (seg.startsWith("```")) {
          const code = seg.replace(/```(\w+)?\n?/, "").replace(/```$/, "");
          return (
            <pre
              key={i}
              style={{
                background: "#0D0D14",
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: 10,
                overflowX: "auto",
                fontSize: 11,
                fontFamily: T.fontMono,
                color: T.textMuted,
                margin: 0,
              }}
            >
              <code>{code}</code>
            </pre>
          );
        }

        // Process regular markdown text
        const lines = seg.split("\n");
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {lines.map((line, j) => {
              if (!line.trim()) return <div key={j} style={{ height: 4 }} />;

              // Table row
              if (line.startsWith("|")) {
                const cells = line.split("|").filter((c) => c.trim());
                return (
                  <div key={j} style={{ display: "flex", gap: 8, borderBottom: `1px solid ${T.border}`, padding: "4px 0" }}>
                    {cells.map((cell, k) => (
                      <span key={k} style={{ flex: 1, fontSize: 12, color: T.textMuted, fontFamily: T.fontMono }}>
                        {cell.trim()}
                      </span>
                    ))}
                  </div>
                );
              }

              // Header
              if (line.startsWith("### ")) {
                return (
                  <div key={j} style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 6 }}>
                    {line.replace("### ", "")}
                  </div>
                );
              }
              if (line.startsWith("## ")) {
                return (
                  <div key={j} style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 8 }}>
                    {line.replace("## ", "")}
                  </div>
                );
              }

              const isBullet = line.trimStart().startsWith("- ") || line.trimStart().startsWith("• ");
              const isNumbered = /^\d+\.\s/.test(line.trimStart());
              const content = isBullet
                ? line.replace(/^[\s\-•]+/, "")
                : isNumbered
                ? line.replace(/^\d+\.\s/, "")
                : line;

              // Inline formatting: **bold**, *italic*, `code`
              const parts = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
              const rendered = parts.map((p, idx) => {
                if (p.startsWith("**") && p.endsWith("**")) {
                  return (
                    <strong key={idx} style={{ color: T.text, fontWeight: 700 }}>
                      {p.slice(2, -2)}
                    </strong>
                  );
                }
                if (p.startsWith("*") && p.endsWith("*") && !p.startsWith("**")) {
                  return (
                    <em key={idx} style={{ color: T.textMuted, fontStyle: "italic" }}>
                      {p.slice(1, -1)}
                    </em>
                  );
                }
                if (p.startsWith("`") && p.endsWith("`")) {
                  return (
                    <code
                      key={idx}
                      style={{
                        background: T.elevated,
                        padding: "1px 4px",
                        borderRadius: 4,
                        fontFamily: T.fontMono,
                        fontSize: 11,
                        color: T.teal,
                      }}
                    >
                      {p.slice(1, -1)}
                    </code>
                  );
                }
                return p;
              });

              return (
                <div key={j} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  {isBullet && <span style={{ color: T.teal, marginTop: 2, flexShrink: 0, fontSize: 12 }}>•</span>}
                  {isNumbered && (
                    <span style={{ color: T.teal, fontSize: 11, fontWeight: 600, flexShrink: 0, minWidth: 16 }}>
                      {line.match(/^\d+/)[0]}.
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.55 }}>{rendered}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
