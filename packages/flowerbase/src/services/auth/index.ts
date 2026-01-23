import handleUserDeletion from "../../shared/handleUserDeletion"
import handleUserRegistration from "../../shared/handleUserRegistration"
import { AuthServiceType } from "./model"

const Auth: AuthServiceType = (app, opt) => {
    return {
        emailPasswordAuth: {
            registerUser: handleUserRegistration(app, opt),
            deleteUser: handleUserDeletion(app, opt)
        }
    }
}

export default Auth
