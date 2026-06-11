import { T } from "../design/tokens";

// Lightweight global toast — DOM-based so any handler can report success or
// failure without React state plumbing. Errors must never be silent.
export function showToast(message, type = "info") {
  const existing = document.getElementById("lo-toast");
  if (existing) existing.remove();

  const accent = type === "error" ? T.negative : type === "success" ? T.teal : T.amber;
  const toast = document.createElement("div");
  toast.id = "lo-toast";
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    background: ${T.surface};
    border: 1px solid ${accent}66;
    border-radius: 12px;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    max-width: calc(100% - 40px);
    color: ${T.text};
    font-family: ${T.fontFamily};
    font-size: 13px;
    font-weight: 500;
  `;
  const dot = document.createElement("div");
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${accent}`;
  toast.appendChild(dot);
  toast.appendChild(document.createTextNode(message));
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, type === "error" ? 4500 : 2500);
}
