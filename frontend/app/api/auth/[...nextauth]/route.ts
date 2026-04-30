/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { validateUser } from "@/lib/auth/users";

const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
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
        // Store the backend user data explicitly
        token.userId = user.id;
        token.userEmail = user.email;
        // Override NextAuth's default email (which comes from credentials input)
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
      return session;
    },
  },
};

const handler = NextAuth(authOptions as any);

export { handler as GET, handler as POST };
