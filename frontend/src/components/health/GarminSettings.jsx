import { useEffect, useState } from "react";
import { T } from "../../design/tokens";
import { Spinner, Toggle } from "../../design/components";
import { garminAPI } from "../../utils/api";
import { showToast } from "../../utils/toast";
import { syncMessage, syncedAgo } from "./health";

const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` };
const btn = { padding: "10px 0", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: 1 };
const IMPORTS = [
  ["activities", "Activities", "runs, walks, rides with their route"],
  ["health", "Daily health", "steps, heart rate, body battery, stress"],
  ["sleep", "Sleep", null],
  ["full_history", "Full history on first sync", null],
];
const SCHEDULE = [[0, "Off"], [3, "3 h"], [6, "6 h"], [24, "Daily"]];

// Profile → Garmin: each user's own personal API key, what to import and how often
export default function GarminSettings() {
  const [s, setS] = useState(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => { garminAPI.status().then(setS).catch(() => {}); }, []);

  async function act(name, fn, ok) {
    setBusy(name);
    try {
      const r = await fn();
      if (r?.settings) setS(r);
      if (ok) showToast(typeof ok === "function" ? ok(r) : ok, "success");
    } catch (e) {
      showToast(e?.message || "Garmin: something went wrong", "error");
    }
    setBusy("");
  }

  if (!s) return <div style={{ padding: "12px 0", color: T.textDim, fontSize: 12 }}>Loading…</div>;
  const opts = s.settings || {};
  const statusLine = s.status === "key_error"
    ? { color: T.negative, text: s.last_error || "Garmin did not accept the key" }
    : s.connected
      ? { color: T.teal, text: s.syncing ? "Syncing…" : `Connected · last sync ${syncedAgo(s.last_sync_at)}` }
      : { color: T.textDim, text: "Not connected" };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ ...row, alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, color: statusLine.color, fontWeight: 600 }}>{statusLine.text}</div>
        {s.key_source === "server" && <div style={{ fontSize: 11, color: T.textDim }}>Using the key set up on the server for your account. Save your own to replace it.</div>}
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
                 placeholder={s.key_source === "saved" ? "Key saved · paste a new one to replace it" : "Paste your Garmin personal API key"}
                 style={{ flex: 1, minWidth: 0, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 10px", color: T.text, fontSize: 13, fontFamily: T.fontMono, outline: "none" }} />
          <button disabled={!key.trim() || !!busy} onClick={() => act("key", async () => { const r = await garminAPI.saveKey(key.trim()); setKey(""); return r; }, "Garmin key saved, first sync started")}
                  style={{ ...btn, flex: "0 0 auto", padding: "0 14px", background: key.trim() ? T.teal : T.elevated, color: key.trim() ? "#0A0A0F" : T.textDim, border: "none" }}>
            {busy === "key" ? <Spinner size={14} color="#0A0A0F" /> : "Save"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
          Create it on the Garmin Connect website: Settings → Personal API Key. It is checked with Garmin, stored encrypted, used only for your account and never shown again.
        </div>
      </div>

      {IMPORTS.map(([k, l, hint]) => (
        <div key={k} style={row}>
          <div style={{ fontSize: 13, color: T.text }}>{l}{hint && <span style={{ color: T.textDim, fontSize: 11 }}> · {hint}</span>}</div>
          <Toggle on={!!opts[k]} onChange={(v) => act(k, () => garminAPI.settings({ [k]: v }))} />
        </div>
      ))}

      <div style={{ ...row, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ fontSize: 13, color: T.text }}>Automatic sync</div>
        <div style={{ display: "flex", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: 2 }}>
          {SCHEDULE.map(([h, l]) => (
            <button key={h} onClick={() => act("hours", () => garminAPI.settings({ auto_sync_hours: h }))}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                             background: opts.auto_sync_hours === h ? T.elevated2 : "transparent", color: opts.auto_sync_hours === h ? T.text : T.textMuted }}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
          You can also ask Claude to “sync my Garmin”. A Garmin activity from the same session as a workout you logged (same day, starting within 20 minutes) is joined to it, not added twice.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, paddingTop: 12 }}>
        <button disabled={!s.connected || !!busy || s.syncing} onClick={() => act("sync", garminAPI.sync, syncMessage).then(() => garminAPI.status().then(setS))}
                style={{ ...btn, background: s.connected ? T.teal : T.elevated, color: s.connected ? "#0A0A0F" : T.textDim, border: "none" }}>
          {busy === "sync" ? <Spinner size={14} color="#0A0A0F" /> : "Sync now"}
        </button>
        {(s.key_source || opts.enabled !== false) && s.connected && (
          <button disabled={!!busy} onClick={() => window.confirm("Disconnect Garmin? Imported workouts and health days stay.") && act("off", garminAPI.disconnect, "Garmin disconnected")}
                  style={{ ...btn, background: T.elevated, color: T.negative, border: `1px solid ${T.border}` }}>Disconnect</button>
        )}
      </div>
    </div>
  );
}
