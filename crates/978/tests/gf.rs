//! Galois Field $GF(2^8)$ arithmetic tests over polynomial `0x11D`.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use aerofoil_978::gf::{
    EXP_TABLE, LOG_TABLE, PRIMITIVE_POLYNOMIAL, gf_add, gf_div, gf_inv, gf_mul, gf_poly_eval,
    gf_pow, gf_sub,
};

#[test]
fn primitive_polynomial_is_0x11d() {
    assert_eq!(PRIMITIVE_POLYNOMIAL, 0x11D);
}

#[test]
fn table_properties_and_bijection() {
    assert_eq!(EXP_TABLE[0], 1);
    assert_eq!(EXP_TABLE[1], 2);
    assert_eq!(LOG_TABLE[1], 0);
    assert_eq!(LOG_TABLE[2], 1);

    for i in 0..255 {
        assert_eq!(EXP_TABLE[i], EXP_TABLE[i + 255]);
    }

    for x in 1..=255 {
        assert_eq!(EXP_TABLE[LOG_TABLE[x as usize] as usize], x);
    }
}

fn slow_gf_mul(mut a: u8, mut b: u8) -> u8 {
    let mut p = 0u8;
    while b > 0 {
        if (b & 1) != 0 {
            p ^= a;
        }
        let hi = a & 0x80;
        a <<= 1;
        if hi != 0 {
            a ^= (PRIMITIVE_POLYNOMIAL & 0xFF) as u8;
        }
        b >>= 1;
    }
    p
}

#[test]
fn exhaustive_multiplication_all_65536_pairs() {
    for a in 0..=255 {
        for b in 0..=255 {
            let actual = gf_mul(a, b);
            let expected = slow_gf_mul(a, b);
            assert_eq!(
                actual, expected,
                "Multiplication mismatch for {a} * {b}: actual={actual}, expected={expected}"
            );
            assert_eq!(
                gf_mul(a, b),
                gf_mul(b, a),
                "Multiplication must be commutative"
            );
            if b == 1 {
                assert_eq!(gf_mul(a, 1), a);
            }
            if b == 0 {
                assert_eq!(gf_mul(a, 0), 0);
            }
        }
    }
}

#[test]
fn exhaustive_inversion_and_division() {
    assert!(gf_inv(0).is_none());
    assert!(gf_div(1, 0).is_none());

    for a in 1..=255 {
        let inv = gf_inv(a).unwrap();
        assert_eq!(gf_mul(a, inv), 1, "a * inv(a) must equal 1 for a={a}");

        for b in 1..=255 {
            let prod = gf_mul(a, b);
            let div = gf_div(prod, b).unwrap();
            assert_eq!(div, a, "(a * b) / b must equal a for a={a}, b={b}");
        }
    }
}

#[test]
fn addition_and_subtraction_are_xor() {
    for a in 0..=255 {
        for b in 0..=255 {
            assert_eq!(gf_add(a, b), a ^ b);
            assert_eq!(gf_sub(a, b), a ^ b);
            assert_eq!(gf_add(a, a), 0);
        }
    }
}

#[test]
fn powers() {
    assert_eq!(gf_pow(0, 5), 0);
    assert_eq!(gf_pow(10, 0), 1);
    assert_eq!(gf_pow(7, 1), 7);
    assert_eq!(gf_pow(7, 2), gf_mul(7, 7));
    assert_eq!(gf_pow(7, 3), gf_mul(gf_mul(7, 7), 7));
    assert_eq!(gf_pow(2, 255), 1);
}

#[test]
fn polynomial_evaluation() {
    // P(x) = 3x^2 + 5x + 7
    let poly = [3, 5, 7];
    // P(0) = 7
    assert_eq!(gf_poly_eval(&poly, 0), 7);
    // P(1) = 3(1) ^ 5(1) ^ 7 = 3 ^ 5 ^ 7 = 1
    assert_eq!(gf_poly_eval(&poly, 1), 3 ^ 5 ^ 7);
    // P(2) = 3*(4) ^ 5*(2) ^ 7
    let expected = gf_add(gf_add(gf_mul(3, 4), gf_mul(5, 2)), 7);
    assert_eq!(gf_poly_eval(&poly, 2), expected);
}
