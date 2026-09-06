import { describe, it, expect } from "vitest";
import { EmailSchema, PasswordSchema } from "@/lib/auth/schemas";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/users";

describe("EmailSchema", () => {
  it("trims and accepts an address", () => {
    expect(EmailSchema.parse("  a@example.com  ")).toBe("a@example.com");
  });
  it("rejects anything that is not one, with one message", () => {
    for (const bad of ["", "nope", "a@b", "a b@example.com", "@example.com"]) {
      const r = EmailSchema.safeParse(bad);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe("must be an email address");
    }
  });
});

describe("PasswordSchema", () => {
  it("accepts a password at the minimum length", () => {
    expect(PasswordSchema.parse("x".repeat(MIN_PASSWORD_LENGTH))).toHaveLength(MIN_PASSWORD_LENGTH);
  });
  it("rejects a shorter one with the message the users library also throws", () => {
    const r = PasswordSchema.safeParse("x".repeat(MIN_PASSWORD_LENGTH - 1));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  });
});
