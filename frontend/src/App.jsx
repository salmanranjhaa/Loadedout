import { useEffect, useState, useRef, Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { isLoggedIn, clearToken, userAPI } from "./utils/api";
import { initOfflineSync } from "./utils/offline";
import { T } from "./design/tokens";
import { Icon } from "./design/icons";
import LoginPage from "./pages/LoginPage";
import ProfileDrawer from "./pages/ProfileDrawer";
import FullProfilePage from "./pages/FullProfilePage";

const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const MealsPage = lazy(() => import("./pages/MealsPage"));
const WorkoutPage = lazy(() => import("./pages/WorkoutPage"));
const BudgetPage = lazy(() => import("./pages/BudgetPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

const PREFETCH_MAP = {
  "/schedule": () => import("./pages/SchedulePage"),
  "/meals": () => import("./pages/MealsPage"),
  "/workout": () => import("./pages/WorkoutPage"),
  "/budget": () => import("./pages/BudgetPage"),
  "/inventory": () => import("./pages/InventoryPage"),
  "/analytics": () => import("./pages/AnalyticsPage"),
  "/chat": () => import("./pages/ChatPage"),
};

function prefetchRoute(path) {
  const loader = PREFETCH_MAP[path];
  if (loader) loader();
}

const NAV_TABS = [
  { path: "/schedule",  icon: "calendar",  label: "Schedule" },
  { path: "/meals",     icon: "meal",      label: "Meals" },
  { path: "/workout",   icon: "workout",   label: "Workout" },
  { path: "/budget",    icon: "budget",    label: "Budget" },
  { path: "/inventory", icon: "pantry",    label: "Pantry" },
  { path: "/analytics", icon: "analytics", label: "Analytics" },
  { path: "/chat",      icon: "chat",      label: "AI" },
];

// Confetti easter egg
function Confetti({ show }) {
  if (!show) return null;
  const pieces = Array.from({ length: 28 });
  const colors = [T.teal, T.amber, T.violet, "#FF5C9E", "#5C8FFC"];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 9999 }}>
      {pieces.map((_, i) => {
        const left  = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const dur   = 1.4 + Math.random() * 0.8;
        const rot   = Math.random() * 720 - 360;
        const color = colors[i % colors.length];
        const size  = 6 + Math.random() * 6;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: -20,
              width: size,
              height: size * 0.4,
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

function PageFallback() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: T.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: T.textMuted,
        fontSize: 13,
        fontFamily: T.fontFamily,
      }}
    >
      Loading…
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn]         = useState(isLoggedIn());
  const [profile, setProfile]           = useState(null);
  const [profileLoading, setProfileLoading] = useState(!!isLoggedIn());
  const [showProfile, setShowProfile]   = useState(false);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [confetti, setConfetti]         = useState(false);
  const [notchTaps, setNotchTaps]       = useState(0);
  const tapTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!loggedIn) { setProfile(null); setProfileLoading(false); return; }
      setProfileLoading(true);
      try {
        const p = await userAPI.getProfile();
        if (!cancelled) setProfile(p);
      } catch (err) {
        // Only end the session on real auth failures — a flaky network or a
        // backend blip should never log the user out.
        if (err?.status === 401 || err?.status === 403) {
          clearToken();
          if (!cancelled) { setProfile(null); setLoggedIn(false); }
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    load();
    initOfflineSync();
    return () => { cancelled = true; };
  }, [loggedIn]);

  // 5-tap status bar easter egg
  function onStatusTap() {
    setNotchTaps((t) => {
      const next = t + 1;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => setNotchTaps(0), 800);
      if (next >= 5) {
        setConfetti(true);
        setTimeout(() => setConfetti(false), 2800);
        return 0;
      }
      return next;
    });
  }

  function handleLogout() {
    clearToken();
    setProfile(null);
    setLoggedIn(false);
  }

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;

  if (profileLoading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: T.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: T.textMuted,
          fontSize: 13,
          fontFamily: T.fontFamily,
        }}
      >
        Loading…
      </div>
    );
  }

  const isAdmin = (profile?.role || "user") === "admin";
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "LO";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: T.bg,
        color: T.text,
        fontFamily: T.fontFamily,
        display: "flex",
        flexDirection: "column",
        maxWidth: 430,
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* iOS-style status bar area */}
      <div
        onClick={onStatusTap}
        style={{
          height: "env(safe-area-inset-top, 44px)",
          minHeight: 44,
          background: T.bg,
          flexShrink: 0,
          cursor: "pointer",
        }}
      />

      {/* Page content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/schedule" replace />} />
            <Route path="/schedule"  element={<SchedulePage  profile={profile} onProfile={() => setShowProfile(true)} />} />
            <Route path="/meals"     element={<MealsPage     profile={profile} onProfile={() => setShowProfile(true)} />} />
            <Route path="/workout"   element={<WorkoutPage   profile={profile} onProfile={() => setShowProfile(true)} />} />
            <Route path="/budget"    element={<BudgetPage    profile={profile} onProfile={() => setShowProfile(true)} />} />
            <Route path="/inventory" element={<InventoryPage profile={profile} onProfile={() => setShowProfile(true)} />} />
            <Route path="/analytics" element={<AnalyticsPage profile={profile} onProfile={() => setShowProfile(true)} />} />
            <Route path="/chat"      element={<ChatPage      profile={profile} onProfile={() => setShowProfile(true)} />} />
            <Route
              path="/admin"
              element={isAdmin ? <AdminPage currentUser={profile} /> : <Navigate to="/schedule" replace />}
            />
          </Routes>
        </Suspense>
      </div>

      {/* Bottom tab bar */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          background: "rgba(10,10,15,0.88)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderTop: `0.5px solid ${T.border}`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 6px 6px" }}>
          {NAV_TABS.map(({ path, icon, label }) => (
            <NavLink
              key={path}
              to={path}
              onMouseEnter={() => prefetchRoute(path)}
              style={({ isActive }) => ({
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                flex: 1,
                padding: "6px 4px",
                color: isActive ? T.teal : T.textDim,
                textDecoration: "none",
                cursor: "pointer",
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon name={icon} size={22} strokeWidth={isActive ? 2 : 1.6} />
                  <span style={{ fontSize: 9.5, fontWeight: isActive ? 600 : 500, letterSpacing: 0.2 }}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Profile drawer overlay */}
      {showProfile && (
        <ProfileDrawer
          profile={profile}
          onClose={() => setShowProfile(false)}
          onLogout={handleLogout}
          onProfileUpdate={(p) => setProfile(p)}
          onFullProfile={() => { setShowProfile(false); setShowFullProfile(true); }}
        />
      )}

      {/* Full profile page */}
      {showFullProfile && (
        <FullProfilePage
          profile={profile}
          onClose={() => setShowFullProfile(false)}
          onLogout={handleLogout}
          onProfileUpdate={(p) => setProfile(p)}
        />
      )}

      <Confetti show={confetti} />
    </div>
  );
}
