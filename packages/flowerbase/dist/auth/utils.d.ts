export declare const LOGIN_SCHEMA: {
    body: {
        type: string;
        properties: {
            username: {
                type: string;
            };
            password: {
                type: string;
            };
        };
        required: string[];
    };
};
export declare const RESET_SCHEMA: {
    body: {
        type: string;
        properties: {
            email: {
                type: string;
            };
            password: {
                type: string;
            };
        };
        required: string[];
    };
};
export declare const CONFIRM_RESET_SCHEMA: {
    body: {
        type: string;
        properties: {
            password: {
                type: string;
            };
            token: {
                type: string;
            };
            tokenId: {
                type: string;
            };
        };
        required: string[];
    };
};
export declare const REGISTRATION_SCHEMA: {
    body: {
        type: string;
        properties: {
            email: {
                type: string;
            };
            password: {
                type: string;
            };
        };
        required: string[];
    };
};
export declare enum AUTH_ENDPOINTS {
    LOGIN = "/login",
    REGISTRATION = "/register",
    PROFILE = "/profile",
    SESSION = "/session",
    RESET = "/reset/call",
    CONFIRM_RESET = "/reset"
}
export declare enum AUTH_ERRORS {
    INVALID_CREDENTIALS = "Invalid credentials",
    INVALID_TOKEN = "Invalid refresh token provided",
    INVALID_RESET_PARAMS = "Invalid token or tokenId provided"
}
export interface AuthConfig {
    auth_collection?: string;
    'api-key': ApiKey;
    'local-userpass': LocalUserpass;
}
interface ApiKey {
    name: string;
    type: string;
    disabled: boolean;
}
interface LocalUserpass {
    name: string;
    type: string;
    disabled: boolean;
    config: Config;
}
export interface Config {
    autoConfirm: boolean;
    resetFunctionName: string;
    resetPasswordUrl: string;
    runConfirmationFunction: boolean;
    runResetFunction: boolean;
    mailConfig: {
        from: string;
        subject: string;
        mailToken: string;
    };
}
export interface CustomUserDataConfig {
    enabled: boolean;
    mongo_service_name: string;
    database_name: string;
    collection_name: string;
    user_id_field: string;
}
export declare const PROVIDER_TYPE = "local-userpass";
/**
 * > Loads the auth config json file
 * @testable
 */
export declare const loadAuthConfig: () => AuthConfig;
/**
 * > Loads the custom user data config json file
 * @testable
 */
export declare const loadCustomUserData: () => CustomUserDataConfig;
export declare const getMailConfig: (resetPasswordConfig: Config, token: string, tokenId: string) => {
    from: string;
    subject: string;
    mailToken: string;
    body: string;
};
export {};
//# sourceMappingURL=utils.d.ts.map