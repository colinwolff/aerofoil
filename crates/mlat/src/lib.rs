//! Multilateration (MLAT) receiver registry and TDOA hyperbolic solver for `aerofoil`.
//!
//! Provides geodetic coordinate transformations ([`coords`]), receiver station management
//! ([`registry`]), and an algebraic closed-form Bancroft TDOA hyperboloid solver ([`solver`]).
//!
//! Panic-free, zero allocation on the solve hot path.

mod coords;
mod error;
mod matrix;
mod registry;
mod solver;

pub use coords::{
    EcefCoord, SPEED_OF_LIGHT, WGS84_A, WGS84_B, WGS84_E2, ecef_to_geodetic, geodetic_to_ecef,
};
pub use error::MlatError;
pub use registry::{MAX_RECEIVERS, ReceiverRegistry, ReceiverStation};
pub use solver::{MlatSolution, TdoaObservation, solve_tdoa};
