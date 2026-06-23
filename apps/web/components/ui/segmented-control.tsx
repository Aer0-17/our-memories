type Segment<T extends string> = {
  value: T;
  label: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: Readonly<{
  value: T;
  options: Segment<T>[];
  onChange: (value: T) => void;
}>) {
  return (
    <div className="inline-flex rounded-[8px] border border-dim/80 bg-cream/72 p-1 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
      {options.map((option) => (
        <button
          key={option.value}
          className={`rounded-[7px] px-3 py-2 text-xs font-semibold transition ${
            value === option.value
              ? "bg-sakura text-rose-ink"
              : "text-ink/58 hover:bg-mist/32"
          }`}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
