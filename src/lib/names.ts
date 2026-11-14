/**
 * First name and surname are both mandatory (they drive the PDF employee ID).
 * Someone without a surname enters their first name in both fields — so when
 * the two match, the display name is just the first name, not "Asha Asha".
 */
export function displayName(firstName: string, surname: string): string {
  const f = firstName.trim();
  const s = surname.trim();
  if (!s || s.toLowerCase() === f.toLowerCase()) return f;
  return `${f} ${s}`;
}
