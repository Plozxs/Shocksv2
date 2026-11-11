import { Suspense } from "react";
import ShockLabDashboard from "@/components/ShockLabDashboard";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ShockLabDashboard />
    </Suspense>
  );
}
