import { Icon } from "../../design/icons";
import { T } from "../../design/tokens";
import { relativeTime, groupByBucket } from "../../utils/time";

// Gemini-style chat history drawer. The app frame is locked to a phone width
// (max 430px), so on every viewport this presents as a slide-in drawer rather
// than a persistent two-column rail — triggered by the hamburger in the header.

const PANEL_BG = "#0d0d0d";

function SessionRow({ session, active, onSelect, onDelete }) {
  return (
    <div
      onClick={() => onSelect(session.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 10px",
        borderRadius: 10,
        cursor: "pointer",
        background: active ? "rgba(142,123,255,0.14)" : "transparent",
        border: `1px solid ${active ? T.violet + "55" : "transparent"}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: active ? T.text : "#cfcfcf",
            fontWeight: active ? 600 : 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.title || "Untitled chat"}
        </div>
        <div style={{ fontSize: 10.5, color: "#6b6b6b", marginTop: 2 }}>
          {relativeTime(session.updated_at || session.created_at)}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
        title="Delete chat"
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 4,
          color: "#5a5a5a", flexShrink: 0, display: "flex", borderRadius: 6,
        }}
      >
        <Icon name="trash" size={13} color="#5a5a5a" />
      </button>
    </div>
  );
}

export default function ChatHistorySidebar({
  open, onClose, sessions, loading, activeId, onNew, onSelect, onDelete,
}) {
  if (!open) return null;
  const groups = groupByBucket(sessions || []);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
      }}
    >
      <div
        style={{
          width: "82%",
          maxWidth: 320,
          height: "100%",
          background: PANEL_BG,
          borderRight: "1px solid #1d1d1d",
          display: "flex",
          flexDirection: "column",
          animation: "lo-slide-in-left 0.22s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        {/* Header: New chat + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 12px 10px" }}>
          <button
            onClick={onNew}
            style={{
              flex: 1, display: "flex", alignItems: "center", gap: 8,
              padding: "10px 12px", borderRadius: 12,
              background: "#1a1a1a", border: "1px solid #2a2a2a",
              color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Icon name="plus" size={15} color={T.text} /> New Chat
          </button>
          <button
            onClick={onClose}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: "#1a1a1a", border: "1px solid #2a2a2a",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <Icon name="x" size={15} color={T.textMuted} />
          </button>
        </div>

        {/* History list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 16px" }}>
          {loading ? (
            <div style={{ color: "#6b6b6b", fontSize: 12, textAlign: "center", padding: "28px 0" }}>
              Loading chats…
            </div>
          ) : groups.length === 0 ? (
            <div style={{ color: "#6b6b6b", fontSize: 12, textAlign: "center", padding: "28px 12px", lineHeight: 1.5 }}>
              No conversations yet.<br />Start chatting and your history shows up here.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} style={{ marginBottom: 12 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#5a5a5a",
                  textTransform: "uppercase", letterSpacing: 0.6, padding: "6px 10px 4px",
                }}>
                  {group.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {group.items.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      active={s.id === activeId}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
