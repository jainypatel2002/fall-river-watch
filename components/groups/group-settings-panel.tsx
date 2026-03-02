"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUiToast } from "@/hooks/use-ui-toast";
import {
  useDeleteGroupMutation,
  useGroupDetailQuery,
  useToggleGroupVisibilityMutation,
  useUpdateGroupMutation
} from "@/lib/queries/groups";

type FormValues = {
  name: string;
  description: string;
};

export function GroupSettingsPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const toast = useUiToast();
  const detailQuery = useGroupDetailQuery(slug);
  const updateMutation = useUpdateGroupMutation(slug);
  const toggleVisibilityMutation = useToggleGroupVisibilityMutation(slug);
  const deleteMutation = useDeleteGroupMutation(slug);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      description: ""
    }
  });

  useEffect(() => {
    if (!detailQuery.data?.group) return;
    form.reset({
      name: detailQuery.data.group.name,
      description: detailQuery.data.group.description ?? ""
    });
  }, [detailQuery.data?.group, form]);

  if (detailQuery.isLoading) {
    return <p className="text-sm text-[color:var(--muted)]">Loading group settings...</p>;
  }

  if (!detailQuery.data) {
    return <p className="text-sm text-rose-200">Group not found.</p>;
  }

  if (!detailQuery.data.can_manage) {
    return <p className="text-sm text-rose-200">Only group managers and moderators can edit settings.</p>;
  }

  const { group } = detailQuery.data;
  const canDelete = confirmText.trim() === "DELETE";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          Group Settings
        </h1>
        <Link href={`/groups/${slug}`} className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to group
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await updateMutation.mutateAsync({
                  name: values.name,
                  description: values.description || null
                });
                toast.success("Group settings updated");
              } catch (error) {
                toast.error((error as Error).message);
              }
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register("name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={4} {...form.register("description")} />
            </div>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[color:var(--muted)]">Current visibility: {group.visibility}</p>
          <Button
            variant="outline"
            disabled={toggleVisibilityMutation.isPending}
            onClick={async () => {
              const nextVisibility = group.visibility === "public" ? "private" : "public";

              try {
                await toggleVisibilityMutation.mutateAsync(nextVisibility);
                toast.success(`Group is now ${nextVisibility}`);
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            Toggle to {group.visibility === "public" ? "private" : "public"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-rose-200">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => setDeleteOpen(true)}>
            Delete group
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleteMutation.isPending) return;
          setDeleteOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this group?</DialogTitle>
            <DialogDescription>This removes members, posts, and chat history. Type DELETE to confirm.</DialogDescription>
          </DialogHeader>

          <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="Type DELETE" />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canDelete || deleteMutation.isPending}
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync();
                  toast.success("Group deleted");
                  router.push("/groups");
                  router.refresh();
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Delete group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
