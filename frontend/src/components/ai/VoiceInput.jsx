import { useState, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";

// Voice dictation for the chat composer.
// • Web browsers: Web Speech API (webkitSpeechRecognition).
// • Native APK/iOS (WebView has no Web Speech API): the device speech
//   recognizer via @capacitor-community/speech-recognition.
export default function VoiceInput({ onTranscript }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);
  const native = (() => { try { return !!Capacitor?.isNativePlatform?.(); } catch { return false; } })();

  useEffect(() => {
    if (native) {
      // Probe the native recognizer; hide the button only if truly unavailable.
      (async () => {
        try {
          const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
          const res = await SpeechRecognition.available();
          setSupported(!!(res?.available ?? true));
        } catch {
          setSupported(false);
        }
      })();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onTranscript?.(transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, [onTranscript, native]);

  async function toggleNative() {
    try {
      const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
      if (listening) {
        await SpeechRecognition.stop().catch(() => {});
        setListening(false);
        return;
      }
      const perm = await SpeechRecognition.checkPermissions().catch(() => null);
      if (!perm || perm.speechRecognition !== "granted") {
        const req = await SpeechRecognition.requestPermissions().catch(() => null);
        if (!req || req.speechRecognition !== "granted") { setListening(false); return; }
      }
      setListening(true);
      // popup:false → silent in-app recognition; resolves with final matches.
      const res = await SpeechRecognition.start({
        language: "en-US", maxResults: 1, partialResults: false, popup: false,
      });
      const text = res?.matches?.[0];
      if (text) onTranscript?.(text);
      setListening(false);
    } catch {
      setListening(false);
    }
  }

  const toggle = () => {
    if (native) { toggleNative(); return; }
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  if (!supported) return null;

  return (
    <button
      onClick={toggle}
      style={{
        width: 36,
        height: 36,
        borderRadius: 9999,
        background: listening ? T.negative + "33" : T.elevated,
        border: `1px solid ${listening ? T.negative : T.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        animation: listening ? "lo-pulse 1.5s ease-in-out infinite" : undefined,
      }}
    >
      <Icon name="mic" size={16} color={listening ? T.negative : T.textMuted} />
    </button>
  );
}
