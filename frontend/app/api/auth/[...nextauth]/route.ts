import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";

type ProviderId = "google" | "facebook";

type TokenExt = {
  provider?: ProviderId;
  id_token?: string;
  access_token?: string;
};

type SessionExt = {
  provider?: ProviderId;
  id_token?: string;
  access_token?: string;
};

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "openid email profile" } },
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "email public_profile" } },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, account }) {
      const t = token as unknown as TokenExt;

      if (account) {
        const p = (account.provider || "") as ProviderId;
        if (p === "google" || p === "facebook") t.provider = p;

        const idToken = (account as { id_token?: unknown }).id_token;
        if (typeof idToken === "string") t.id_token = idToken;

        const accessToken = (account as { access_token?: unknown }).access_token;
        if (typeof accessToken === "string") t.access_token = accessToken;
      }

      return token;
    },

    async session({ session, token }) {
      const s = session as unknown as SessionExt;
      const t = token as unknown as TokenExt;

      s.provider = t.provider;
      s.id_token = t.id_token;
      s.access_token = t.access_token;

      return session;
    },

    // evita warning de unused vars e mantém redirect seguro
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
});

export { handler as GET, handler as POST };