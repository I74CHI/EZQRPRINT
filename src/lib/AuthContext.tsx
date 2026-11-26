import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type OwnerUser } from "./api";

interface AuthContextValue {
  user: OwnerUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<OwnerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const { user: currentUser } = await api.me();
      setUser(currentUser);
      setError(null);
    } catch (authError) {
      setUser(null);
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to check the sign-in session.",
      );
      throw authError;
    }
  }

  useEffect(() => {
    let active = true;
    api.me().then(({ user: currentUser }) => {
      if (!active) return;
      setUser(currentUser);
      setError(null);
      setLoading(false);
    }).catch((authError: unknown) => {
      if (!active) return;
      setError(authError instanceof Error ? authError.message : "Unable to check the sign-in session.");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
