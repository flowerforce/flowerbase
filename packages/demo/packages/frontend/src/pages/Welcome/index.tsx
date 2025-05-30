import React from "react";
import { motion, useAnimation } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";

const flowerbaseFeatures = [
  {
    title: "Realm-compatible schema",
    status: "✅ Supported (unchanged)",
    description: "Schema compatible with Realm to ensure easy migration and usage."
  },
  {
    title: "Authentication strategy",
    status: "✅ Local Email/Password only",
    description: "Authentication via local email and password—simple and secure."
  },
  {
    title: "OAuth / API Keys / etc.",
    status: "🚫 Not supported (for now)",
    description: "Currently, we do not support OAuth, API keys, or other authentication methods."
  },
  {
    title: "User data accessibility",
    status: "✅ Stored in your main DB",
    description: "User data is stored in the primary database without separate archives."
  },
  {
    title: "Device Sync",
    status: "🚫 Not supported (for now)",
    description: "Device synchronization is not yet supported."
  },
  {
    title: "Functions",
    status: "✅ Supported (unchanged)",
    description: "Full support for custom functions, just like in Realm."
  },
  {
    title: "Triggers",
    status: "✅ Supported (unchanged)",
    description: "Support for triggers that respond to database events."
  },
  {
    title: "HTTP Endpoints",
    status: "✅ Supported (unchanged)",
    description: "Built-in HTTP endpoints to interact with the backend."
  },
];

function FeatureItem({ title, status, description }: {title: string, status: string, description: string}) {
  const controls = useAnimation();
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

  React.useEffect(() => {
    if (inView) controls.start("visible");
  }, [controls, inView]);

  const variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={controls}
      variants={variants}
      style={{
        backgroundColor: "#222",
        borderRadius: 8,
        padding: 20,
        boxShadow: "0 2px 8px rgba(0,0,0,0.7)",
        color: "#eee",
        display: "flex",
        flexDirection: "column",
        minHeight: 180,
      }}
    >
      <h3>{title}</h3>
      <p style={{ fontWeight: "bold", margin: "5px 0", color: "#6ef27e" }}>{status}</p>
      <p style={{ flexGrow: 1 }}>{description}</p>
    </motion.div>
  );
}

export const Welcome = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        height: "100%",
        padding: "40px 20px",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        color: "#eee",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        style={{ textAlign: "center", marginBottom: 40 }}
      >
        Welcome to Flowerbase Demo
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.7 }}
        style={{ maxWidth: 600, margin: "0 auto 40px auto", textAlign: "center", color: "#ccc" }}
      >
        Flowerbase is a serverless-native MongoDB package designed for modern cloud applications. Explore its core features below.
      </motion.p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "20px",
          width: "100%",
          maxWidth: 1200,
        }}
      >
        {flowerbaseFeatures.map((feature, index) => (
          <FeatureItem
            key={index}
            title={feature.title}
            status={feature.status}
            description={feature.description}
          />
        ))}
      </div>

      <motion.div
        style={{ textAlign: "center", marginTop: 40 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 + flowerbaseFeatures.length * 0.2, duration: 0.5 }}
      >
        <button
          onClick={() => navigate("/login")}
          style={{
            backgroundColor: "#6ef27e",
            color: "#121212",
            border: "none",
            padding: "15px 40px",
            fontSize: "18px",
            borderRadius: "8px",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(110, 242, 126, 0.6)",
            fontWeight: "600",
            transition: "background-color 0.3s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#52c35a")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#6ef27e")}
        >
          Get Started
        </button>
      </motion.div>
    </div>
  );
};
