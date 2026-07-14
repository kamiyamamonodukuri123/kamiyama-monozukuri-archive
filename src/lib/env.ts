export type AppEnv = {
  DATABASE_URL: string;
  DIRECT_URL?: string;
  SESSION_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_STORAGE_BUCKET: string;
};

function required(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function loadAppEnv(): AppEnv {
  return {
    DATABASE_URL: required("DATABASE_URL"),
    DIRECT_URL: process.env.DIRECT_URL,
    SESSION_SECRET: required("SESSION_SECRET"),
    SUPABASE_URL: required("SUPABASE_URL"),
    SUPABASE_ANON_KEY: required("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || "archive-media",
  };
}
