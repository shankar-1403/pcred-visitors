"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

/*
 * Staff sign in once and stay signed in — there is no session expiry.
 *
 * This app exists to alert someone that a visitor is at their door. An
 * automatic sign-out would silently stop those alerts, and silence is
 * indistinguishable from "no visitors today" — so a well-meaning timeout would
 * be the most dangerous kind of failure here. Signing out is a deliberate act,
 * via the Sign out button.
 */

export interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Without Firebase config there is nothing to wait for, so the app shows the
  // setup notice immediately rather than spinning forever.
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);

      // Everything the app needs is on the auth record itself. The staff
      // directory is matched by email, so there is no profile node to read.
      setProfile(
        firebaseUser
          ? {
              uid: firebaseUser.uid,
              email: firebaseUser.email ?? undefined,
              displayName:
                firebaseUser.displayName ?? firebaseUser.email ?? undefined,
            }
          : null
      );

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({ user, profile, loading, login, logout }),
    [user, profile, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
