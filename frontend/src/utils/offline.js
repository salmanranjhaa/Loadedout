import { T } from "../design/tokens";

const QUEUE_KEY = "lo_offline_queue";

export function isOnline() {
  return navigator.onLine;
}

export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function queueRequest(url, options = {}) {
  const queue = getOfflineQueue();
  queue.push({ url, options, timestamp: Date.now() });
  saveQueue(queue);
  showOfflineToast("Saved offline. Will sync when you're back online.");
}

export async function processOfflineQueue() {
  const queue = getOfflineQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const response = await fetch(item.url, item.options);
      if (!response.ok) throw new Error("Failed");
    } catch {
      remaining.push(item);
    }
  }

  saveQueue(remaining);
  if (!remaining.length) {
    showOfflineToast("All changes synced!");
  }
}

export function showOfflineToast(message) {
  const existing = document.getElementById("lo-offline-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "lo-offline-toast";
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    background: ${T.surface};
    border: 1px solid ${T.teal}55;
    border-radius: 12px;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    animation: lo-fade-up 0.2s ease forwards;
    max-width: calc(100% - 40px);
    color: ${T.text};
    font-family: ${T.fontFamily};
    font-size: 13px;
    font-weight: 500;
  `;
  toast.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:${T.teal}"></div>${message}`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export function initOfflineQueue() {
  window.addEventListener("online", () => {
    processOfflineQueue();
  });
}

export const initOfflineSync = initOfflineQueue;
