import { Suspense } from "react";
import RachasDashboard from "@/components/rachas/RachasDashboard";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RachasDashboard />
    </Suspense>
  );
}
