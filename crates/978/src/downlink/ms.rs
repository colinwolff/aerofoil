//! UAT Mode Status (MS) bitfield parsing (payload bytes 17..29).

use aerofoil_common::Squawk;

use super::types::ModeStatus;

const BASE40_ALPHABET: &[u8; 40] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ   .";

/// Parses the Mode Status element (payload bytes 17..29).
#[must_use]
pub fn parse_mode_status(payload: &[u8; 34]) -> ModeStatus {
    let v1 = ((payload[17] as u16) << 8) | (payload[18] as u16);
    let v2 = ((payload[19] as u16) << 8) | (payload[20] as u16);
    let v3 = ((payload[21] as u16) << 8) | (payload[22] as u16);

    let emitter_category = ((v1 / 1600) % 40) as u8;
    let uat_version = (payload[23] >> 2) & 0x07;
    let emergency_status = (payload[23] >> 5) & 0x07;
    let sil = payload[23] & 0x03;
    let nac_p = (payload[25] >> 4) & 0x0f;

    let csid = (payload[26] >> 1) & 0x01;
    let (callsign, squawk) = if csid == 1 {
        let mut cs = [b' '; 8];
        cs[0] = BASE40_ALPHABET[((v1 / 40) % 40) as usize];
        cs[1] = BASE40_ALPHABET[(v1 % 40) as usize];
        cs[2] = BASE40_ALPHABET[((v2 / 1600) % 40) as usize];
        cs[3] = BASE40_ALPHABET[((v2 / 40) % 40) as usize];
        cs[4] = BASE40_ALPHABET[(v2 % 40) as usize];
        cs[5] = BASE40_ALPHABET[((v3 / 1600) % 40) as usize];
        cs[6] = BASE40_ALPHABET[((v3 / 40) % 40) as usize];
        cs[7] = BASE40_ALPHABET[(v3 % 40) as usize];
        (Some(cs), None)
    } else if uat_version >= 2 {
        let sq_a = (v1 / 40) % 40;
        let sq_b = v1 % 40;
        let sq_c = (v2 / 1600) % 40;
        let sq_d = (v2 / 40) % 40;
        let squawk = if sq_a <= 7 && sq_b <= 7 && sq_c <= 7 && sq_d <= 7 {
            Squawk::new((sq_a << 9) | (sq_b << 6) | (sq_c << 3) | sq_d)
        } else {
            None
        };
        (None, squawk)
    } else {
        (None, None)
    };

    ModeStatus {
        emitter_category,
        callsign,
        squawk,
        emergency_status,
        uat_version,
        sil,
        nac_p,
    }
}
