/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { validateUser } from "@/lib/auth/users";

const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: any) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const user = await validateUser(credentials.email, credentials.password);
          return user; // returns { id, email } or null
        } catch (e) {
          return null;
        }
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        if (!token.userId) {
          // For OAuth providers like Google, find or create user in backend
          try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/auth/find-or-create`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: user.email }),
            });
            if (res.ok) {
              const backendUser = await res.json();
              token.userId = backendUser.id;
              token.userEmail = backendUser.email;
              console.log("✅ OAuth user created/found with UUID:", backendUser.id);
            } else {
              console.error("Failed to find or create user, status:", res.status);
              const errorData = await res.json().catch(() => ({}));
              console.error("Error details:", errorData);
            }
          } catch (e) {
            console.error("❌ Failed to find or create user:", e);
          }
        } else {
          // For credentials, already have backend user
          token.userId = user.id;
          token.userEmail = user.email;
          console.log("✅ Credentials user loaded with UUID:", user.id);
        }
        // Override NextAuth's default email
        token.email = user.email;
        token.name = user.email?.includes("@") ? user.email.split("@")[0] : user.email;
      }
      return token;
    },
    async session({ session, token }: any) {
      // Explicitly build session.user from our stored token fields
      session.user = {
        ...session.user,
        id: token.userId,
        email: token.userEmail,
        name: token.name || token.userEmail?.split("@")[0] || "User",
      };
      if (!session.user.id) {
        console.warn("⚠️ Session user missing UUID:", session.user);
      } else {
        console.log("✅ Session built with UUID:", session.user.id);
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions as any);

export { handler as GET, handler as POST };
