import { supabase } from "./supabase";

/* ============================================================
   Dupla — camada OPCIONAL.

   O app funciona inteiro sem isto. Nenhuma tela exige parceiro,
   nenhum fluxo trava esperando convite. Quem está sozinho não vê
   diferença nenhuma; quem tem parceiro ganha um seletor a mais no
   topo e leitura do progresso do outro.

   Três regras de design, cada uma vinda de um achado:

   - ASSÍNCRONA. Não existe "treinar junto", existe ver o progresso
     do outro. Acoplar agenda foi provavelmente parte do que afundou
     a adesão em Ohta et al. (2017), o único estudo que separou
     caminhada de musculação — e onde casais aderiram PIOR na
     musculação.

   - VISIBILIDADE OPT-IN DOS DOIS LADOS. share_enabled é do membro,
     não da dupla. Dá para desligar sem desfazer nada.

   - DEGRADAÇÃO SILENCIOSA. Parceiro que parou some da interface. Sem
     coluna vazia, sem "faz 12 dias que ele não treina". Controle
     social negativo gera reatância (Berli et al., 2021), e o
     contágio de exercício é assimétrico: é o menos ativo que puxa o
     mais ativo (Aral & Nicolaides, 2017).
   ============================================================ */

// Sem dupla → null. É o estado normal, não um erro.
export async function getMyDuo(profileId) {
  const { data: meu, error } = await supabase
    .from("duo_members")
    .select("duo_id, share_enabled")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!meu) return null;

  const { data: outros, error: e2 } = await supabase
    .from("duo_members")
    .select("profile_id, share_enabled, profiles ( id, display_name )")
    .eq("duo_id", meu.duo_id)
    .neq("profile_id", profileId);
  if (e2) throw e2;

  const outro = outros && outros[0];
  return {
    duoId: meu.duo_id,
    myShare: meu.share_enabled,
    partner: outro
      ? {
          id: outro.profile_id,
          name: outro.profiles?.display_name || "Parceiro",
          // Só posso LER o parceiro se ele deixou. Se desligou, a
          // interface simplesmente não oferece — sem aviso, sem cobrança.
          canRead: !!outro.share_enabled,
        }
      : null,
  };
}

// Liga/desliga a MINHA visibilidade para o parceiro.
export async function setMyShare(profileId, enabled) {
  const { error } = await supabase
    .from("duo_members")
    .update({ share_enabled: !!enabled })
    .eq("profile_id", profileId);
  if (error) throw error;
}

function novoToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// Cria o convite. Se ainda não houver dupla, cria a dupla também.
// Devolve o link pronto para colar no WhatsApp — que é por onde passa
// mais de 90% do tráfego de convite em apps móveis, segundo os
// benchmarks da Branch. Por isso link colável, não card social.
export async function createInvite(profileId) {
  let duoId;
  const { data: meu, error } = await supabase
    .from("duo_members").select("duo_id").eq("profile_id", profileId).maybeSingle();
  if (error) throw error;

  if (meu) {
    duoId = meu.duo_id;
    const { count, error: cErr } = await supabase
      .from("duo_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("duo_id", duoId);
    if (cErr) throw cErr;
    if ((count || 0) >= 2) throw new Error("Sua dupla já está completa.");
  } else {
    const { data: nova, error: dErr } = await supabase
      .from("duos").insert({}).select("id").single();
    if (dErr) throw dErr;
    duoId = nova.id;
    const { error: mErr } = await supabase
      .from("duo_members").insert({ duo_id: duoId, profile_id: profileId });
    if (mErr) throw mErr;
  }

  const token = novoToken();
  const { error: iErr } = await supabase
    .from("duo_invites").insert({ token, duo_id: duoId, created_by: profileId });
  if (iErr) throw iErr;

  return { token, url: `${window.location.origin}/?convite=${token}` };
}

// Aceitar roda no banco, não aqui: quem aceita ainda não é membro, então
// não consegue nem enxergar a dupla para se inserir nela. A função
// accept_duo_invite é SECURITY DEFINER e faz `select ... for update` no
// token — o mesmo cuidado contra corrida que o seed precisou quando o
// onAuthStateChange do Supabase disparou duas vezes no login.
export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc("accept_duo_invite", { p_token: token });
  if (error) throw error;
  return data;
}

// Sair desfaz a dupla dos dois lados: sem parceiro, dupla de um não é
// nada. Os dados de cada um continuam intactos — sair nunca apaga treino.
export async function leaveDuo(profileId) {
  const { data: meu, error } = await supabase
    .from("duo_members").select("duo_id").eq("profile_id", profileId).maybeSingle();
  if (error) throw error;
  if (!meu) return;
  const { error: dErr } = await supabase.from("duos").delete().eq("id", meu.duo_id);
  if (dErr) throw dErr;
}

// Lê ?convite=… da URL e limpa a barra de endereços, para o token não
// ficar no histórico do navegador nem ser recolado por engano.
export function pegarConviteDaURL() {
  const p = new URLSearchParams(window.location.search);
  const t = p.get("convite");
  if (t) window.history.replaceState({}, "", window.location.pathname);
  return t;
}
