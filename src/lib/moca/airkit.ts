"use client";
/**
 * AIR Kit browser integration: login (smart account) and credential verification.
 *
 * Runs in the browser only (AirService.login() and verifyCredential() open a UI
 * dialog and generate the ZK proof client-side). The smart account address is
 * read through the EIP-1193 provider, so it works like any EVM wallet.
 *
 * Pairs with the server-side credential issuance in credential-client.ts and the
 * Partner JWT signing in airkit-jwt.ts.
 */
import { AirService, BUILD_ENV } from "@mocanetwork/airkit";

let service: AirService | null = null;

export async function getAirService(): Promise<AirService> {
  if (service) return service;
  const partnerId = process.env.NEXT_PUBLIC_AIRKIT_PARTNER_ID;
  if (!partnerId) throw new Error("NEXT_PUBLIC_AIRKIT_PARTNER_ID is not set");

  const svc = new AirService({ partnerId });
  await svc.init({ buildEnv: BUILD_ENV.SANDBOX, enableLogging: true });
  service = svc;
  return svc;
}

/** Read the logged-in smart account address via the EIP-1193 provider. */
export async function getSmartAccountAddress(svc?: AirService): Promise<string | null> {
  const s = svc ?? (await getAirService());
  try {
    const provider = s.getProvider();
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Open the AIR login dialog (if needed) and return the smart account address. */
export async function loginWithAir(): Promise<{ address: string | null; isLoggedIn: boolean }> {
  const svc = await getAirService();
  if (!svc.isLoggedIn) {
    await svc.login();
  }
  const address = await getSmartAccountAddress(svc);
  return { address, isLoggedIn: svc.isLoggedIn };
}

export async function logoutFromAir(): Promise<void> {
  const svc = await getAirService();
  // method name has varied across SDK betas; guard so a rename does not throw.
  await (svc as unknown as { logout?: () => Promise<void> }).logout?.();
}

/**
 * Verify a credential with a zero-knowledge proof. `authToken` is a Partner JWT
 * signed on the backend with scope "verify"; `programId` is the verification
 * program from the dashboard. The raw claim is never exposed, only the ZK result.
 */
export async function verifyAgentCredential(params: {
  authToken: string;
  programId: string;
  redirectUrl?: string;
}) {
  const svc = await getAirService();
  return svc.verifyCredential({
    authToken: params.authToken,
    programId: params.programId,
    redirectUrl: params.redirectUrl,
  });
}
