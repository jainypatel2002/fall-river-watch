"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/hooks/use-role";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useCreateGroupMutation, useGroupsQuery } from "@/lib/queries/groups";
import { createGroupSchema } from "@/lib/schemas/groups";
import { z } from "zod";

const formSchema = createGroupSchema;
type GroupFormValues = z.input<typeof formSchema>;

export function GroupForm() {
  const router = useRouter();
  const toast = useUiToast();
  const role = useRole();
  const groupsQuery = useGroupsQuery("");
  const createMutation = useCreateGroupMutation();

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      visibility: "public"
    }
  });
  const selectedVisibility = useWatch({ control: form.control, name: "visibility" });

  const ownedGroups = useMemo(() => {
    if (!role.user) return 0;
    return (groupsQuery.data?.groups ?? []).filter((group) => group.owner_user_id === role.user?.id).length;
  }, [groupsQuery.data?.groups, role.user]);

  const blockedByLimit = !role.isMod && ownedGroups >= 1;

  async function onSubmit(values: GroupFormValues) {
    if (blockedByLimit) {
      toast.error("Only one owned group is allowed", "Moderators can create unlimited groups.");
      return;
    }

    if (!window.confirm("Create this group?")) {
      return;
    }

    try {
      const payload = createGroupSchema.parse(values);
      const result = await createMutation.mutateAsync(payload);
      toast.success("Group created");
      router.push(`/groups/${result.group.slug}`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {blockedByLimit ? (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          You already own a group. Standard users can only own one group.
        </p>
      ) : null}

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="name">Group name</Label>
          <Input id="name" {...form.register("name")} />
          {form.formState.errors.name ? <p className="text-xs text-rose-300">{form.formState.errors.name.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={4} {...form.register("description")} />
          {form.formState.errors.description ? (
            <p className="text-xs text-rose-300">{form.formState.errors.description.message}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select value={selectedVisibility} onValueChange={(value) => form.setValue("visibility", value as "public" | "private")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending || blockedByLimit}>
            {createMutation.isPending ? "Creating..." : "Create group"}
          </Button>
        </div>
      </form>
    </div>
  );
}
