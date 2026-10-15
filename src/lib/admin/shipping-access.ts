import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, expectedSessionToken } from "./session";
import { isReadOnlyPreview } from "@/lib/preview-mode";

/** Guard legacy fulfillment actions as well as the new shipping workflow. */
export async function shippingWriteError(req: NextRequest) {
  const expected = await expectedSessionToken();
  if (!expected || req.cookies.get(ADMIN_COOKIE)?.value !== expected) {
    return NextResponse.json(
      { errorMessage: "Not authenticated." },
      { status: 401 },
    );
  }
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json(
      { errorMessage: "Invalid request origin." },
      { status: 403 },
    );
  }
  if (isReadOnlyPreview()) {
    return NextResponse.json(
      { errorMessage: "Shipment changes are disabled in preview." },
      { status: 409 },
    );
  }
  return null;
}
