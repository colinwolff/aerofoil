//! Telemetry update model and monotonic merging logic (`docs/SPEC.md` Invariant 10).

use aerofoil_common::{
    AddressType, AircraftTarget, Altitude, Heading, Position, ReceptionSource, Squawk,
    TransponderSource, Velocity,
};

/// An incremental telemetry update decoded from a surveillance transmission.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TargetUpdate {
    /// Transponder address type.
    pub address_type: AddressType,
    /// 24-bit target address.
    pub address: u32,
    /// Surveillance link protocol.
    pub source: TransponderSource,
    /// Reception provenance (Direct vs Rebroadcast).
    pub reception: ReceptionSource,
    /// Monotonic timestamp in milliseconds when update was received.
    pub timestamp_ms: u64,
    /// Flight identification / callsign bytes.
    pub callsign: Option<[u8; 8]>,
    /// Geographic position.
    pub position: Option<Position>,
    /// Barometric or geometric altitude.
    pub altitude: Option<Altitude>,
    /// Ground speed in whole knots.
    pub ground_speed_knots: Option<u16>,
    /// Direction of travel referenced to true north.
    pub heading: Option<Heading>,
    /// Vertical speed in feet per minute.
    pub vertical_rate_fpm: Option<i16>,
    /// 12-bit Mode A transponder squawk code.
    pub squawk: Option<Squawk>,
    /// Surveillance emitter category (0..=39).
    pub emitter_category: Option<u8>,
    /// Navigation Integrity Category (0..=15).
    pub nic: Option<u8>,
}

impl TargetUpdate {
    /// Constructs a basic target update with required routing attributes.
    #[must_use]
    pub const fn new(
        address_type: AddressType,
        address: u32,
        source: TransponderSource,
        reception: ReceptionSource,
        timestamp_ms: u64,
    ) -> Self {
        Self {
            address_type,
            address,
            source,
            reception,
            timestamp_ms,
            callsign: None,
            position: None,
            altitude: None,
            ground_speed_knots: None,
            heading: None,
            vertical_rate_fpm: None,
            squawk: None,
            emitter_category: None,
            nic: None,
        }
    }

    /// Disambiguated track key `(AddressType, u32)`.
    #[inline]
    #[must_use]
    pub const fn track_key(&self) -> (AddressType, u32) {
        (self.address_type, self.address)
    }

    /// Sets the flight identification callsign.
    #[must_use]
    pub const fn with_callsign(mut self, callsign: [u8; 8]) -> Self {
        self.callsign = Some(callsign);
        self
    }

    /// Sets the decoded geographic position.
    #[must_use]
    pub const fn with_position(mut self, position: Position) -> Self {
        self.position = Some(position);
        self
    }

    /// Sets the decoded altitude.
    #[must_use]
    pub const fn with_altitude(mut self, altitude: Altitude) -> Self {
        self.altitude = Some(altitude);
        self
    }

    /// Sets velocity components.
    #[must_use]
    pub const fn with_velocity(
        mut self,
        ground_speed_knots: Option<u16>,
        heading: Option<Heading>,
        vertical_rate_fpm: Option<i16>,
    ) -> Self {
        self.ground_speed_knots = ground_speed_knots;
        self.heading = heading;
        self.vertical_rate_fpm = vertical_rate_fpm;
        self
    }

    /// Sets Mode A identity squawk code.
    #[must_use]
    pub const fn with_squawk(mut self, squawk: Squawk) -> Self {
        self.squawk = Some(squawk);
        self
    }

    /// Sets emitter category.
    #[must_use]
    pub const fn with_emitter_category(mut self, category: u8) -> Self {
        self.emitter_category = Some(category);
        self
    }

    /// Sets Navigation Integrity Category.
    #[must_use]
    pub const fn with_nic(mut self, nic: u8) -> Self {
        self.nic = Some(nic);
        self
    }

    /// Converts this update into a brand new [`AircraftTarget`].
    #[must_use]
    pub fn to_target(&self) -> AircraftTarget {
        let mut target = AircraftTarget::new(
            self.address_type,
            self.address,
            self.source,
            self.reception,
            self.timestamp_ms,
        );
        target.callsign = self.callsign;
        target.position = self.position;
        target.altitude = self.altitude;
        target.velocity = Velocity::new(
            self.ground_speed_knots,
            self.heading,
            self.vertical_rate_fpm,
        );
        target.squawk = self.squawk;
        target.emitter_category = self.emitter_category;
        target.nic = self.nic;
        target
    }

    /// Applies monotonic per-field updates to an existing [`AircraftTarget`].
    ///
    /// Per `docs/SPEC.md` Invariant 10: a message that lacks a field never clears it.
    pub fn apply_to(&self, target: &mut AircraftTarget) {
        if let Some(cs) = self.callsign {
            target.callsign = Some(cs);
        }
        if let Some(pos) = self.position {
            target.position = Some(pos);
        }
        if let Some(alt) = self.altitude {
            target.altitude = Some(alt);
        }
        if let Some(speed) = self.ground_speed_knots {
            target.velocity.ground_speed_knots = Some(speed);
        }
        if let Some(hdg) = self.heading {
            target.velocity.heading = Some(hdg);
        }
        if let Some(rate) = self.vertical_rate_fpm {
            target.velocity.vertical_rate_fpm = Some(rate);
        }
        if let Some(sq) = self.squawk {
            target.squawk = Some(sq);
        }
        if let Some(ec) = self.emitter_category {
            target.emitter_category = Some(ec);
        }
        if let Some(n) = self.nic {
            target.nic = Some(n);
        }

        target.source = self.source;
        target.reception = self.reception;
        target.last_seen_ms = core::cmp::max(target.last_seen_ms, self.timestamp_ms);
    }
}
