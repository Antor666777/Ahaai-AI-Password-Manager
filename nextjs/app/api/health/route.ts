import { jsonOk } from "@/lib/http/responses";

export async function GET() {
  return jsonOk({
    status: "ok",
    service: "ahaai-password-manager",
    time: new Date().toISOString(),
  });
}
