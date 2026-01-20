import Image from "next/image";

export default function InspectionHeader() {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex-shrink-0">
          <Image
            src="/GlessingLOGO1.png"
            alt="Glessing Gaskets"
            width={120}
            height={60}
            priority
          />
        </div>

        {/* Title */}
        <div className="flex flex-col justify-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            Inspection Entry
          </h1>
        </div>
      </div>
    </div>
  );
}
