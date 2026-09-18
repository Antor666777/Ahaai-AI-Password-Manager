import { describe, expect, it } from "vitest";
import { generatePassword } from "./crypto";

const ALPHABET = /^[a-zA-Z2-9!@#$%^&*\-_=+]+$/;
const HAS_SYMBOL = /[!@#$%^&*\-_=+]/;

describe("generatePassword", () => {
  it("honours the requested length", () => {
    expect(generatePassword(32)).toHaveLength(32);
    expect(generatePassword(4)).toHaveLength(4);
  });

  it("only uses the intended alphabet", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generatePassword(24)).toMatch(ALPHABET);
    }
  });

  it("always draws at least one character from every class", () => {
    // Drawing every position from the whole alphabet can miss a class
    // entirely, which happened often enough at 20 characters to matter.
    for (let i = 0; i < 200; i += 1) {
      const password = generatePassword(20);
      expect(password, `missing lowercase: ${password}`).toMatch(/[a-z]/);
      expect(password, `missing uppercase: ${password}`).toMatch(/[A-Z]/);
      expect(password, `missing digit: ${password}`).toMatch(/[2-9]/);
      expect(password, `missing symbol: ${password}`).toMatch(HAS_SYMBOL);
    }
  });

  it("does not leave the guaranteed classes in a fixed order", () => {
    // Without a shuffle every password would start lower, upper, digit, symbol.
    const openings = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      openings.add(generatePassword(20).slice(0, 4));
    }
    expect(openings.size).toBeGreaterThan(1);
  });
});
