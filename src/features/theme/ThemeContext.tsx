import React, { createContext, useContext, useState, useEffect } from 'react';
import { DEFAULT_THEME_SETTINGS } from './types';
import type { ThemeSettings, BoardTheme, PieceTheme } from './types';

interface ThemeContextType {
  theme: ThemeSettings;
  setBoardTheme: (theme: BoardTheme) => void;
  setPieceTheme: (theme: PieceTheme) => void;
  setXColor: (color: string) => void;
  setOColor: (color: string) => void;
  setSelfSimulatedColor: (color: string) => void;
  setOpponentSimulatedColor: (color: string) => void;
  updateTheme: (newTheme: Partial<ThemeSettings>) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'caro_app_theme_settings';

const VALID_BOARD_THEMES: BoardTheme[] = ['graph_paper', 'light_wood', 'laser_futuristic', 'classic_wood'];

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeSettings>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!VALID_BOARD_THEMES.includes(parsed.boardTheme)) {
          parsed.boardTheme = 'graph_paper';
        }
        return { ...DEFAULT_THEME_SETTINGS, ...parsed };
      }
      return DEFAULT_THEME_SETTINGS;
    } catch {
      return DEFAULT_THEME_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(theme));
    } catch (e) {
      console.warn('Failed to save theme settings to localStorage:', e);
    }
  }, [theme]);

  const setBoardTheme = (boardTheme: BoardTheme) => {
    setTheme((prev) => ({ ...prev, boardTheme }));
  };

  const setPieceTheme = (pieceTheme: PieceTheme) => {
    setTheme((prev) => ({ ...prev, pieceTheme }));
  };

  const setXColor = (xColor: string) => {
    setTheme((prev) => ({ ...prev, xColor }));
  };

  const setOColor = (oColor: string) => {
    setTheme((prev) => ({ ...prev, oColor }));
  };

  const setSelfSimulatedColor = (selfSimulatedColor: string) => {
    setTheme((prev) => ({ ...prev, selfSimulatedColor }));
  };

  const setOpponentSimulatedColor = (opponentSimulatedColor: string) => {
    setTheme((prev) => ({ ...prev, opponentSimulatedColor }));
  };

  const updateTheme = (newTheme: Partial<ThemeSettings>) => {
    setTheme((prev) => ({ ...prev, ...newTheme }));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setBoardTheme,
        setPieceTheme,
        setXColor,
        setOColor,
        setSelfSimulatedColor,
        setOpponentSimulatedColor,
        updateTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
