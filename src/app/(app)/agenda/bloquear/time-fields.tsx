"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui";

export function BlockTimeFields() {
  const [allDay, setAllDay] = useState(false);
  return (
    <>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
        <span className="font-medium">Dia inteiro</span>
      </label>
      {!allDay && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Das">
            <Input name="from" type="time" required defaultValue="12:00" step={300} />
          </Field>
          <Field label="Até">
            <Input name="to" type="time" required defaultValue="13:00" step={300} />
          </Field>
        </div>
      )}
    </>
  );
}
