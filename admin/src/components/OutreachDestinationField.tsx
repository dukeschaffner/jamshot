type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function OutreachDestinationField({ value, onChange }: Props) {
  return (
    <label>
      Redirect path (optional)
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/track/…"
      />
      <span className="muted">
        Site path such as /track/abc. Leave blank for the homepage.
      </span>
    </label>
  );
}
