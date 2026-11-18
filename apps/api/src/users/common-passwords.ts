// STUDY_CONTEXT §8 setting 5 (block common passwords). A short built-in list of passwords that
// meet the 15-character minimum but are widely used. The leaked-password check (an outside
// breach database) is not built.
const COMMON = [
  "passwordpassword",
  "password12345678",
  "123456789012345",
  "1234567890123456",
  "qwertyuiopasdfgh",
  "qwertyuiop123456",
  "iloveyou12345678",
  "administrator123",
  "welcome123456789",
  "letmein123456789",
  "abcdefghijklmnop",
  "aaaaaaaaaaaaaaaa",
  "changemechangeme",
  "passwordpassword1",
  "password1234567890",
  "qwerty123456789",
  "trustno1trustno1",
  "monkeymonkeymonkey",
  "dragondragondragon",
  "football12345678",
];

/** True when the password is on the list, or is one character repeated, or contains "password". */
export function isCommonPassword(pw: string): boolean {
  const p = pw.toLowerCase();
  return COMMON.includes(p) || /^(.)\1+$/.test(p) || p.includes("password");
}
