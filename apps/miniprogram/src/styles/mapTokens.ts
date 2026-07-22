// Native map overlays require 8-digit hex colors instead of CSS rgba values.
export const mapNativeColors = {
  unlitFill: "#d4d8d124",
  unlitStroke: "#6f746f70",
  litFill: "#e8b8c270",
  litStroke: "#c75c5cf2",
  route: "#c75c5cdd",
  routeBorder: "#ffffffb8",
  calloutText: "#222827",
  calloutBorder: "#dedbd4",
  calloutBackground: "#fffdf9",
  futureText: "#8f5f26",
  futureBorder: "#c99756",
  futureBackground: "#fff8ea",
} as const;

export const mapNativeMetrics = {
  provinceStrokeWidth: 2,
  routeWidth: 4,
  routeBorderWidth: 2,
  coupleMarkerWidth: 48,
  coupleMarkerHeight: 48,
  futureMarkerWidth: 28,
  futureMarkerHeight: 28,
  calloutFontSize: 12,
  calloutPadding: 8,
  calloutRadius: 4,
} as const;
