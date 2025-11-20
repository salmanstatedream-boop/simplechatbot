import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const supabase = createSupabaseClient();

  // Check if already logged in
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect("/chat");
    }
  } catch (error) {
    console.log("User check error (expected if not logged in)");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Property ChatBot</h1>
        <p className="text-gray-600 mb-8">
          Ask questions about properties using natural language
        </p>

        <div className="space-y-4">
          <p className="text-center text-gray-600 mb-6">
            Configure your Supabase authentication to enable login.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800">
            <p className="font-semibold mb-2">Setup Required:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Add Supabase credentials to .env.local</li>
              <li>Configure Auth providers in Supabase console</li>
              <li>Restart the development server</li>
            </ol>
          </div>

          <Link
            href="/chat"
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition text-center block"
          >
            Continue as Guest
          </Link>
        </div>

        <div className="mt-6 pt-6 border-t text-center text-sm text-gray-600">
          <p>
            For development, you can{" "}
            <span className="text-indigo-600 font-semibold">skip login</span> and
            explore the chatbot.
          </p>
        </div>
      </div>
    </div>
  );
}
