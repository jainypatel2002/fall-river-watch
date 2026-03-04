"use client";

import { useEffect, useMemo } from "react";
import { Camera, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function MediaUploader({
  files,
  onChange,
  maxFiles = 5,
  disabled = false
}: {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}) {
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  return (
    <section className="space-y-2">
      <Label htmlFor="gig-media-input">Photos (optional)</Label>
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(10,15,28,0.62)] p-3">
        <label htmlFor="gig-media-input" className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--fg)]">
          <Camera className="h-4 w-4" />
          Select up to {maxFiles} images
        </label>
        <input
          id="gig-media-input"
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          className="mt-2 block w-full text-sm text-[color:var(--muted)]"
          onChange={(event) => {
            const incoming = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
            const next = [...files, ...incoming].slice(0, maxFiles);
            onChange(next);
            event.currentTarget.value = "";
          }}
        />
        <p className="mt-2 text-xs text-[color:var(--muted)]">
          {files.length}/{maxFiles} selected
        </p>

        {previewUrls.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {previewUrls.map((url, index) => (
              <div key={url} className="relative">
                <img src={url} alt={`gig-upload-preview-${index + 1}`} className="h-24 w-full rounded-xl border border-[var(--border)] object-cover" />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-1 top-1 h-7 w-7"
                  disabled={disabled}
                  onClick={() => {
                    onChange(files.filter((_, fileIndex) => fileIndex !== index));
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="sr-only">Remove photo</span>
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
