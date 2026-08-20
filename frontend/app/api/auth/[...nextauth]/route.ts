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
        } catch {
          return null;
        }
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, profile }: any) {
      if (user) {
        const resolvedEmail = user.email || profile?.email || token.userEmail || token.email;
        if (!token.userId) {
          // For OAuth providers like Google, find or create user in backend
          if (resolvedEmail) {
            try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/auth/find-or-create`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Internal-Auth": process.env.INTERNAL_AUTH_SECRET || process.env.NEXTAUTH_SECRET || "",
              },
              body: JSON.stringify({ email: resolvedEmail }),
            });
            if (res.ok) {
              const backendUser = await res.json();
              token.userId = backendUser.id;
              token.userEmail = backendUser.email;
              token.accessToken = backendUser.access_token;
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
            console.error("❌ OAuth profile did not include an email address");
          }
        } else {
          // For credentials, already have backend user
          if (user.id) token.userId = user.id;
          if (user.email) token.userEmail = user.email;
          if ((user as any).access_token) token.accessToken = (user as any).access_token;
          console.log("✅ User loaded with UUID:", token.userId);
        }
        // Override NextAuth's default email
        token.email = resolvedEmail;
        token.name = resolvedEmail?.includes("@") ? resolvedEmail.split("@")[0] : resolvedEmail || token.name;
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
        accessToken: token.accessToken,
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
