import { redirect } from "next/navigation";

// Root route hands off to the dashboard; middleware redirects to /login when
// there is no authenticated session.
export default function Home() {
  redirect("/dashboard");
}
