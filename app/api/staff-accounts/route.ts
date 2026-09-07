import { NextResponse } from "next/server";
import { adminAuth, adminDb, HAS_ADMIN_CONFIG, isAdminUid } from "@/src/lib/firebase-admin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

/**
 * Creates a staff login. Admins only.
 *
 * The caller's own token is verified here rather than trusting anything the
 * browser says about itself — an admin-only button is not an admin-only route.
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
        { error: "Only an admin can create staff logins." },
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
    const role = body.role === "admin" ? "admin" : "staff";

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

    try {
      const created = await adminAuth().createUser({
        email,
        password,
        displayName: displayName || undefined,
      });
      uid = created.uid;
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;

      if (code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "There is already a login for that email address." },
          { status: 409 }
        );
      }

      throw error;
    }

    // The role record is keyed by uid because that is what the database rules
    // can check — the staff directory is matched separately, by email.
    await adminDb().ref(`users/${uid}`).set({
      role,
      email,
      createdAt: Date.now(),
      createdBy: caller.uid,
    });

    return NextResponse.json({ uid, email, role });
  } catch (error) {
    console.error("[visitor-app] staff-accounts", error);
    return NextResponse.json(
      { error: "Could not create that login." },
      { status: 500 }
    );
  }
}
