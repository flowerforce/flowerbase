import { useContext } from "react";
import { AuthenticationContext, AuthenticationContextType } from "../context/Authentication";

export const useAuthentication = (): AuthenticationContextType => {
  const context = useContext(AuthenticationContext);
  if (!context) {
    throw new Error("useRealmAuth deve essere usato all’interno di RealmAuthProvider");
  }
  return context;
};
