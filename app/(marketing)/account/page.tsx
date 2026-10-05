import { page } from "@/components/ui/page";
import { AccountView } from "./AccountView";

export const metadata = {
  title: "Account — The Project SKIN",
};

export default function AccountPage() {
  return (
    <main className={page}>
      <AccountView />
    </main>
  );
}
