// Набор SVG-иконок (outline, stroke: currentColor, 24×24)

const svg = (inner, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const I = {
  home: svg('<path d="M3 10.2 12 3l9 7.2"/><path d="M5 8.8V20a1 1 0 0 0 1 1h4v-6.4h4V21h4a1 1 0 0 0 1-1V8.8"/>'),
  list: svg('<path d="M7 3h10a2 2 0 0 1 2 2v16l-3-1.8L13 21l-3-1.8L7 21l-2-1.2V5a2 2 0 0 1 2-2z"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/>'),
  chart: svg('<path d="M12 3a9 9 0 1 0 9 9h-9V3z"/><path d="M15.5 3.7A9 9 0 0 1 20.3 8.5L12 12l3.5-8.3z"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  cloud: svg('<path d="M17.5 18.5a4.5 4.5 0 0 0 .42-8.98 6 6 0 0 0-11.7 1.6A3.9 3.9 0 0 0 6.5 18.5h11z"/>'),
  cloudOff: svg('<path d="M17.5 18.5a4.5 4.5 0 0 0 .42-8.98 6 6 0 0 0-11.7 1.6A3.9 3.9 0 0 0 6.5 18.5h11z"/><path d="M4 4l16 16"/>'),
  cloudCheck: svg('<path d="M17.5 18.5a4.5 4.5 0 0 0 .42-8.98 6 6 0 0 0-11.7 1.6A3.9 3.9 0 0 0 6.5 18.5h11z"/><path d="m9.2 13.6 2 2 3.6-3.9"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  fwd: svg('<path d="M9 5l7 7-7 7"/>'),
  down: svg('<path d="M6 9.5l6 6 6-6"/>'),
  check: svg('<path d="M4.5 12.5l4.8 4.8L19.5 6.8"/>'),
  download: svg('<path d="M12 3v11.5m0 0 4.2-4.2M12 14.5 7.8 10.3"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/>'),
  pencil: svg('<path d="M14.5 5.5 18.5 9.5M4 20l1-4.5L16.2 4.3a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19 4 20z"/>'),
  trash: svg('<path d="M4.5 6.5h15M9.5 6V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V6M7 6.5l.8 12.6a2 2 0 0 0 2 1.9h4.4a2 2 0 0 0 2-1.9l.8-12.6"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M4 4l16 16"/><path d="M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6.1 8.1A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.8-.5"/>'),
  wallet: svg('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 9.5h18M16.5 14.5h1.5"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6M20 3.5V8h-4.5"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 1 1 8 0v2.5"/>'),
  logout: svg('<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 8l4 4-4 4M19 12H9"/>'),
  backup: svg('<path d="M12 21V10m0 0-4.2 4.2M12 10l4.2 4.2" transform="rotate(180 12 14)"/><rect x="4" y="3" width="16" height="5" rx="1.5"/>'),
  key: svg('<circle cx="8" cy="14" r="4.5"/><path d="M11.5 10.5 20 2m-3.5 3.5 2.5 2.5M13.5 8.5 16 11"/>'),
  users: svg('<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 20a6.5 6.5 0 0 1 12.4 0"/><path d="M16 5.6a3.5 3.5 0 0 1 0 5.8M18.5 20a6.5 6.5 0 0 0-3.2-5.3"/>'),
  tag: svg('<path d="M3.5 11.2V5A1.5 1.5 0 0 1 5 3.5h6.2a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0l-7.3-7.3a2 2 0 0 1-.6-1.4z"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/>'),
  spark: svg('<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z"/>'),
  doc: svg('<path d="M6 3.5h8L19 8.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M14 3.5V9h5"/>'),
  table: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9.5 9.5V19.5M3.5 14.5h17"/>'),
};
