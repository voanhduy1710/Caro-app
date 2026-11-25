import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BOARD_THEMES, DEFAULT_THEME_SETTINGS, PIECE_THEMES } from './types';
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

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeSettings>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        // A style saved by an older or newer build may no longer exist.
        const parsed = JSON.parse(saved);
        if (!BOARD_THEMES.includes(parsed.boardTheme)) parsed.boardTheme = DEFAULT_THEME_SETTINGS.boardTheme;
        if (!PIECE_THEMES.includes(parsed.pieceTheme)) parsed.pieceTheme = DEFAULT_THEME_SETTINGS.pieceTheme;
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

  const setBoardTheme = useCallback((boardTheme: BoardTheme) => {
    setTheme((prev) => ({ ...prev, boardTheme }));
  }, []);

  const setPieceTheme = useCallback((pieceTheme: PieceTheme) => {
    setTheme((prev) => ({ ...prev, pieceTheme }));
  }, []);

  const setXColor = useCallback((xColor: string) => {
    setTheme((prev) => ({ ...prev, xColor }));
  }, []);

  const setOColor = useCallback((oColor: string) => {
    setTheme((prev) => ({ ...prev, oColor }));
  }, []);

  const setSelfSimulatedColor = useCallback((selfSimulatedColor: string) => {
    setTheme((prev) => ({ ...prev, selfSimulatedColor }));
  }, []);

  const setOpponentSimulatedColor = useCallback((opponentSimulatedColor: string) => {
    setTheme((prev) => ({ ...prev, opponentSimulatedColor }));
  }, []);

  const updateTheme = useCallback((newTheme: Partial<ThemeSettings>) => {
    setTheme((prev) => ({ ...prev, ...newTheme }));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setBoardTheme,
      setPieceTheme,
      setXColor,
      setOColor,
      setSelfSimulatedColor,
      setOpponentSimulatedColor,
      updateTheme,
    }),
    [theme, setBoardTheme, setPieceTheme, setXColor, setOColor, setSelfSimulatedColor, setOpponentSimulatedColor, updateTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
