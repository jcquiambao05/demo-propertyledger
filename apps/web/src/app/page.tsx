import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, homeFor } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role) {
    redirect("/login");
  }
  redirect(homeFor(session.user.role));
}
