//! Compact Position Reporting (CPR) algorithms and tables (RTCA DO-260B §2.2.3.2.5).

mod global;
mod nl;

pub use global::{
    CPR_MODULUS, CprError, MAX_PAIR_AGE_MS, RawCpr, decode_airborne_cpr_raw, decode_cpr_global,
};
pub use nl::{
    DLAT_EVEN_DEGREES, DLAT_EVEN_MICRODEGREES, DLAT_ODD_DEGREES, LATITUDE_ZONES_EVEN,
    LATITUDE_ZONES_ODD, NL_TRANSITION_TABLE, cpr_n, cpr_nl, cpr_nl_from_microdegrees, dlon_degrees,
};
