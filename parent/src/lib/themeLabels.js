import S from '../strings.js';

// Kept apart from the components so the header menu button doesn't pull ThemeControl into the first-load chunk.
export const THEME_LABEL = { auto: S.themeAuto, light: S.themeLight, dark: S.themeDark };
