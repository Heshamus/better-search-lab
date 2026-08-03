export function isAllowed(email: string, allowlist: string[]): boolean {
  const e = email.trim().toLowerCase();
  return allowlist.some((a) => a.trim().toLowerCase() === e);
}
