import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
};

export const authClient = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft",
      opts?: SignInOptions,
    ) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: opts?.redirect_uri },
      });
      return { data, error, redirected: !error };
    },
  },
};
