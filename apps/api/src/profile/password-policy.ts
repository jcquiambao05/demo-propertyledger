import { isCommonPassword } from "../users/common-passwords.js";

export const MIN_USER_PASSWORD = 8;
export const MAX_USER_PASSWORD = 128;

/**
 * Validates user-initiated password changes and local password recovery:
 * - Minimum 8 characters (up to 128)
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 * - Not in the common-passwords denylist
 */
export function validatePasswordPolicy(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < MIN_USER_PASSWORD || pw.length > MAX_USER_PASSWORD) {
    return `Password must be between ${MIN_USER_PASSWORD} and ${MAX_USER_PASSWORD} characters.`;
  }
  if (!/[A-Z]/.test(pw)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(pw)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(pw)) {
    return "Password must include at least one number.";
  }
  if (!/[^A-Za-z0-9]/.test(pw)) {
    return "Password must include at least one special character.";
  }
  if (isCommonPassword(pw)) {
    return "This password is too common. Choose a stronger password.";
  }
  return null;
}
