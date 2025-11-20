import { redirect } from "next/navigation";

export default function Home() {
  // In development, allow access to chat without auth
  // In production, you can add auth check here
  redirect("/chat");
}
