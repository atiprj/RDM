import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireProjectAccess(url.searchParams.get("projectId"));
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;

  const { data, error } = await supabase
    .from("parameter_mappings")
    .select("db_column_name,revit_parameter_name,direction")
    .eq("project_id", projectId)
    .order("db_column_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  const ws = XLSX.utils.json_to_sheet(data ?? []);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mappings");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const bytes = new Uint8Array(out);

  return new NextResponse(bytes, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="mappings_proj_${projectId}.xlsx"`,
    },
  });
}

