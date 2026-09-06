import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "./users";

// The two credential shapes every auth route validates. They were copied into
// four routes (setup/admin, users, users/[id], account/password), so a change
// to the email rule or the minimum length had four places to miss — and the
// error text a person reads differed by which route they happened to hit.
// One definition, one message, everywhere.

/**
 * Trimmed, must look like an address. Deliberately the same permissive check
 * the routes already shipped rather than a stricter one: the authority on a
 * usable address is whether mail reaches it, and tightening this here would
 * silently lock out addresses that already have accounts.
 */
export const EmailSchema = z
  .string()
  .trim()
  .refine((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), "must be an email address");

/** Length only — the users library enforces the same floor again on write. */
export const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
