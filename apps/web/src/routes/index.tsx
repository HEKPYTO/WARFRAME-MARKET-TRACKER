import { Title } from "@solidjs/meta";
import { AppShell } from "~/components/layout";
import { DashboardShell } from "~/components/shell";
import { DashboardProvider } from "~/store/dashboard";

export default function Home() {
  return (
    <DashboardProvider>
      <Title>Warframe Market Tracker</Title>
      <AppShell>
        <DashboardShell />
      </AppShell>
    </DashboardProvider>
  );
}
