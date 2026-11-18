// Sends each role to its first screen after sign-in.
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, homeFor } from "@/lib/auth";

export default async function HomeRedirect() {
  const session = await getServerSession(authOptions);
  redirect(homeFor(session?.user?.role));
}
