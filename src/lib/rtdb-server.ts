/**
 * Realtime Database access for server routes, over the plain REST API.
 *
 * Deliberately not the Admin SDK: that needs a service account, which this
 * deployment may not have configured. Every call here instead carries the
 * caller's own ID token as `auth=`, so the request is evaluated against the
 * published database rules under that person's identity — exactly as if the
 * client SDK had made it. A request with no token is a genuinely anonymous
 * read, allowed only where the rules say `.read: true` (the kiosk's own
 * lookups).
 */

const RTDB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

function withAuth(path: string, idToken?: string) {
  if (!RTDB_URL) throw new Error("Firebase database URL not configured.");

  const url = new URL(`${RTDB_URL}/${path}.json`);
  if (idToken) url.searchParams.set("auth", idToken);

  return url.toString();
}

export async function rtdbGet<T>(path: string, idToken?: string): Promise<T | null> {
  const response = await fetch(withAuth(path, idToken), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`RTDB read failed (${response.status}): ${path}`);
  }

  return (await response.json()) as T | null;
}

export async function rtdbSet(
  path: string,
  data: unknown,
  idToken?: string
): Promise<void> {
  const response = await fetch(withAuth(path, idToken), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RTDB write failed (${response.status}): ${path} ${text}`);
  }
}

/** Writes a new child under `path` with a generated key, and returns that key. */
export async function rtdbPush(
  path: string,
  data: unknown,
  idToken?: string
): Promise<string> {
  const response = await fetch(withAuth(path, idToken), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RTDB push failed (${response.status}): ${path} ${text}`);
  }

  const { name } = (await response.json()) as { name?: string };
  if (!name) throw new Error(`RTDB push returned no key for ${path}`);

  return name;
}

/** Verifies a Firebase ID token and returns the signed-in person's uid + email. */
export async function verifyIdToken(
  idToken: string
): Promise<{ uid: string; email: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("Firebase API key is not configured.");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) throw new Error("NOT_SIGNED_IN");

  const data = (await response.json()) as {
    users?: { localId?: string; email?: string }[];
  };

  const uid = data.users?.[0]?.localId;
  const email = data.users?.[0]?.email?.trim().toLowerCase();

  if (!uid || !email) throw new Error("NOT_SIGNED_IN");

  return { uid, email };
}

/** Bearer token from an Authorization header, or throws NOT_SIGNED_IN. */
export function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) throw new Error("NOT_SIGNED_IN");

  return token;
}

/** The staffId whose directory record's email matches, or null. */
export async function resolveStaffId(email: string): Promise<string | null> {
  const staff = await rtdbGet<Record<string, { email?: string }>>("staff");

  const entry = Object.entries(staff ?? {}).find(
    ([, record]) => (record.email ?? "").trim().toLowerCase() === email
  );

  return entry?.[0] ?? null;
}
