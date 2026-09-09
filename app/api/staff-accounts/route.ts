import { NextResponse } from "next/server";
import { adminAuth, adminDb, HAS_ADMIN_CONFIG, isAdminUid } from "@/src/lib/firebase-admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

/**
 * Creates a staff login, or resets one that already exists. Admins only.
 *
 * The caller's own token is verified here rather than trusting anything the
 * browser says about itself — an admin-only button is not an admin-only route.
 *
 * Deliberately one action rather than two: from the admin's side, "set a
 * password for this email" reads the same whether the account already exists
 * or not — most often because an earlier attempt to create it failed (this
 * route used to return a 501 without the Admin SDK configured, which quietly
 * left several people with a staff record but no way to sign in).
 */
export async function POST(request: Request) {
  try {
    if (!HAS_ADMIN_CONFIG) {
      return NextResponse.json(
        {
          error:
            "Account creation isn't configured yet. Add the Firebase Admin credentials to .env.local.",
        },
        { status: 501 }
      );
    }

    const authorization = request.headers.get("authorization") ?? "";
    const idToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!idToken) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const caller = await adminAuth().verifyIdToken(idToken);

    if (!(await isAdminUid(caller.uid))) {
      return NextResponse.json(
        { error: "Only an admin can manage staff logins." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
      role?: string;
    };

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? "").trim().slice(0, 120);

    // Undefined, not defaulted to "staff": resetting a password for someone
    // whose access level the admin never touched must not silently demote
    // them if they happen to already be an admin.
    const role =
      body.role === "admin" || body.role === "staff" || body.role === "reception"
        ? body.role
        : undefined;

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD} characters.` },
        { status: 400 }
      );
    }

    let uid: string;
    let created: boolean;

    try {
      const user = await adminAuth().createUser({
        email,
        password,
        displayName: displayName || undefined,
      });
      uid = user.uid;
      created = true;
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;

      if (code !== "auth/email-already-exists") {
        throw error;
      }

      // The login already exists — set the new password on it instead of
      // failing. This is the path that turns "their account never got
      // created" into a one-click fix rather than a trip to the console.
      const existing = await adminAuth().getUserByEmail(email);
      uid = existing.uid;

      await adminAuth().updateUser(uid, {
        password,
        ...(displayName ? { displayName } : {}),
      });
      created = false;
    }

    // The role record is keyed by uid because that is what the database rules
    // can check — the staff directory is matched separately, by email. A
    // brand-new login always gets an explicit role; resetting an existing one
    // only touches `role` if the admin actually chose to change it — the key
    // is omitted entirely otherwise (the Admin SDK rejects a literal
    // `undefined` value, and omitting is also the correct way to leave a
    // field untouched under `update()`).
    await adminDb()
      .ref(`users/${uid}`)
      .update({
        email,
        ...(role || created ? { role: role ?? "staff" } : {}),
        ...(created
          ? { createdAt: Date.now(), createdBy: caller.uid }
          : { updatedAt: Date.now(), updatedBy: caller.uid }),
      });

    return NextResponse.json({ uid, email, role, created });
  } catch (error) {
    console.error("[visitor-app] staff-accounts", error);
    return NextResponse.json(
      { error: "Could not save that login." },
      { status: 500 }
    );
  }
}
