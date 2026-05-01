const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080";

export async function findUserByEmail(email: string) {
  // Finding user by email directly is not supported via frontend API.
  // The backend handles user existence checks during registration and login.
  return null;
}

export async function createUser(email: string, password: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 400 && data.detail === "User already exists") {
        throw new Error("UserExists");
    }
    throw new Error(data.detail || "Signup failed");
  }

  return await res.json();
}

export async function validateUser(email: string, password: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    return null;
  }

  return await res.json();
}
