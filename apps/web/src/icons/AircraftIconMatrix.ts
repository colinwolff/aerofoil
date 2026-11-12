//! Permissive Clean-Room 12-Class SVG Aircraft Icon Matrix
//! Commercially permissive (MIT / Apache-2.0). Zero external proprietary assets.

export type AircraftCategory =
  | "LightPiston"
  | "TwinTurboprop"
  | "RegionalJet"
  | "Narrowbody"
  | "Widebody"
  | "SuperJumbo"
  | "Fighter"
  | "Rotorcraft"
  | "Glider"
  | "Drone"
  | "GroundVehicle"
  | "Unknown";

export type AirframeCategory = AircraftCategory;

export function getAltitudeColor(altitudeFt?: number, emergency: boolean = false): string {
  if (emergency) {
    return "#ef4444"; // Red alert glow
  }
  if (altitudeFt == null || altitudeFt <= 500) {
    return "#a3e635"; // Ground / Low (Lime)
  }
  if (altitudeFt < 10_000) {
    return "#38bdf8"; // Low/Medium (Sky Cyan)
  }
  if (altitudeFt < 25_000) {
    return "#818cf8"; // Mid En-route (Indigo)
  }
  if (altitudeFt < 38_000) {
    return "#c084fc"; // High Cruise (Purple)
  }
  return "#f472b6"; // Stratospheric / FL400+ (Pink Magenta)
}

export function classifyAirframe(
  callsign?: string,
  altitudeFt?: number,
  speedKts?: number,
): AircraftCategory {
  const cs = (callsign || "").toUpperCase();

  if (cs.startsWith("MEDIC") || cs.startsWith("RESCUE") || cs.startsWith("HELI") || cs.startsWith("LIFE")) {
    return "Rotorcraft";
  }
  if (cs.startsWith("UAV") || cs.startsWith("DRONE") || cs.startsWith("SCAN")) {
    return "Drone";
  }
  if (cs.startsWith("GLID") || cs.startsWith("SOAR")) {
    return "Glider";
  }
  if (altitudeFt != null && altitudeFt <= 50 && (speedKts == null || speedKts < 35)) {
    return "GroundVehicle";
  }
  if (speedKts != null && speedKts > 550) {
    return "Fighter";
  }
  if (cs.startsWith("BAW") || cs.startsWith("UAE") || cs.startsWith("SIA") || cs.startsWith("QFA") || cs.startsWith("AFR")) {
    return "Widebody";
  }
  if (cs.startsWith("KLM") || cs.startsWith("TRA") || cs.startsWith("DLH") || cs.startsWith("EZY") || cs.startsWith("RYR") || cs.startsWith("AAL") || cs.startsWith("UAL")) {
    return "Narrowbody";
  }
  if (speedKts != null && speedKts < 140 && altitudeFt != null && altitudeFt < 10000) {
    return "LightPiston";
  }
  if (speedKts != null && speedKts < 260 && altitudeFt != null && altitudeFt < 20000) {
    return "TwinTurboprop";
  }
  if (altitudeFt != null && altitudeFt > 20000) {
    return "Narrowbody";
  }
  return "Unknown";
}

// 12 Clean-room SVG path definitions centered on [16, 16] with 32x32 viewbox
const SVG_PATHS: Record<AircraftCategory, string> = {
  // Light single-engine piston (straight wings, tractor prop)
  LightPiston:
    '<path d="M15 3h2v7h12v3h-12v12h4v2h-10v-2h4v-12h-12v-3h12z"/>',

  // Twin turboprop (swept-taper wings with twin engine nacelles)
  TwinTurboprop:
    '<path d="M15 2h2v8h4v-1h2v4h-2v-1h-4v8h5v2h-12v-2h5v-8h-4v1h-2v-4h2v1h4v-8zM7 11h2v3h-2zM23 11h2v3h-2z"/>',

  // Regional jet (T-tail with rear fuselage mounted twin jet engines)
  RegionalJet:
    '<path d="M15 2h2v10h11v2h-11v8h2v2h-2v2h5v1h-12v-1h5v-2h-2v-2h2v-8h-11v-2h11zM13 20h-2v3h2zM19 20h2v3h-2z"/>',

  // Narrowbody airliner (e.g. B737/A320, swept wings with 2 underwing turbofans)
  Narrowbody:
    '<path d="M16 2l1.5 8 11.5 5.5v2.5l-12-3.5v9l4 3v2l-5-1.5-5 1.5v-2l4-3v-9l-12 3.5v-2.5l11.5-5.5zM10 15h1.5v2.5h-1.5zM20.5 15h1.5v2.5h-1.5z"/>',

  // Widebody airliner (e.g. B777/A350, broad swept wings and wide fuselage)
  Widebody:
    '<path d="M16 1l2 9 12 5.5v3l-13-3v9.5l4.5 3.5v2l-5.5-1.5-5.5 1.5v-2l4.5-3.5v-9.5l-13 3v-3l12-5.5zM9 16h2v3h-2zM21 16h2v3h-2z"/>',

  // Super Jumbo quad-jet (e.g. A380/B747, 4 underwing turbofans, massive span)
  SuperJumbo:
    '<path d="M16 1l2.2 9 13.8 6v3l-15-3.5v9.5l5 4v2l-6-1.5-6 1.5v-2l5-4v-9.5l-15 3.5v-3l13.8-6zM6 16.5h1.8v2.5h-1.8zM10 16.5h1.8v2.5h-1.8zM20.2 16.5h1.8v2.5h-1.8zM24.2 16.5h1.8v2.5h-1.8z"/>',

  // Military Fighter Jet (delta wing, twin canted stabilizers)
  Fighter:
    '<path d="M16 2l1.5 9 10.5 10v2l-10-3v4l3 3v1h-8v-1l3-3v-4l-10 3v-2l10.5-10z"/>',

  // Rotorcraft (fuselage with main rotor blade disk and tail rotor)
  Rotorcraft:
    '<path d="M15 7h2v6h3l-1 8h-4v6h2v1h-6v-1h2v-6h-4l-1-8h3zM3 7h26v2h-26zM22 28h2v3h-2z"/>',

  // Sailplane / Glider (ultra high aspect ratio wings, slender needle fuselage)
  Glider:
    '<path d="M15 3h2v9h14v1h-14v14h4v1h-10v-1h4v-14h-14v-1h14z"/>',

  // Drone / Tactical UAV (fuselage with quad/reaper planform)
  Drone:
    '<path d="M15 5h2v6l7-4v2l-6 5v6l5 3v1h-16v-1l5-3v-6l-6-5v-2l7 4zM6 7a2 2 0 1 0 0.1 0zM26 7a2 2 0 1 0 0.1 0zM6 23a2 2 0 1 0 0.1 0zM26 23a2 2 0 1 0 0.1 0z"/>',

  // Airport ground vehicle (tug, follow-me car)
  GroundVehicle:
    '<path d="M11 6h10v5h2v14h-3v-2h-8v2h-3v-14h2zM13 14h6v4h-6zM15 8h2v2h-2z"/>',

  // Modernized aerodynamic chevron marker (Unknown fallback)
  Unknown:
    '<path d="M16 3l11 23-11-6-11 6z"/>',
};

export function getSvgPathForCategory(category: AircraftCategory): string {
  return SVG_PATHS[category] || SVG_PATHS.Unknown;
}

export function renderAircraftSvg(
  category: AircraftCategory,
  headingDeg: number = 0,
  altitudeFt?: number,
  emergency: boolean = false,
): string {
  const color = getAltitudeColor(altitudeFt, emergency);
  const path = SVG_PATHS[category] || SVG_PATHS.Unknown;
  const pulseClass = emergency ? "class=\"emergency-pulse\"" : "";
  const roundedHeading = Math.round(headingDeg);

  return `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${roundedHeading}deg); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">
    <g fill="${color}" stroke="#0b1120" stroke-width="0.75" ${pulseClass}>
      ${path}
    </g>
  </svg>`;
}
