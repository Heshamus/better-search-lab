import { db } from "@/db/client";
import { requireAdminUser } from "@/lib/auth/session";
import { buildIntegrationsView } from "@/lib/config/view";
import { IntegrationsForm } from "@/components/integrations-form";
import { isDemoMode } from "@/lib/demo/mode";
import { DemoIntegrations } from "@/components/demo-integrations";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  await requireAdminUser();
  if (isDemoMode()) {
    return (
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Integrations</h2>
          <p className="text-xs text-neutral-500">In the demo every integration is simulated. Install your own copy to connect real accounts.</p>
        </div>
        <DemoIntegrations />
      </section>
    );
  }
  const view = await buildIntegrationsView(db);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Integrations</h2>
        <p className="text-xs text-neutral-500">
          Credentials are encrypted at rest and never shown again once saved. A value set in the environment wins over this page and shows as read-only.
        </p>
      </div>
      <IntegrationsForm view={view} />
    </section>
  );
}
