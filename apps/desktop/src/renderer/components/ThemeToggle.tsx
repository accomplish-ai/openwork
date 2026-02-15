import { useTheme } from '../contexts/ThemeContext';
import { Moon, Sun, Monitor } from 'lucide-react'; // They likely have lucide-react

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-foreground">
        Appearance
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => setTheme('light')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
            theme === 'light'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-card-foreground border-border hover:bg-accent'
          }`}
        >
          <Sun className="w-4 h-4" />
          <span>Light</span>
        </button>
        
        <button
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
            theme === 'dark'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-card-foreground border-border hover:bg-accent'
          }`}
        >
          <Moon className="w-4 h-4" />
          <span>Dark</span>
        </button>
        
        <button
          onClick={() => setTheme('system')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
            theme === 'system'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-card-foreground border-border hover:bg-accent'
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>System</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {theme === 'system' 
          ? 'Theme follows your system preference' 
          : `Using ${theme} theme`}
      </p>
    </div>
  );
}