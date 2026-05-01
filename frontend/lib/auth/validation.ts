export const AUTH_PASSWORD_MIN_LENGTH = 8;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return emailRegex.test(normalizeEmail(email));
}

export function validateLoginInput(email: string, password: string): string | null {
  if (!email || !password) return "Email and password are required.";
  if (!isValidEmail(email)) return "Please enter a valid email address.";

  return null;
}

export function validateNewCredentialsInput(email: string, password: string): string | null {
  const loginValidationError = validateLoginInput(email, password);
  if (loginValidationError) return loginValidationError;
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters long.`;
  }

  return null;
}

export function validateSignupInput(email: string, password: string, confirmPassword: string): string | null {
  const baseValidationError = validateNewCredentialsInput(email, password);
  if (baseValidationError) return baseValidationError;
  if (password !== confirmPassword) return "Passwords do not match.";

  return null;
}
