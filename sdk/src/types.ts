/**
 * Type definitions for aerofoil client SDK and wire protocol contracts.
 * Matches docs/CONTRACTS.md §1 and crates/common/bindings/.
 */

export type AddressType = "Icao" | "Anonymous" | "GroundVehicle" | "GroundObstacle";
export type TransponderSource = "ModeS1090" | "Uat978";
export type ReceptionSource = "Direct" | "Adsr" | "Tisb";
export type AltitudeKind = "Barometric" | "Geometric";

export interface Velocity {
  ground_speed_knots: number | null;
  heading: number | null;
  vertical_rate_fpm: number | null;
}

export interface Position {
  latitude: number;
  longitude: number;
}

export interface Altitude {
  feet: number;
  kind: AltitudeKind;
}

export interface AircraftTarget {
  address_type: AddressType;
  address: number;
  callsign: [number, number, number, number, number, number, number, number] | null;
  position: Position | null;
  altitude: Altitude | null;
  velocity: Velocity;
  squawk: number | null;
  emitter_category: number | null;
  nic: number | null;
  source: TransponderSource;
  reception: ReceptionSource;
  last_seen_ms: number;
}

/**
 * Egress wire representation conforming to docs/CONTRACTS.md §1 (`aerofoil.target`).
 */
export interface TargetWire {
  schema: string;
  version: number;
  address: string;
  address_type: string;
  callsign?: string;
  altitude?: number;
  altitude_kind?: string;
  ground_speed?: number;
  ground_speed_knots?: number;
  heading?: number;
  heading_degrees?: number;
  vertical_rate_fpm?: number;
  squawk?: string;
  lat?: number;
  latitude?: number;
  lon?: number;
  longitude?: number;
  source: string;
  reception?: string;
  emitter_category?: number;
  nic?: number;
  last_seen_ms: number;
}

export interface SubscriptionFilter {
  min_alt?: number;
  max_alt?: number;
  squawk?: string;
  callsign?: string;
}

export interface AerofoilClientOptions {
  /** Server URL (e.g. "http://127.0.0.1:8080" or "ws://127.0.0.1:8080") */
  url: string;
  /** Base reconnection interval in milliseconds (default: 1000) */
  reconnectIntervalMs?: number;
  /** Maximum reconnection backoff in milliseconds (default: 10000) */
  maxReconnectIntervalMs?: number;
}
