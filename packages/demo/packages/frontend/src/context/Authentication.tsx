import React, { createContext, useEffect, useState, ReactNode, useCallback } from "react";
import { app, Realm } from "../api/client";
import { useNavigate } from "react-router-dom";
import { APP_ROUTES } from "../appRoutes";

export interface AuthenticationContextType {
  user: Realm.User | null;
  login: (email: string, password: string) => Promise<Realm.User>;
  logout: () => Promise<void>;
  isLoggedIn: boolean;
}

export const AuthenticationContext = createContext<AuthenticationContextType | undefined>(undefined);

interface AuthenticationProviderProps {
  children: ReactNode;
}

export const AuthenticationProvider: React.FC<AuthenticationProviderProps> = ({ children }) => {
  const [user, setUser] = useState<Realm.User | null>(app.currentUser);
  const navigate = useNavigate()

  const login = useCallback(async (email: string, password: string): Promise<Realm.User> => {
    const credentials = Realm.Credentials.emailPassword(email, password);
    const loggedInUser = await app.logIn(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (user) {
      await app.currentUser?.logOut();
      setUser(null);
      navigate(APP_ROUTES.INDEX)
    }
  }, [navigate, user]);


  const loadUser = useCallback(async () => {
    const user = app.currentUser
    try {
      await user?.refreshAccessToken();
    } catch (err) {
      console.warn("Invalid token", err);
      await app.currentUser?.logOut();
    }
    finally {
      setUser(app.currentUser);
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser]);

  const value: AuthenticationContextType = {
    user,
    login,
    logout,
    isLoggedIn: !!user,
  };

  return <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>;
};

