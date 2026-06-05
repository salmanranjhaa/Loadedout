import { useState, useRef, useEffect } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";

export default function VoiceInput({ onTranscript }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const rec = new SpeechRecognition();
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
  }, [onTranscript]);

  const toggle = () => {
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
