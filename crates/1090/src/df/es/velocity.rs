use aerofoil_common::{DecodeError, Heading};

/// The speed and heading payload of an airborne velocity squitter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VelocityPayload {
    /// Ground speed decoded from east-west and north-south velocity components.
    GroundSpeed {
        /// East-west velocity component in knots (positive is east, negative is west).
        ew_velocity_knots: Option<i16>,
        /// North-south velocity component in knots (positive is north, negative is south).
        ns_velocity_knots: Option<i16>,
        /// Whether the supersonic multiplier (4x) was used.
        supersonic: bool,
    },
    /// Airspeed and magnetic/true heading.
    Airspeed {
        /// Magnetic or true heading if available.
        heading: Option<Heading>,
        /// Airspeed in knots.
        airspeed_knots: Option<u16>,
        /// `true` for True Airspeed (TAS), `false` for Indicated Airspeed (IAS).
        is_true_airspeed: bool,
        /// Whether the supersonic multiplier (4x) was used.
        supersonic: bool,
    },
}

impl VelocityPayload {
    /// Computes the resultant ground speed in knots if both components are present.
    #[must_use]
    pub fn ground_speed_knots(&self) -> Option<u16> {
        match *self {
            Self::GroundSpeed {
                ew_velocity_knots,
                ns_velocity_knots,
                ..
            } => {
                let (Some(ew), Some(ns)) = (ew_velocity_knots, ns_velocity_knots) else {
                    return None;
                };
                let ew32 = (ew as i32) * (ew as i32);
                let ns32 = (ns as i32) * (ns as i32);
                Some(((ew32 + ns32) as u32).isqrt() as u16)
            }
            Self::Airspeed { .. } => None,
        }
    }
}

/// Source of the vertical rate measurement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerticalRateSource {
    /// Barometric pressure sensor.
    Barometric,
    /// GNSS / geometric altitude sensor.
    Geometric,
}

/// Airborne velocity message (DF17 / DF18 Type Code 19, Subtypes 1..=4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AirborneVelocity {
    /// Subtype: 1 = GS normal, 2 = GS supersonic, 3 = Airspeed normal, 4 = Airspeed supersonic.
    pub subtype: u8,
    /// Intent change flag.
    pub intent_change: bool,
    /// IFR capability flag.
    pub ifr_capability: bool,
    /// Navigation accuracy category for velocity (0..=4).
    pub nac_v: u8,
    /// The decoded speed and heading or component velocity.
    pub payload: VelocityPayload,
    /// Vertical rate in feet per minute (positive = climb, negative = descent).
    pub vertical_rate_fpm: Option<i16>,
    /// Sensor source for the vertical rate.
    pub vertical_rate_source: VerticalRateSource,
    /// Difference between GNSS height and barometric altitude in feet (None if unavailable).
    pub geo_minus_baro_ft: Option<i16>,
}

/// Decodes an Airborne Velocity message (TC 19) from the 7-byte ME payload.
pub fn decode_airborne_velocity(me: &[u8; 7]) -> Result<AirborneVelocity, DecodeError> {
    let tc = me[0] >> 3;
    if tc != 19 {
        return Err(DecodeError::InvalidField {
            field: "type_code",
            value: tc as u32,
        });
    }
    let subtype = me[0] & 0x07;
    if !(1..=4).contains(&subtype) {
        return Err(DecodeError::InvalidField {
            field: "subtype",
            value: subtype as u32,
        });
    }

    let intent_change = (me[1] & 0x80) != 0;
    let ifr_capability = (me[1] & 0x40) != 0;
    let nac_v = (me[1] >> 3) & 0x07;

    let supersonic = (subtype == 2) || (subtype == 4);
    let resolution: i16 = if supersonic { 4 } else { 1 };

    let payload = if subtype == 1 || subtype == 2 {
        let ew_sign = (me[1] & 0x04) != 0;
        let ew_raw = (((me[1] as u16) & 0x03) << 8) | (me[2] as u16);
        let ew_velocity_knots = if ew_raw > 0 {
            let mag = ((ew_raw - 1) as i16) * resolution;
            Some(if ew_sign { -mag } else { mag })
        } else {
            None
        };

        let ns_sign = (me[3] & 0x80) != 0;
        let ns_raw = (((me[3] as u16) & 0x7F) << 3) | ((me[4] as u16) >> 5);
        let ns_velocity_knots = if ns_raw > 0 {
            let mag = ((ns_raw - 1) as i16) * resolution;
            Some(if ns_sign { -mag } else { mag })
        } else {
            None
        };

        VelocityPayload::GroundSpeed {
            ew_velocity_knots,
            ns_velocity_knots,
            supersonic,
        }
    } else {
        let hdg_status = (me[1] & 0x04) != 0;
        let hdg_raw = (((me[1] as u16) & 0x03) << 8) | (me[2] as u16);
        let heading = if hdg_status && hdg_raw < 1024 {
            // Convert from 10-bit fraction of 360° to 1/128° units: (hdg_raw * 360 / 1024) * 128 = hdg_raw * 45
            Heading::from_raw_128ths(hdg_raw * 45)
        } else {
            None
        };

        let is_true_airspeed = (me[3] & 0x80) != 0;
        let as_raw = (((me[3] as u16) & 0x7F) << 3) | ((me[4] as u16) >> 5);
        let airspeed_knots = if as_raw > 0 {
            Some((as_raw - 1) * (resolution as u16))
        } else {
            None
        };

        VelocityPayload::Airspeed {
            heading,
            airspeed_knots,
            is_true_airspeed,
            supersonic,
        }
    };

    let vr_source = if (me[4] & 0x10) != 0 {
        VerticalRateSource::Barometric
    } else {
        VerticalRateSource::Geometric
    };
    let vr_down = (me[4] & 0x08) != 0;
    let vr_raw = (((me[4] as u16) & 0x07) << 6) | ((me[5] as u16) >> 2);
    let vertical_rate_fpm = if vr_raw > 0 {
        let mag = ((vr_raw - 1) as i16) * 64;
        Some(if vr_down { -mag } else { mag })
    } else {
        None
    };

    let diff_down = (me[6] & 0x80) != 0;
    let diff_raw = me[6] & 0x7F;
    let geo_minus_baro_ft = if diff_raw > 0 {
        let mag = ((diff_raw - 1) as i16) * 25;
        Some(if diff_down { -mag } else { mag })
    } else {
        None
    };

    Ok(AirborneVelocity {
        subtype,
        intent_change,
        ifr_capability,
        nac_v,
        payload,
        vertical_rate_fpm,
        vertical_rate_source: vr_source,
        geo_minus_baro_ft,
    })
}
