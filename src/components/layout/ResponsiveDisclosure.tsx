import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import './responsive-disclosure.css';

/** Secondary controls stay visible on desktop and can be expanded on mobile. */
export function ResponsiveDisclosure({ label, children, className = '' }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return (
    <div className={`responsive-disclosure ${className}`} data-expanded={expanded}>
      <button type="button" className="responsive-disclosure-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}>
        <span>{label}</span><ChevronDown aria-hidden="true" />
      </button>
      <div id={contentId} className="responsive-disclosure-content">{children}</div>
    </div>
  );
}
