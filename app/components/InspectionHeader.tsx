import Image from "next/image";

export default function InspectionHeader() {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 12,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Logo */}
        <div style={{ flexShrink: 0 }}>
          <Image
            src="/GlessingLOGO1.png"
            alt="Glessing Gaskets"
            width={120}
            height={60}
            onError={() => console.log("LOGO FAILED TO LOAD")}
          />
        </div>

        {/* Title */}
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Inspection Entry
        </h1>
      </div>
    </div>
  );
}
