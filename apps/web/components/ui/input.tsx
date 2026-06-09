import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const fieldClass =
  "min-h-10 w-full rounded-[7px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/76 px-3 text-sm text-[#5A6670] outline-none transition placeholder:text-[#5A6670]/36 focus:border-[#A8C8DC] focus:bg-white disabled:opacity-50";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${fieldClass} min-h-[96px] resize-none py-2 leading-6 ${className}`}
      {...props}
    />
  );
}
