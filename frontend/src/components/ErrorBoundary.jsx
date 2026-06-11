import React from "react";
import { T } from "../design/tokens";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: "fixed", inset: 0, background: T.bg,
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 14, padding: 24, textAlign: "center",
          fontFamily: T.font, zIndex: 9999,
        }}
      >
        <div style={{ fontSize: 40 }}>😵</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: T.textMuted, maxWidth: 320, lineHeight: 1.5 }}>
          This screen hit an error. Your data is safe — tap below to get back.
        </div>
        <button
          onClick={() => { this.setState({ error: null }); window.location.assign("/"); }}
          style={{
            marginTop: 8, padding: "12px 28px", background: T.teal, color: "#0A0A0F",
            border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Back to home
        </button>
      </div>
    );
  }
}
