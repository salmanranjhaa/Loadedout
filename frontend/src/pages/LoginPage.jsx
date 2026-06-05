import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  authAPI,
  getGoogleOAuthOrigin,
  googleNativeSignIn,
  isNativePlatform,
  runGoogleAuthFlow,
  setToken,
} from "../utils/api";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { Card, Button, Input } from "../design/components";

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        const data = await authAPI.register(username, email, password);
        setToken(data.access_token, data.refresh_token);
        onLogin();
      } else {
        const data = await authAPI.login(username, password);
        setToken(data.access_token, data.refresh_token);
        onLogin();
      }
    } catch (err) {
      setError(err.message || (mode === "signup" ? "Signup failed" : "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleAuth() {
    setError("");
    setGoogleLoading(true);
    try {
      const googleMode = mode === "signup" ? "signup" : "login";
      if (isNativePlatform()) {
        const { idToken } = await googleNativeSignIn();
        const data = await authAPI.googleIdToken(idToken, googleMode);
        setToken(data.access_token, data.refresh_token);
      } else {
        const { auth_url } = await authAPI.getGoogleLoginUrl(getGoogleOAuthOrigin(), false, googleMode);
        const payload = await runGoogleAuthFlow(auth_url, googleMode);
        if (!payload.access_token || !payload.refresh_token) throw new Error("Google auth did not return tokens");
        setToken(payload.access_token, payload.refresh_token);
      }
      onLogin();
    } catch (err) {
      setError(err.message || "Google authentication failed");
    } finally {
      setGoogleLoading(false);
    }
  }

  const canSubmit =
    mode === "signup"
      ? username && email && password && confirmPassword
      : username && password;

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setShowPassword(false);
    setShowConfirm(false);
  };

  const passwordToggle = (shown, toggle) => (
    <button
      type="button"
      onClick={() => toggle((v) => !v)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: T.textMuted,
        display: "flex",
        alignItems: "center",
        padding: 0,
        transition: "color 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
      onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
      tabIndex={-1}
    >
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: T.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        fontFamily: T.fontFamily,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background gradient orbs */}
      <div
        style={{
          position: "absolute",
          top: "-15%",
          left: "-15%",
          width: "60vw",
          height: "60vw",
          maxWidth: 700,
          maxHeight: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${T.violet}16 0%, transparent 70%)`,
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-15%",
          right: "-15%",
          width: "60vw",
          height: "60vw",
          maxWidth: 700,
          maxHeight: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${T.teal}12 0%, transparent 70%)`,
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 380,
          position: "relative",
          zIndex: 1,
          animation: "lo-fade-up 0.5s ease forwards",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 22,
              background: `linear-gradient(135deg, ${T.violet}, ${T.teal})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 18px",
              boxShadow: `0 16px 48px ${T.teal}33, 0 0 0 1px ${T.teal}22`,
              transition: "transform 0.3s ease, box-shadow 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow = `0 20px 56px ${T.teal}44, 0 0 0 1px ${T.teal}33`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = `0 16px 48px ${T.teal}33, 0 0 0 1px ${T.teal}22`;
            }}
          >
            <Icon name="bolt" size={30} color="#0A0A0F" strokeWidth={2} />
          </div>
          <h1 style={{ ...T.type.hero, color: T.text, marginBottom: 6 }}>Loadedout</h1>
          <p style={{ ...T.type.body, color: T.textMuted }}>Your personal lifestyle OS</p>
        </div>

        <Card style={{ padding: 28 }}>
          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              background: T.elevated,
              borderRadius: 14,
              padding: 4,
              marginBottom: 24,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 4,
                left: mode === "signin" ? 4 : "50%",
                width: "calc(50% - 4px)",
                height: "calc(100% - 8px)",
                background: T.elevated2,
                borderRadius: 12,
                transition: "left 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
                zIndex: 0,
              }}
            />
            {["signin", "signup"].map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 12,
                  border: "none",
                  background: "transparent",
                  color: mode === m ? T.text : T.textMuted,
                  fontSize: 13,
                  fontWeight: mode === m ? 600 : 500,
                  cursor: "pointer",
                  fontFamily: T.fontFamily,
                  transition: "color 0.2s ease",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <Input
              label={mode === "signin" ? "Username or Email" : "Username"}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={mode === "signin" ? "username or email" : "choose a username"}
              autoComplete="username"
            />

            <div
              style={{
                maxHeight: mode === "signup" ? 200 : 0,
                opacity: mode === "signup" ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.35s ease, opacity 0.25s ease",
              }}
            >
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              action={passwordToggle(showPassword, setShowPassword)}
            />

            <div
              style={{
                maxHeight: mode === "signup" ? 200 : 0,
                opacity: mode === "signup" ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.35s ease, opacity 0.25s ease",
              }}
            >
              <Input
                label="Confirm Password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                action={passwordToggle(showConfirm, setShowConfirm)}
              />
            </div>

            {error && (
              <div
                key={error}
                className="animate-shake"
                style={{
                  fontSize: 12,
                  color: T.negative,
                  textAlign: "center",
                  padding: "10px 14px",
                  background: `${T.negative}15`,
                  borderRadius: 10,
                  border: `1px solid ${T.negative}25`,
                  fontWeight: 500,
                  animation: "lo-fade-up 0.2s ease forwards, lo-shake 0.45s ease-in-out",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginTop: 4 }}>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={loading}
                disabled={!canSubmit}
              >
                {loading
                  ? mode === "signup"
                    ? "Creating account…"
                    : "Signing in…"
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </Button>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <div style={{ flex: 1, height: 1, background: T.border }} />
              <span style={{ fontSize: 11, color: T.textDim, fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: T.border }} />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="md"
              loading={googleLoading}
              disabled={googleLoading}
              onClick={handleGoogleAuth}
              icon={<Icon name="google" size={16} color={T.text} />}
            >
              {googleLoading ? "Connecting…" : "Continue with Google"}
            </Button>
          </form>
        </Card>

        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: T.textDim,
            marginTop: 24,
            fontFamily: T.fontMono,
          }}
        >
          Loadedout · v2.4.0
        </p>
      </div>
    </div>
  );
}
