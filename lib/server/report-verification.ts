import type { SupabaseClient } from "@supabase/supabase-js";

export type VerificationStatus = "confirm" | "dispute" | null;

type VerificationResult =
  | {
      ok: true;
      incident_id: string;
      user_status: VerificationStatus;
      counts: {
        confirm: number;
        dispute: number;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type CountRow = {
  vote_type: "confirm" | "dispute";
};

export async function applyReportVerification({
  supabase,
  incidentId,
  userId,
  status
}: {
  supabase: Pick<SupabaseClient, "from">;
  incidentId: string;
  userId: string;
  status: VerificationStatus;
}): Promise<VerificationResult> {
  const { data: reportRow, error: reportError } = await supabase
    .from("reports")
    .select("id")
    .eq("id", incidentId)
    .maybeSingle();

  if (reportError) {
    return { ok: false, status: 500, error: reportError.message };
  }

  if (!reportRow) {
    return { ok: false, status: 404, error: "Incident not found" };
  }

  if (status === null) {
    const { error: deleteError } = await supabase
      .from("report_votes")
      .delete()
      .eq("report_id", incidentId)
      .eq("voter_id", userId);

    if (deleteError) {
      return { ok: false, status: 500, error: deleteError.message };
    }
  } else {
    const { error: upsertError } = await supabase.from("report_votes").upsert(
      {
        report_id: incidentId,
        voter_id: userId,
        vote_type: status
      },
      { onConflict: "report_id,voter_id" }
    );

    if (upsertError) {
      return { ok: false, status: 500, error: upsertError.message };
    }
  }

  const [{ count: confirmCount, error: confirmError }, { count: disputeCount, error: disputeError }] = await Promise.all([
    supabase
      .from("report_votes")
      .select("*", { count: "exact", head: true })
      .eq("report_id", incidentId)
      .eq("vote_type", "confirm"),
    supabase
      .from("report_votes")
      .select("*", { count: "exact", head: true })
      .eq("report_id", incidentId)
      .eq("vote_type", "dispute")
  ]);

  if (confirmError || disputeError) {
    return { ok: false, status: 500, error: confirmError?.message ?? disputeError?.message ?? "Failed to load vote counts" };
  }

  let userStatus: VerificationStatus = status;

  if (status === null) {
    userStatus = null;
  } else {
    const { data: userVoteRows, error: userVoteError } = await supabase
      .from("report_votes")
      .select("vote_type")
      .eq("report_id", incidentId)
      .eq("voter_id", userId)
      .limit(1);

    if (userVoteError) {
      return { ok: false, status: 500, error: userVoteError.message };
    }

    const voteRow = (userVoteRows ?? [])[0] as CountRow | undefined;
    userStatus = voteRow?.vote_type ?? null;
  }

  return {
    ok: true,
    incident_id: incidentId,
    user_status: userStatus,
    counts: {
      confirm: Number(confirmCount ?? 0),
      dispute: Number(disputeCount ?? 0)
    }
  };
}
