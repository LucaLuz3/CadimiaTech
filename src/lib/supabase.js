import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Permite que o app carregue e mostre instruções mesmo antes de configurar o Supabase.
export const isConfigured = Boolean(url && anonKey && url.startsWith("http"));

export const supabase = isConfigured ? createClient(url, anonKey) : null;
