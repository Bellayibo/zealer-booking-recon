import { Suspense } from "react";
import { StatementContent } from "./_content";

export default function StatementPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <StatementContent />
    </Suspense>
  );
}
