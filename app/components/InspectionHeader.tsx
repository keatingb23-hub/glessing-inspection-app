import Image from "next/image";

export default function InspectionHeader() {
  return (
    <div style={{ marginBottom: 16 }}>
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
            width={110}
            height={55}
            priority
          />
        </div>

        {/* Title */}
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              margin: 0,
              color: "#0f172a",
            }}
          >
            Inspection Entry
          </h1>
        </div>
      </div>
    </div>
  );
}
