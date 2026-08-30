import {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  useId,
} from "react";
import { ChevronDown } from "lucide-react";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className = "", invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`ui-input ${invalid ? "ui-input-invalid" : ""} ${className}`}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className = "", invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`ui-input ui-textarea ${invalid ? "ui-input-invalid" : ""} ${className}`}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...props }, ref) {
  return (
    <span className="relative block">
      <select
        ref={ref}
        className={`ui-input cursor-pointer appearance-none pr-8 ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </span>
  );
});

/** Label + control + hint/error wrapper. Wires ids for screen readers. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = "",
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  return (
    <div className={className}>
      <label htmlFor={id} className="ui-label">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="ui-hint">{hint}</span>
      ) : null}
    </div>
  );
}
