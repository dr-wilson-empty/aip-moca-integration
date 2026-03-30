import { NextRequest, NextResponse } from "next/server";
import { resolveDID, verifyDID } from "@/lib/identity/did";

export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get("did");
  const publicKey = request.nextUrl.searchParams.get("publicKey");

  if (!did) {
    return NextResponse.json(
      { error: "did query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const resolved = resolveDID(did);

    const response: Record<string, unknown> = {
      did,
      publicKey: resolved.publicKeyBase58,
      valid: true,
    };

    // Opsiyonel: publicKey parametresi verilmisse eslestirme yap
    if (publicKey) {
      response.matches = verifyDID(did, publicKey);
    }

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { did, valid: false, error: message },
      { status: 400 }
    );
  }
}
