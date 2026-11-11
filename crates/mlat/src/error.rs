//! Typed errors for Multilateration (MLAT) solving and receiver synchronization.

use core::fmt;

/// Errors returned by receiver registration and TDOA solving algorithms.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MlatError {
    /// TDOA hyperbolic multilateration requires at least 4 non-coplanar receivers.
    InsufficientReceivers {
        /// Number of receivers required for 3D solution (4).
        required: usize,
        /// Number of synchronized observations provided.
        provided: usize,
    },
    /// Specified receiver identifier is missing from the geodetic registry.
    ReceiverNotFound {
        /// Unregistered receiver numeric ID.
        receiver_id: u32,
    },
    /// Linear system of equations is collinear or singular (GDOP undefined).
    SingularMatrix,
    /// Non-linear optimization failed to converge within maximum iteration limit.
    NoConvergence {
        /// Number of iterations executed before divergence rejection.
        iterations: usize,
    },
    /// Geometric Dilution of Precision (GDOP) exceeds acceptable confidence ceiling.
    GeometricDilutionTooHigh {
        /// Computed GDOP value.
        gdop: f64,
    },
    /// Computed 3D position has physically impossible altitude (< -500m or > 30,000m).
    UnrealisticAltitude {
        /// Calculated altitude in meters.
        altitude_m: f64,
    },
}

impl fmt::Display for MlatError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InsufficientReceivers { required, provided } => {
                write!(
                    f,
                    "insufficient receivers for 3D MLAT: need {required}, got {provided}"
                )
            }
            Self::ReceiverNotFound { receiver_id } => {
                write!(
                    f,
                    "receiver ID {receiver_id} not found in geodetic registry"
                )
            }
            Self::SingularMatrix => write!(f, "singular or ill-conditioned geometry matrix"),
            Self::NoConvergence { iterations } => {
                write!(
                    f,
                    "TDOA solver failed to converge after {iterations} iterations"
                )
            }
            Self::GeometricDilutionTooHigh { gdop } => {
                write!(f, "GDOP {gdop:.2} exceeds confidence threshold")
            }
            Self::UnrealisticAltitude { altitude_m } => {
                write!(f, "unrealistic altitude {altitude_m:.1}m rejected")
            }
        }
    }
}

impl core::error::Error for MlatError {}
