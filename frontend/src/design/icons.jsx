// Phosphor-style outlined icons at 20px. Consistent 1.6px stroke.
export function Icon({ name, size = 20, color = "currentColor", strokeWidth = 1.6, style = {} }) {
  const p = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" };
  const v = { width: size, height: size, viewBox: "0 0 24 24", style };
  switch (name) {
    case "calendar":   return <svg {...v}><rect x="3.5" y="5" width="17" height="15" rx="2" {...p}/><path d="M3.5 10h17M8 3v4M16 3v4" {...p}/></svg>;
    case "meal":       return <svg {...v}><path d="M5 3v8a3 3 0 003 3v7M8 3v8M19 3c-1.5 0-3 2-3 6s1.5 5 3 5v7" {...p}/></svg>;
    case "workout":    return <svg {...v}><path d="M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8M2 11v2M22 11v2" {...p}/></svg>;
    case "budget":     return <svg {...v}><rect x="2.5" y="6" width="19" height="13" rx="2" {...p}/><path d="M2.5 10h19" {...p}/><circle cx="17" cy="15" r="1.2" fill={color} stroke="none"/></svg>;
    case "pantry":     return <svg {...v}><path d="M4 8c0-3 3.5-5 8-5s8 2 8 5M4 8v11a1 1 0 001 1h14a1 1 0 001-1V8M4 8h16M9 12h6" {...p}/></svg>;
    case "analytics":  return <svg {...v}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...p}/></svg>;
    case "chat":       return <svg {...v}><path d="M21 12a8 8 0 01-11.6 7.2L4 20l.8-5.4A8 8 0 1121 12z" {...p}/><path d="M9 11h.01M12 11h.01M15 11h.01" {...p} strokeWidth="2.2"/></svg>;
    case "profile":    return <svg {...v}><circle cx="12" cy="8" r="4" {...p}/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...p}/></svg>;
    case "plus":       return <svg {...v}><path d="M12 5v14M5 12h14" {...p} strokeWidth="2"/></svg>;
    case "minus":      return <svg {...v}><path d="M5 12h14" {...p} strokeWidth="2"/></svg>;
    case "chev-right": return <svg {...v}><path d="M9 5l7 7-7 7" {...p}/></svg>;
    case "chev-left":  return <svg {...v}><path d="M15 5l-7 7 7 7" {...p}/></svg>;
    case "chev-down":  return <svg {...v}><path d="M5 9l7 7 7-7" {...p}/></svg>;
    case "chev-up":    return <svg {...v}><path d="M5 15l7-7 7 7" {...p}/></svg>;
    case "search":     return <svg {...v}><circle cx="11" cy="11" r="6.5" {...p}/><path d="M16 16l4.5 4.5" {...p}/></svg>;
    case "mic":        return <svg {...v}><rect x="9" y="3" width="6" height="12" rx="3" {...p}/><path d="M5 11a7 7 0 0014 0M12 18v3" {...p}/></svg>;
    case "send":       return <svg {...v}><path d="M4 12l17-8-6 18-3-8-8-2z" {...p}/></svg>;
    case "sparkle":    return <svg {...v}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" {...p}/></svg>;
    case "paperclip":  return <svg {...v}><path d="M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7" {...p}/></svg>;
    case "check":      return <svg {...v}><path d="M5 12l5 5 9-11" {...p} strokeWidth="2"/></svg>;
    case "clock":      return <svg {...v}><circle cx="12" cy="12" r="8.5" {...p}/><path d="M12 7v5l3 2" {...p}/></svg>;
    case "fire":       return <svg {...v}><path d="M12 21c-4 0-7-3-7-7 0-3 2-5 3-7 .5 1.5 1.5 2 2.5 2 0-4 1.5-6 4-8 0 3 2 4 3 7 1 2 1.5 4 1.5 6 0 4-3 7-7 7z" {...p}/></svg>;
    case "trend-up":   return <svg {...v}><path d="M3 17l6-6 4 4 8-9M14 6h7v7" {...p}/></svg>;
    case "dumbbell":   return <svg {...v}><path d="M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8" {...p}/></svg>;
    case "run":        return <svg {...v}><circle cx="14" cy="4" r="2" {...p}/><path d="M9 20l2-5-3-2 2-5 4 2 3 3 3 1M5 12l3-1" {...p}/></svg>;
    case "bike":       return <svg {...v}><circle cx="5.5" cy="17" r="3.5" {...p}/><circle cx="18.5" cy="17" r="3.5" {...p}/><path d="M6 17l5-9h4l2 4M14 8h3" {...p}/></svg>;
    case "heart":      return <svg {...v}><path d="M12 20s-7-4-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 6-7 10-7 10z" {...p}/></svg>;
    case "flame":      return <svg {...v}><path d="M12 21c-4 0-7-3-7-7 0-4 4-5 4-11 2 2 5 4 5 8 1-1 2-2 2-4 2 2 3 4 3 7 0 4-3 7-7 7z" {...p}/></svg>;
    case "settings":   return <svg {...v}><circle cx="12" cy="12" r="3" {...p}/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.6 1.6 0 001.8.3 1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8 1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z" {...p}/></svg>;
    case "bell":       return <svg {...v}><path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 21a2 2 0 004 0" {...p}/></svg>;
    case "edit":       return <svg {...v}><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" {...p}/></svg>;
    case "trash":      return <svg {...v}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" {...p}/></svg>;
    case "google":     return <svg {...v}><path d="M21 12h-9v3.5h5a5 5 0 11-1.5-6" {...p}/></svg>;
    case "history":    return <svg {...v}><path d="M3 12a9 9 0 109-9 9 9 0 00-6 2.3L3 8M3 3v5h5M12 7v5l3.5 2" {...p}/></svg>;
    case "menu":       return <svg {...v}><path d="M4 7h16M4 12h16M4 17h16" {...p} strokeWidth="2"/></svg>;
    case "location":   return <svg {...v}><path d="M12 21c-5-6-8-9-8-13a8 8 0 0116 0c0 4-3 7-8 13z" {...p}/><circle cx="12" cy="8" r="2.5" {...p}/></svg>;
    case "pill":       return <svg {...v}><rect x="3" y="8" width="18" height="8" rx="4" {...p}/><path d="M12 8v8" {...p}/></svg>;
    case "bolt":       return <svg {...v}><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" {...p}/></svg>;
    case "x":         return <svg {...v}><path d="M6 6l12 12M18 6l-12 12" {...p} strokeWidth="2"/></svg>;
    case "filter":     return <svg {...v}><path d="M3 5h18l-7 9v6l-4-2v-4L3 5z" {...p}/></svg>;
    case "leaf":       return <svg {...v}><path d="M4 20c0-8 6-14 16-14 0 10-6 16-14 16l-2-2zM4 20l10-10" {...p}/></svg>;
    case "mug":        return <svg {...v}><path d="M4 6h12v9a5 5 0 01-5 5H9a5 5 0 01-5-5V6zM16 9h2a3 3 0 010 6h-2" {...p}/></svg>;
    case "logout":     return <svg {...v}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" {...p}/></svg>;
    case "shield":     return <svg {...v}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...p}/></svg>;
    case "camera":     return <svg {...v}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" {...p}/><circle cx="12" cy="13" r="4" {...p}/></svg>;
    case "copy":       return <svg {...v}><rect x="9" y="9" width="13" height="13" rx="2" {...p}/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" {...p}/></svg>;
    default:           return <svg {...v}><circle cx="12" cy="12" r="8" {...p}/></svg>;
  }
}
