"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, LoaderCircle, Trash2, TriangleAlert, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import { queryKeys } from "@/lib/queries/keys";
import { useReportDetailQuery } from "@/lib/queries/reports";
import { getPersonalInfoWarning, hasSuspiciousPersonalInfo } from "@/lib/utils/content-safety";
import { prettyCategory } from "@/lib/utils/format";

const MAX_TOTAL_MEDIA = 6;
const MAX_NEW_MEDIA = 3;

const editReportSchema = z.object({
  title: z.string().trim().max(120, "Keep the title under 120 characters").optional().or(z.literal("")),
  description: z
    .string()
    .trim()
    .min(20, "Add a bit more detail so neighbors can understand what happened.")
    .max(500, "Description is too long. Keep it under 500 characters.")
});

type EditReportValues = z.input<typeof editReportSchema>;
type ReportMediaItem = { id: string; storage_path: string; media_type: "image" };

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90);
}

export function EditReportForm({ reportId }: { reportId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();
  const uiToast = useUiToast();
  const detailQuery = useReportDetailQuery(reportId);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogMedia, setDeleteDialogMedia] = useState<ReportMediaItem | null>(null);
  const [isDeletingMediaId, setIsDeletingMediaId] = useState<string | null>(null);
  const [hydratedReportId, setHydratedReportId] = useState<string | null>(null);

  const form = useForm<EditReportValues>({
    resolver: zodResolver(editReportSchema),
    defaultValues: {
      title: "",
      description: ""
    }
  });

  const report = detailQuery.data?.report;
  const existingMedia = report?.media ?? [];

  useEffect(() => {
    if (!report) return;
    if (hydratedReportId === report.id) return;

    form.reset({
      title: report.title ?? "",
      description: report.description
    });
    setHydratedReportId(report.id);
  }, [form, hydratedReportId, report]);

  const previewUrls = useMemo(() => selectedFiles.map((file) => URL.createObjectURL(file)), [selectedFiles]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  function handleSelectFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!incoming.length) return;

    setSelectedFiles((previous) => {
      const remainingBatchSlots = Math.max(0, MAX_NEW_MEDIA - previous.length);
      const remainingTotalSlots = Math.max(0, MAX_TOTAL_MEDIA - (existingMedia.length + previous.length));
      const allowedCount = Math.min(remainingBatchSlots, remainingTotalSlots);
      const toAdd = incoming.slice(0, allowedCount);
      return [...previous, ...toAdd];
    });

    event.currentTarget.value = "";
  }

  async function onSubmit(values: EditReportValues) {
    if (!report) return;

    const parsed = editReportSchema.parse(values);
    if (report.category === "suspicious_activity" && hasSuspiciousPersonalInfo(parsed.description)) {
      form.setError("description", { type: "manual", message: getPersonalInfoWarning() });
      return;
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      uiToast.error("Please sign in to edit this report");
      router.push("/auth");
      return;
    }

    setIsSaving(true);
    const uploadedPaths: string[] = [];
    let storageRolledBack = false;

    try {
      const { error: updateError } = await supabase.rpc("update_report_content", {
        p_report_id: reportId,
        p_title: parsed.title ?? null,
        p_description: parsed.description
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      for (const file of selectedFiles) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = sanitizeFileName(`${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
        const storagePath = `${user.id}/${reportId}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from("report-media").upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        uploadedPaths.push(storagePath);
      }

      if (uploadedPaths.length) {
        const { error: mediaInsertError } = await supabase.from("report_media").insert(
          uploadedPaths.map((storagePath) => ({
            report_id: reportId,
            uploader_id: user.id,
            storage_path: storagePath,
            media_type: "image" as const
          }))
        );

        if (mediaInsertError) {
          await supabase.storage.from("report-media").remove(uploadedPaths);
          storageRolledBack = true;
          throw new Error(mediaInsertError.message);
        }
      }

      uiToast.success("Report updated");
      setSelectedFiles([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reportDetail(reportId) }),
        queryClient.invalidateQueries({ queryKey: ["reports"] })
      ]);
      router.push(`/report/${reportId}`);
      router.refresh();
    } catch (error) {
      if (uploadedPaths.length && !storageRolledBack) {
        await supabase.storage.from("report-media").remove(uploadedPaths);
      }
      uiToast.error(error instanceof Error ? error.message : "Failed to update report");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteMedia() {
    if (!deleteDialogMedia) return;

    const currentMedia = deleteDialogMedia;
    setIsDeletingMediaId(currentMedia.id);

    try {
      const { error: deleteError } = await supabase.from("report_media").delete().eq("id", currentMedia.id).eq("report_id", reportId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      const { error: storageError } = await supabase.storage.from("report-media").remove([currentMedia.storage_path]);
      if (storageError) {
        uiToast.info("Photo removed from report", "Storage cleanup may take a moment.");
      } else {
        uiToast.success("Photo removed");
      }

      setDeleteDialogMedia(null);
      await detailQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (error) {
      uiToast.error(error instanceof Error ? error.message : "Failed to remove photo");
    } finally {
      setIsDeletingMediaId(null);
    }
  }

  if (detailQuery.isLoading) {
    return <div className="shimmer h-48 rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)]" />;
  }

  if (detailQuery.error || !report) {
    return (
      <p className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-100">
        {(detailQuery.error as Error)?.message ?? "Report not found"}
      </p>
    );
  }

  if (!report.can_resolve) {
    return (
      <Card>
        <CardHeader>
          <CardTitle style={{ fontFamily: "var(--font-heading)" }}>Not authorized</CardTitle>
          <CardDescription>You can only edit reports you own unless you are admin or moderator.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/report/${reportId}`} className="text-sm text-[color:var(--muted)] underline underline-offset-4">
            Back to report
          </Link>
        </CardContent>
      </Card>
    );
  }

  const descriptionLength = form.watch("description")?.length ?? 0;
  const totalMediaCount = existingMedia.length + selectedFiles.length;
  const remainingBatchSlots = Math.max(0, MAX_NEW_MEDIA - selectedFiles.length);
  const remainingTotalSlots = Math.max(0, MAX_TOTAL_MEDIA - totalMediaCount);
  const selectableSlots = Math.min(remainingBatchSlots, remainingTotalSlots);
  const isBusy = isSaving || Boolean(isDeletingMediaId);

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle style={{ fontFamily: "var(--font-heading)" }}>Edit Report</CardTitle>
            <CardDescription>Update title, details, and photos. Location, category, severity, and votes stay unchanged.</CardDescription>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{prettyCategory(report.category)}</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input id="title" placeholder="Brief summary" {...form.register("title")} />
              {form.formState.errors.title ? <p className="text-xs text-rose-300">{form.formState.errors.title.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Describe any additional details." {...form.register("description")} />
              <p className="text-xs text-[color:var(--muted)]">{descriptionLength}/500</p>
              {report.category === "suspicious_activity" ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-100">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5" />
                  Suspicious activity reports cannot include phone numbers or street addresses.
                </div>
              ) : null}
              {form.formState.errors.description ? <p className="text-xs text-rose-300">{form.formState.errors.description.message}</p> : null}
            </div>

            <div className="space-y-3">
              <div>
                <Label>Existing photos</Label>
                <p className="text-xs text-[color:var(--muted)]">
                  {existingMedia.length} current photo{existingMedia.length === 1 ? "" : "s"}.
                </p>
              </div>

              {existingMedia.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {existingMedia.map((media) => {
                    const publicUrl = supabase.storage.from("report-media").getPublicUrl(media.storage_path).data.publicUrl;

                    return (
                      <div key={media.id} className="relative">
                        <img src={publicUrl} alt={`report-media-${media.id}`} className="h-28 w-full rounded-xl border border-[var(--border)] object-cover" />
                        <button
                          type="button"
                          className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[rgba(5,8,14,0.82)] text-rose-200 hover:text-rose-100 disabled:opacity-50"
                          onClick={() => setDeleteDialogMedia(media)}
                          disabled={isBusy}
                        >
                          {isDeletingMediaId === media.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          <span className="sr-only">Remove photo</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-3 text-sm text-[color:var(--muted)]">No photos attached.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-media">Add photos</Label>
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(10,15,28,0.6)] p-3">
                <label htmlFor="add-media" className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--fg)]">
                  <Camera className="h-4 w-4" />
                  Select up to {MAX_NEW_MEDIA} additional images
                </label>
                <input
                  id="add-media"
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-2 block w-full text-sm text-[color:var(--muted)]"
                  onChange={handleSelectFiles}
                  disabled={isBusy || selectableSlots === 0}
                />
                <p className="mt-2 text-xs text-[color:var(--muted)]">
                  Max {MAX_TOTAL_MEDIA} total photos per report. You can add {selectableSlots} more in this edit.
                </p>

                {previewUrls.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {previewUrls.map((url, index) => (
                      <div key={url} className="relative">
                        <img src={url} alt={`new-upload-preview-${index + 1}`} className="h-24 w-full rounded-xl border border-[var(--border)] object-cover" />
                        <button
                          type="button"
                          className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[rgba(5,8,14,0.82)] text-[var(--fg)]"
                          onClick={() => setSelectedFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index))}
                          disabled={isBusy}
                        >
                          <X className="h-3.5 w-3.5" />
                          <span className="sr-only">Remove selected photo</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/report/${reportId}`} className="text-sm text-[color:var(--muted)] underline underline-offset-4">
                Cancel
              </Link>
              <Button type="submit" disabled={isBusy} className="gap-2">
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(deleteDialogMedia)}
        onOpenChange={(open) => {
          if (!open && !isDeletingMediaId) {
            setDeleteDialogMedia(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this photo?</DialogTitle>
            <DialogDescription>This removes the photo from the report.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteDialogMedia(null)} disabled={Boolean(isDeletingMediaId)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDeleteMedia} disabled={Boolean(isDeletingMediaId)} className="gap-2">
              {isDeletingMediaId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              Remove Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
