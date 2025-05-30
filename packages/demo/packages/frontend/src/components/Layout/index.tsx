import { Avatar } from "primereact/avatar";
import { Button } from "primereact/button";
import { NavLink, Outlet } from "react-router-dom";
import { APP_ROUTES } from "../../appRoutes";
import { useAuthentication } from "../../hooks/useAuthentication";

const authMenuItems = [
    { label: "Home", icon: "pi pi-home", to: APP_ROUTES.HOME },
];

const unAuthMenuItems = [
    { label: "Home", icon: "pi pi-home", to: APP_ROUTES.INDEX },
    { label: "Login", icon: "pi pi-sign-in", to: APP_ROUTES.LOGIN },
    { label: "Registration", icon: "pi pi-user-plus", to: APP_ROUTES.REGISTRATION },
];

export const Layout = () => {
    const { isLoggedIn, user, logout } = useAuthentication();

    const menuItems = isLoggedIn ? authMenuItems : unAuthMenuItems;

    return (
        <div style={{ display: "flex", height: "100vh", backgroundColor: "#191919", color: "white", width: "100vw" }}>
            {/* Sidebar */}
            <aside
                style={{
                    width: 260,
                    backgroundColor: "#191919",
                    display: "flex",
                    flexDirection: "column",
                    padding: "1.5rem 1rem",
                    boxSizing: "border-box",
                }}
            >
                <h2 style={{ margin: 0, marginBottom: "2rem", fontWeight: "bold", fontSize: "1.6rem" }}>
                    Flowerbase Demo
                </h2>

                <nav style={{ flexGrow: 1 }}>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {menuItems.map(({ label, icon, to }) => (
                            <li key={label} style={{ marginBottom: "1.25rem" }}>
                                <NavLink
                                    to={to}
                                    className={({ isActive }) => (isActive ? "active-menu-link" : "")}
                                    style={{
                                        color: "white",
                                        textDecoration: "none",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.75rem",
                                        fontSize: "1.1rem",
                                        fontWeight: 500,
                                    }}
                                >
                                    <i className={icon} />
                                    {label}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* Logout Button */}
                {isLoggedIn && (
                    <div style={{ marginTop: "auto", paddingTop: "2rem" }}>
                        <Button
                            label="Logout"
                            icon="pi pi-sign-out"
                            className="p-button-text p-button-sm"
                            style={{ color: "white" }}
                            onClick={logout}
                        />
                    </div>
                )}
            </aside>

            {/* Main content */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Header */}
                <header
                    style={{
                        height: 70,
                        backgroundColor: "#191919",
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        padding: "0 1.5rem",
                    }}
                >
                    {isLoggedIn && (
                        <Avatar
                            label={user?.profile.email?.[0]?.toUpperCase()}
                            shape="circle"
                            style={{ backgroundColor: "#1976d2", color: "white", cursor: "pointer" }}
                            size="large"
                            aria-label="User avatar"
                        />
                    )}
                </header>

                <main
                    style={{
                        backgroundColor: "#170F0F",
                        flex: 1,
                        borderTopLeftRadius: 24,
                        overflowY: "hidden",
                        backgroundImage: 'url(https://flower.stackhouse.dev/_next/static/media/background1.1bf7355d.png)',
                    }}
                >
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
