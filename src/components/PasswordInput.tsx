import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  toggleLabel?: string;
}

/**
 * Accessible password/secret input with an explicit Show/Hide toggle button.
 * Defaults to masked (`type="password"`) and never persists reveal state.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className = '', toggleLabel = 'password', ...rest }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative flex-1 min-w-0">
        <input
          ref={ref}
          {...rest}
          type={visible ? 'text' : 'password'}
          className={`${className} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? `Hide ${toggleLabel}` : `Show ${toggleLabel}`}
          aria-pressed={visible}
          title={visible ? `Hide ${toggleLabel}` : `Show ${toggleLabel}`}
          className="absolute inset-y-0 right-0 flex items-center justify-center px-2.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors cursor-pointer rounded-r-lg"
        >
          {visible ? (
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }
);
