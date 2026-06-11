import { useState, useEffect, useRef } from "react";
import { T, catColors } from "../design/tokens";
import { Icon } from "../design/icons";
import { showToast } from "../utils/toast";
import {
  PageHeader, PageScroll, Chip, Fab, LoadingDots, EmptyState,
} from "../design/components";
import {
  authAPI,
  getGoogleOAuthOrigin,
  isNativePlatform,
  runGoogleAuthFlow,
  scheduleAPI,
} from "../utils/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const HOUR_START = 6;
const HOUR_END = 21;
const PX_PER_HOUR = 56;
const EVENT_TYPES = ["routine","meal","exercise","focus","class","social","work"];

const EMPTY_FORM = {
  title: "",
  event_type: "routine",
  start_time: "08:00",
  end_time: "09:00",
  location: "",
  description: "",
};

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getMonday(offsetWeeks = 0) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0,0,0,0);
  monday.setDate(now.getDate() - day + offsetWeeks * 7);
  return monday;
}

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.slice(0,5).split(":").map(Number);
  return h * 60 + m;
}

function minutesToPx(minutes) {
  return ((minutes - HOUR_START * 60) / 60) * PX_PER_HOUR;
}

function nowLinePx() {
  const now = new Date();
  return minutesToPx(now.getHours() * 60 + now.getMinutes());
}

// ── Create/Edit Modal ─────────────────────────────────────────────────────────
function EventModal({ initial, onSave, onCancel, saving, title: modalTitle }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(10,10,15,0.88)",
        display: "flex", alignItems: "flex-end",
        backdropFilter: "blur(4px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          width: "100%",
          background: T.surface,
          borderRadius: "20px 20px 0 0",
          border: `1px solid ${T.border}`,
          borderBottom: "none",
          padding: "20px 20px 0 20px",
          paddingBottom: 44,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>{modalTitle}</div>
          <button
            onClick={onCancel}
            style={{
              background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999,
              width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: T.textMuted,
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Title */}
        <input
          value={form.title}
          onChange={e => set("title", e.target.value)}
          placeholder="Event title"
          autoFocus
          style={{
            background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10,
            padding: "11px 14px", fontSize: 15, color: T.text, outline: "none",
            fontFamily: T.fontFamily, width: "100%", boxSizing: "border-box",
            letterSpacing: -0.2,
          }}
        />

        {/* Category pills */}
        <div>
          <div style={{ fontSize: 10, color: T.textDim, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>Category</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {EVENT_TYPES.map(t => (
              <button
                key={t}
                onClick={() => set("event_type", t)}
                style={{
                  padding: "5px 12px", borderRadius: 9999, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: 0.2,
                  background: form.event_type === t ? catColors[t] : T.elevated,
                  color: form.event_type === t ? "#0A0A0F" : T.textMuted,
                  border: form.event_type === t ? "none" : `1px solid ${T.border}`,
                  textTransform: "capitalize",
                  transition: "all 0.12s",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Times */}
        <div style={{ display: "flex", gap: 10 }}>
          {[["start_time","Start"],["end_time","End"]].map(([k, lbl]) => (
            <div key={k} style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 6, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>{lbl}</div>
              <input
                type="time"
                value={form[k]}
                onChange={e => set(k, e.target.value)}
                style={{
                  background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "9px 12px", fontSize: 14, color: T.text, outline: "none",
                  fontFamily: T.fontMono, width: "100%", boxSizing: "border-box",
                  colorScheme: "dark",
                }}
              />
            </div>
          ))}
        </div>

        {/* Location */}
        <div>
          <div style={{ fontSize: 10, color: T.textDim, marginBottom: 6, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Location</div>
          <input
            value={form.location}
            onChange={e => set("location", e.target.value)}
            placeholder="Optional"
            style={{
              background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: "9px 12px", fontSize: 13, color: T.text, outline: "none",
              fontFamily: T.fontFamily, width: "100%", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Notes */}
        <div>
          <div style={{ fontSize: 10, color: T.textDim, marginBottom: 6, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Notes</div>
          <input
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Optional"
            style={{
              background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: "9px 12px", fontSize: 13, color: T.text, outline: "none",
              fontFamily: T.fontFamily, width: "100%", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Color preview strip */}
        <div style={{
          height: 3, borderRadius: 9999,
          background: catColors[form.event_type] || T.textMuted,
          opacity: 0.6,
        }} />

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 2, paddingBottom: 4 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "12px", borderRadius: 12, background: T.elevated,
              border: `1px solid ${T.border}`, color: T.textMuted, fontSize: 14,
              fontWeight: 500, cursor: "pointer", fontFamily: T.fontFamily,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => form.title.trim() && onSave(form)}
            disabled={saving || !form.title.trim()}
            style={{
              flex: 2, padding: "12px", borderRadius: 12,
              background: saving || !form.title.trim() ? T.elevated : T.teal,
              border: "none", color: saving || !form.title.trim() ? T.textDim : "#0A0A0F",
              fontSize: 14, fontWeight: 700, cursor: saving || !form.title.trim() ? "default" : "pointer",
              fontFamily: T.fontFamily, transition: "all 0.15s",
            }}
          >
            {saving ? "Saving…" : "Save event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Event card on timeline ─────────────────────────────────────────────────────
function EventCard({ event, onEdit, onDelete }) {
  const startMin = timeToMinutes(event.start_time);
  const endMin = timeToMinutes(event.end_time || event.start_time) + 30;
  const top = minutesToPx(startMin);
  const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 34);
  const color = catColors[event.event_type] || T.textMuted;
  const [pressed, setPressed] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 52,
        right: 6,
        height,
        background: `${color}12`,
        border: `1px solid ${color}28`,
        borderLeft: `2.5px solid ${color}`,
        borderRadius: 8,
        padding: "5px 8px 4px",
        cursor: "pointer",
        overflow: "hidden",
        opacity: pressed ? 0.65 : 1,
        transition: "opacity 0.1s",
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, height: "100%" }}>
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
            {event.title}
          </div>
          <div style={{ fontSize: 9, color: T.textMuted, fontFamily: T.fontMono }}>
            {event.start_time?.slice(0,5)}{event.end_time ? `–${event.end_time.slice(0,5)}` : ""}
          </div>
          {event.location && height > 50 && (
            <div style={{ fontSize: 9, color: T.textDim, display: "flex", alignItems: "center", gap: 2, marginTop: 1 }}>
              <Icon name="location" size={8} color={T.textDim} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.location}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 1, flexShrink: 0, marginTop: -1 }}>
          <button
            onClick={e => { e.stopPropagation(); onEdit(event); }}
            style={{ background: "none", border: "none", padding: "2px 3px", cursor: "pointer", color: T.textDim, borderRadius: 4 }}
          >
            <Icon name="edit" size={10} color={T.textDim} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(event.id); }}
            style={{ background: "none", border: "none", padding: "2px 3px", cursor: "pointer", color: T.textDim, borderRadius: 4 }}
          >
            <Icon name="trash" size={10} color={T.textDim} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SchedulePage({ profile, onProfile }) {
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [weekOffset, setWeekOffset] = useState(0);
  const currentWeekMonday = getMonday(weekOffset);
  const [selectedDay, setSelectedDay] = useState(todayIdx);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState({ connected: false });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [nowPx, setNowPx] = useState(nowLinePx());
  const nowLineRef = useRef(null);

  const selectedDate = new Date(currentWeekMonday);
  selectedDate.setDate(currentWeekMonday.getDate() + selectedDay);
  const selectedDateISO = toISODate(selectedDate);

  const weekEnd = new Date(currentWeekMonday);
  weekEnd.setDate(currentWeekMonday.getDate() + 6);
  const weekRangeLabel =
    currentWeekMonday.getMonth() === weekEnd.getMonth()
      ? `${MONTHS[currentWeekMonday.getMonth()]} ${currentWeekMonday.getDate()}–${weekEnd.getDate()}`
      : `${currentWeekMonday.getDate()} ${MONTHS[currentWeekMonday.getMonth()]} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]}`;

  const dayLabel = DAYS[selectedDay];
  const dayNum = selectedDate.getDate();
  const monthStr = MONTHS[selectedDate.getMonth()];

  useEffect(() => {
    const id = setInterval(() => setNowPx(nowLinePx()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (nowLineRef.current) {
      nowLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await scheduleAPI.getAll(selectedDay, selectedDateISO);
        setEvents(data.events || []);
      } catch {
        setEvents([]);
      }
      setLoading(false);
    }
    load();
  }, [selectedDay, selectedDateISO]);

  useEffect(() => {
    async function loadGoogleStatus() {
      try {
        const status = await scheduleAPI.googleStatus();
        setGoogleStatus(status);
      } catch {
        setGoogleStatus({ connected: false });
      }
    }
    loadGoogleStatus();
  }, []);

  async function refreshEvents() {
    try {
      const data = await scheduleAPI.getAll(selectedDay, selectedDateISO);
      setEvents(data.events || []);
    } catch {}
  }

  async function connectGoogle() {
    setGoogleLoading(true);
    try {
      const native = isNativePlatform();
      const { auth_url } = await authAPI.getGoogleConnectUrl(getGoogleOAuthOrigin(), native);
      await runGoogleAuthFlow(auth_url, "connect");
      const status = await scheduleAPI.googleStatus();
      setGoogleStatus(status);
    } catch (e) {
      showToast(e.message || "Failed to connect Google Calendar", "error");
    }
    setGoogleLoading(false);
  }

  async function syncGoogle() {
    setGoogleSyncing(true);
    try {
      await scheduleAPI.googleSync(1, 30);
      const status = await scheduleAPI.googleStatus();
      setGoogleStatus(status);
      await refreshEvents();
    } catch (e) {
      showToast(e.message || "Sync failed", "error");
    }
    setGoogleSyncing(false);
  }

  async function handleCreate(form) {
    setSaving(true);
    try {
      const created = await scheduleAPI.create({
        title: form.title,
        event_type: form.event_type,
        day_of_week: selectedDay,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location || null,
        description: form.description || null,
        event_data: {},
      });
      setEvents(prev => [...prev, created].sort((a,b) => a.start_time.localeCompare(b.start_time)));
      setModal(null);
    } catch (e) { showToast(e.message, "error"); }
    setSaving(false);
  }

  async function handleEdit(form) {
    if (!modal?.event) return;
    setSaving(true);
    try {
      const updated = await scheduleAPI.update(modal.event.id, {
        title: form.title,
        event_type: form.event_type,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location || null,
        description: form.description || null,
        event_data: {},
      });
      setEvents(prev =>
        prev.map(e => e.id === modal.event.id ? { ...e, ...updated } : e)
          .sort((a,b) => a.start_time.localeCompare(b.start_time))
      );
      setModal(null);
    } catch (e) { showToast(e.message, "error"); }
    setSaving(false);
  }

  async function handleDelete(eventId) {
    try {
      await scheduleAPI.delete(eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (e) { showToast(e.message, "error"); }
  }

  const totalHours = HOUR_END - HOUR_START;
  const railHeight = totalHours * PX_PER_HOUR;
  const isToday = weekOffset === 0 && selectedDay === todayIdx;
  const showNow = isToday && nowPx >= 0 && nowPx <= railHeight;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg }}>
      {/* Page header */}
      <PageHeader
        title="Schedule"
        subtitle={`${dayLabel}, ${monthStr} ${dayNum} · ${weekRangeLabel}`}
        profile={profile}
        onProfile={onProfile}
        trailing={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* Week nav */}
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              style={{
                background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999,
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: T.textMuted,
              }}
            >
              <Icon name="chev-left" size={13} />
            </button>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              style={{
                background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999,
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: T.textMuted,
              }}
            >
              <Icon name="chev-right" size={13} />
            </button>
            {/* Google chip */}
            {googleStatus.connected ? (
              <Chip active={false} onClick={syncGoogle} size="sm">
                <Icon name="google" size={11} color={googleSyncing ? T.textDim : T.teal} />
                {googleSyncing ? "Syncing…" : "Sync"}
              </Chip>
            ) : (
              <Chip active={false} onClick={connectGoogle} size="sm">
                <Icon name="google" size={11} color={T.textMuted} />
                {googleLoading ? "…" : "Connect"}
              </Chip>
            )}
          </div>
        }
      />

      {/* Day pill row */}
      <div style={{
        padding: "0 16px 14px",
        display: "flex",
        gap: 5,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {DAYS.map((d, i) => {
          const dayDate = new Date(currentWeekMonday);
          dayDate.setDate(currentWeekMonday.getDate() + i);
          const num = dayDate.getDate();
          const isSelected = selectedDay === i;
          const isTodayPill = weekOffset === 0 && i === todayIdx;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(i)}
              style={{
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "8px 0",
                borderRadius: 14,
                gap: 4,
                cursor: "pointer",
                width: 44,
                background: isSelected ? T.teal : "transparent",
                border: isTodayPill && !isSelected
                  ? `1.5px solid ${T.teal}`
                  : isSelected
                    ? "none"
                    : `1px solid ${T.border}`,
                transition: "all 0.15s",
              }}
            >
              <span style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: isSelected ? "#0A0A0F" : isTodayPill ? T.teal : T.textDim,
                textTransform: "uppercase",
              }}>
                {d}
              </span>
              <span style={{
                fontSize: 15,
                fontWeight: 700,
                lineHeight: 1,
                color: isSelected ? "#0A0A0F" : T.text,
                fontFamily: T.fontMono,
              }}>
                {num}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <PageScroll padBottom={80}>
        {loading ? (
          <LoadingDots />
        ) : (
          <div style={{ position: "relative", margin: "0 12px", paddingTop: 4, paddingBottom: 32 }}>
            {/* Rail: hour lines + labels */}
            {Array.from({ length: totalHours + 1 }, (_, i) => {
              const hour = HOUR_START + i;
              const y = 8 + i * PX_PER_HOUR;
              return (
                <div
                  key={hour}
                  style={{ position: "absolute", top: y, left: 0, right: 0, display: "flex", alignItems: "center", pointerEvents: "none" }}
                >
                  <span style={{
                    width: 44,
                    flexShrink: 0,
                    fontSize: 9,
                    color: T.textDim,
                    fontFamily: T.fontMono,
                    textAlign: "right",
                    paddingRight: 8,
                    lineHeight: 1,
                    userSelect: "none",
                  }}>
                    {String(hour).padStart(2,"0")}:00
                  </span>
                  <div style={{ flex: 1, height: "0.5px", background: T.border }} />
                </div>
              );
            })}

            {/* Rail container */}
            <div style={{ position: "relative", height: railHeight + 40, marginTop: 8 }}>
              {/* Now line */}
              {showNow && (
                <div
                  ref={nowLineRef}
                  style={{
                    position: "absolute",
                    top: nowPx,
                    left: 44,
                    right: 0,
                    display: "flex",
                    alignItems: "center",
                    zIndex: 10,
                    pointerEvents: "none",
                  }}
                >
                  <div style={{
                    width: 9,
                    height: 9,
                    borderRadius: 9999,
                    background: T.teal,
                    flexShrink: 0,
                    marginLeft: -4,
                    boxShadow: `0 0 8px ${T.teal}99`,
                  }} />
                  <div style={{ flex: 1, height: 1.5, background: `linear-gradient(90deg, ${T.teal}, ${T.teal}00)`, opacity: 0.85 }} />
                </div>
              )}

              {/* Empty state */}
              {events.length === 0 && (
                <div style={{
                  position: "absolute",
                  left: 52,
                  right: 0,
                  top: "30%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <Icon name="calendar" size={28} color={T.textDim} />
                  <div style={{ fontSize: 13, color: T.textDim, fontWeight: 500 }}>No events — tap + to add</div>
                </div>
              )}

              {/* Events */}
              {events.map(ev => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  onEdit={ev => setModal({ mode: "edit", event: ev })}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}
      </PageScroll>

      {/* FAB */}
      <Fab
        onClick={() => setModal({ mode: "create" })}
        icon="plus"
        color={T.teal}
        bottom={100}
        right={20}
      />

      {/* Modal */}
      {modal && (
        modal.mode === "create" ? (
          <EventModal
            title="New event"
            initial={EMPTY_FORM}
            onSave={handleCreate}
            onCancel={() => setModal(null)}
            saving={saving}
          />
        ) : (
          <EventModal
            title="Edit event"
            initial={{
              title: modal.event.title,
              event_type: modal.event.event_type,
              start_time: modal.event.start_time?.slice(0,5) || "08:00",
              end_time: modal.event.end_time?.slice(0,5) || "09:00",
              location: modal.event.location || "",
              description: modal.event.description || "",
            }}
            onSave={handleEdit}
            onCancel={() => setModal(null)}
            saving={saving}
          />
        )
      )}
    </div>
  );
}
