type Props = {
  className?: string;
  /** Icon dimensions (tailwind h/w). */
  size?: "sm" | "md" | "lg" | "xl";
};

const dimMap = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
  xl: "h-6 w-6",
};

/**
 * Purple / fuchsia / violet sparkles for AI-powered actions (no client hooks — safe in RSC).
 */
export function AiMagicIcon({ className = "", size = "md" }: Props) {
  const dim = dimMap[size];

  return (
    <svg
      className={`${dim} shrink-0 ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#9333ea"
        d="M12 1.5l1.35 4.73 4.73 1.35-4.73 1.35L12 13.5l-1.35-4.57-4.73-1.35 4.73-1.35L12 1.5Z"
      />
      <path
        fill="#c026d3"
        d="M18.5 13.5l.65 2.28 2.28.65-2.28.65-.65 2.28-.65-2.28-2.28-.65 2.28-.65.65-2.28Z"
      />
      <path
        fill="#6366f1"
        d="M5 15.5l.5 1.75 1.75.5-1.75.5-.5 1.75-.5-1.75-1.75-.5 1.75-.5.5-1.75Z"
      />
      <path
        fill="#e879f9"
        opacity="0.9"
        d="M20.5 5.5l.35 1.2 1.2.35-1.2.35-.35 1.2-.35-1.2-1.2-.35 1.2-.35.35-1.2Z"
      />
    </svg>
  );
}
